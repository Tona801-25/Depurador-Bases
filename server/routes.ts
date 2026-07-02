import type { Express, Request, Response } from "express";
import type { Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import fs from "fs";
import path from "path";
import { Worker } from "node:worker_threads";
import { Readable } from "node:stream";

import { storage, processCallRecords, generateCSV, applyRecordFilters, computeAnalysisMeta } from "./storage";
import {
  deleteAllLocalHistory,
  deleteImportedFile,
  deleteTicketHistory,
  getAllHistoryRecords,
  getHistorySummaryForAnis,
  getImportedFiles,
  getGestionAnisForCatalog,
  getGestionCatalog,
  getLocalHistoryStats,
  getNeotelReportStats,
  getRecordsForImportedFile,
  getRecordsForImportedFiles,
  saveNeotelReport,
} from "./localDb";
import type { AnalysisResult, RecordsFilter } from "@shared/schema";
import type { LocalAniHistorySummary } from "./localDb";
import { randomUUID } from "crypto";
import { parseNeotelReport } from "./neotelReports.ts";
import {
  getNeotelFtpPublicStatus,
  syncNeotelReportsFromFtp,
} from "./neotelFtp.ts";

// Guardamos archivos temporales en disco para no cargar todo en RAM.
const UPLOAD_TMP_DIR = path.resolve(process.cwd(), "uploads_tmp");
const DEFAULT_NEOTEL_LOCAL_REPORTS_DIR =
  "C:\\Users\\Osar\\Desktop\\ANTONELLA\\BASES\\PRUEBAS APP ANTO";
const NEOTEL_REPORT_FILE_PATTERN =
  /^(Gestiones_todas|Productividad_Usuarios)_20\d{2}-\d{2}-\d{2}\.csv$/i;
const NEOTEL_TICKET_FILE_PATTERN = /\.(xls|xlsx)$/i;
const NEOTEL_LOCAL_REPORTS_DIR = path.resolve(
  process.env.NEOTEL_LOCAL_REPORTS_DIR || DEFAULT_NEOTEL_LOCAL_REPORTS_DIR,
);

if (!fs.existsSync(UPLOAD_TMP_DIR)) {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_TMP_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${Math.random().toString(16).slice(2)}_${safe}`);
    },
  }),
});

class UploadCancelledError extends Error {
  constructor() {
    super("Carga cancelada por el usuario");
    this.name = "UploadCancelledError";
  }
}

type UploadWorkerResult = {
  analysisResult: AnalysisResult;
  sqliteResult?: {
    insertedFiles: number;
    duplicatedFiles: number;
    insertedRecords: number;
    duplicatedRecords: number;
  };
  sqliteError?: string;
};

function runUploadWorker(
  files: Express.Multer.File[],
  signal: AbortSignal,
): Promise<UploadWorkerResult> {
  const workerPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(process.cwd(), "dist", "upload-worker.cjs")
      : path.resolve(process.cwd(), "server", "upload-worker.ts");

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        files: files.map((file) => ({
          path: file.path,
          originalName: file.originalname,
        })),
      },
      ...(process.env.NODE_ENV === "production"
        ? {}
        : { execArgv: ["--import", "tsx"] }),
    });

    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      callback();
    };

    const handleAbort = () => {
      void worker.terminate();
      finish(() => reject(new UploadCancelledError()));
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    worker.on("message", (message) => {
      if (message?.type === "success") {
        finish(() =>
          resolve({
            analysisResult: message.analysisResult,
            sqliteResult: message.sqliteResult,
            sqliteError: message.sqliteError,
          }),
        );
        return;
      }

      finish(() =>
        reject(new Error(message?.message || "Falló el procesamiento de la carga")),
      );
    });

    worker.on("error", (error) => finish(() => reject(error)));
    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        finish(() =>
          reject(new Error(`El proceso de carga terminó con código ${code}`)),
        );
      }
    });

    if (signal.aborted) handleAbort();
  });
}

function removeTemporaryUploads(files: Express.Multer.File[]) {
  for (const file of files) {
    try {
      if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (error) {
      console.warn(`No se pudo eliminar el temporal ${file.path}:`, error);
    }
  }
}

function toHistoryClientAnalysis(analysis: AnalysisResult): AnalysisResult & {
  clientDataMode: "summary";
} {
  return {
    ...analysis,
    aniSummaries: [],
    rawRecords: [],
    clientDataMode: "summary",
  };
}

function buildBaseFinalRows(rows: any[]) {
  return rows.map((s) => ({
    ANI: s.ani || "",
    BasePrincipal: s.basePrincipal || "",
    Prefijo: s.prefijo || "",
    TagTelefono: s.tagTelefono || "",
    ScoreRecontactabilidad: s.scoreRecontactabilidad ?? 0,
    Prioridad: s.prioridad || "",
    AccionSugerida: s.accionSugerida || "",
    Saturado: s.saturado ? "SI" : "NO",
    MejorFranja: s.mejorFranja || "",
    DiasDesdeUltimoIntento: s.diasDesdeUltimoIntento ?? "",
    IntentosTotales: s.intentosTotales || 0,
    IntentosUltimas24h: s.intentosUltimas24h ?? 0,
    IntentosUltimas48h: s.intentosUltimas48h ?? 0,
    UltimoEstado: s.ultimoEstadoNormalizado || "",
    UltimoSubestado: s.ultimoSubestadoNormalizado || "",
    MotivoDepuracion: s.motivoDepuracion || "",
  }));
}

function filtrarAniSummariesParaExportar(
  rows: any[],
  options: {
    aniList?: string[];
    segmento?: "BUZONES_SIN_CONTACTO";
    tags?: string[];
    prioridad?: string;
    accion?: string;
    soloSaturados?: boolean;
    scoreMinimo?: number | null;
    busqueda?: string;
  }
) {
  let filteredRows = [...rows];

  if (options.segmento === "BUZONES_SIN_CONTACTO") {
    return filteredRows.filter(
      (item) =>
        (item.intentosAnsweringMachine || 0) > 0 &&
        (item.intentosAnswerAgent || 0) === 0
    );
  }

  if (Array.isArray(options.aniList) && options.aniList.length > 0) {
    const selectedAnis = new Set(
      options.aniList
        .map((ani) => limpiarLineaNeotel(ani))
        .filter((ani) => ani.length > 0)
    );

    filteredRows = filteredRows.filter((item) =>
      selectedAnis.has(limpiarLineaNeotel(item.ani))
    );

    return filteredRows;
  }

  if (Array.isArray(options.tags) && options.tags.length > 0) {
    const selectedTags = new Set(options.tags);
    filteredRows = filteredRows.filter((item) => selectedTags.has(item.tagTelefono));
  }

  if (options.prioridad && options.prioridad !== "TODAS") {
    filteredRows = filteredRows.filter(
      (item) => (item.prioridad || "").toUpperCase() === options.prioridad
    );
  }

  if (options.accion && options.accion !== "TODAS") {
    filteredRows = filteredRows.filter(
      (item) => (item.accionSugerida || "").toUpperCase() === options.accion
    );
  }

  if (options.soloSaturados) {
    filteredRows = filteredRows.filter((item) => item.saturado === true);
  }

  if (typeof options.scoreMinimo === "number" && Number.isFinite(options.scoreMinimo)) {
    filteredRows = filteredRows.filter(
      (item) => (item.scoreRecontactabilidad ?? 0) >= Number(options.scoreMinimo)
    );
  }

  const textoBusqueda = (options.busqueda ?? "").trim().toLowerCase();

  if (textoBusqueda) {
    filteredRows = filteredRows.filter((item) =>
      [
        item.ani,
        item.basePrincipal,
        item.prefijo,
        item.mejorFranja,
        item.prioridad,
        item.accionSugerida,
        item.motivoDepuracion,
        item.ultimoEstadoNormalizado,
        item.ultimoSubestadoNormalizado,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(textoBusqueda))
    );
  }

  return filteredRows;
}

function limpiarLineaNeotel(value: unknown) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .trim();
}

const NEOTEL_HEADERS = [
  "LINEA",
  "RAZON SOCIAL",
  "DOCUMENTO",
  "DIRECCION del CLIENTE",
  "FECHA DE NACIMIENTO",
  "MERCADO ACTUAL",
  "PLAN ACTUAL",
  "PLAN SUGERIDO",
  "PRECIO",
  "FUENTE DE SOLICITUD",
  "LOCALIDAD",
  "CP",
];

function buildNeotelRows(rows: any[]) {
  const seen = new Set<string>();

  return rows
    .map((s) => limpiarLineaNeotel(s.ani))
    .filter((linea) => {
      if (!linea) return false;
      if (seen.has(linea)) return false;

      seen.add(linea);
      return true;
    })
    .map((linea) => ({
      LINEA: linea,
      "RAZON SOCIAL": "",
      DOCUMENTO: "",
      "DIRECCION del CLIENTE": "",
      "FECHA DE NACIMIENTO": "",
      "MERCADO ACTUAL": "",
      "PLAN ACTUAL": "",
      "PLAN SUGERIDO": "",
      PRECIO: "",
      "FUENTE DE SOLICITUD": "",
      LOCALIDAD: "",
      CP: "",
    }));
}

function buildNeotelWorksheet(rows: any[]) {
  const aoaRows = [
    NEOTEL_HEADERS,
    ...rows.map((row) => NEOTEL_HEADERS.map((header) => row[header] ?? "")),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoaRows);

  worksheet["!cols"] = NEOTEL_HEADERS.map((header) => ({
    wch: Math.max(header.length + 2, 14),
  }));

  return worksheet;
}

type FuzzionCategory =
  | "TODOS"
  | "NUNCA_TRABAJADO"
  | "CONTACTADO"
  | "BUZON_SIN_CONTACTO"
  | "NO_SATURADO"
  | "REINTENTAR_MEJOR_FRANJA"
  | "DESCARTAR";

type FuzzionLead = {
  rowNumber: number;
  linea: string;
  razonSocial: string;
  documento: string;
  mercadoActual: string;
  planActual: string;
  planSugerido: string;
  localidad: string;
  originalRow: Record<string, unknown>;
  intentosTotales: number;
  contactosEfectivos: number;
  buzones: number;
  noAnswer: number;
  invalidos: number;
  rechazados: number;
  ultimoLlamado: string;
  ultimoEstado: string;
  ultimoSubestado: string;
  bases: string[];
  categorias: FuzzionCategory[];
};

type FuzzionSession = {
  id: string;
  fileName: string;
  leads: FuzzionLead[];
  createdAt: number;
};

const fuzzionSessions = new Map<string, FuzzionSession>();

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getFuzzionValue(
  row: Record<string, unknown>,
  candidates: string[],
): unknown {
  const candidateSet = new Set(candidates.map(normalizeHeader));

  for (const [key, value] of Object.entries(row)) {
    if (candidateSet.has(normalizeHeader(key))) return value;
  }

  return "";
}

function getFuzzionText(
  row: Record<string, unknown>,
  candidates: string[],
) {
  return String(getFuzzionValue(row, candidates) ?? "").trim();
}

function classifyFuzzionLead(summary?: LocalAniHistorySummary) {
  const categories: FuzzionCategory[] = [];

  if (!summary || summary.intentosTotales === 0) {
    categories.push("NUNCA_TRABAJADO", "NO_SATURADO");
    return categories;
  }

  const contactado = summary.intentosAnswerAgent > 0;
  const descartar =
    summary.intentosUnallocated >= 3 ||
    (summary.intentosRejected >= 3 && !contactado);
  const saturado =
    summary.intentosTotales >= 9 ||
    summary.intentosNoAnswer >= 6 ||
    summary.intentosAnsweringMachine >= 5;

  if (contactado) categories.push("CONTACTADO");
  if (summary.intentosAnsweringMachine > 0 && !contactado) {
    categories.push("BUZON_SIN_CONTACTO");
  }
  if (!saturado) categories.push("NO_SATURADO");
  if (
    !contactado &&
    !descartar &&
    !saturado &&
    summary.intentosTotales > 0
  ) {
    categories.push("REINTENTAR_MEJOR_FRANJA");
  }
  if (descartar) categories.push("DESCARTAR");

  return categories;
}

function filterFuzzionLeads(
  leads: FuzzionLead[],
  category: FuzzionCategory,
  search = "",
) {
  const query = search.trim().toLowerCase();

  return leads.filter((lead) => {
    if (category !== "TODOS" && !lead.categorias.includes(category)) {
      return false;
    }

    if (!query) return true;

    return [
      lead.linea,
      lead.razonSocial,
      lead.documento,
      lead.mercadoActual,
      lead.planActual,
      lead.planSugerido,
      lead.localidad,
      ...lead.bases,
    ].some((value) => String(value).toLowerCase().includes(query));
  });
}

function buildFuzzionNeotelRows(leads: FuzzionLead[]) {
  const seen = new Set<string>();

  return leads
    .filter((lead) => {
      if (!lead.linea || seen.has(lead.linea)) return false;
      seen.add(lead.linea);
      return true;
    })
    .map((lead) => ({
      LINEA: lead.linea,
      "RAZON SOCIAL": lead.razonSocial,
      DOCUMENTO: lead.documento,
      "DIRECCION del CLIENTE": getFuzzionText(lead.originalRow, [
        "DIRECCION del CLIENTE",
        "DIRECCION",
      ]),
      "FECHA DE NACIMIENTO": getFuzzionText(lead.originalRow, [
        "FECHA DE NACIMIENTO",
        "FECHA NACIMIENTO",
      ]),
      "MERCADO ACTUAL": lead.mercadoActual,
      "PLAN ACTUAL": lead.planActual,
      "PLAN SUGERIDO": lead.planSugerido,
      PRECIO: getFuzzionText(lead.originalRow, ["PRECIO"]),
      "FUENTE DE SOLICITUD": getFuzzionText(lead.originalRow, [
        "FUENTE DE SOLICITUD",
      ]),
      LOCALIDAD: lead.localidad,
      CP: getFuzzionText(lead.originalRow, ["CP", "CODIGO POSTAL"]),
    }));
}

function extractFechaArchivoFromName(fileName: string): string | undefined {
  const normalized = fileName.trim();

  const compactDate = normalized.match(/(?:^|[^0-9])(\d{2})(\d{2})(20\d{2})(?:[^0-9]|$)/);
  if (compactDate) {
    const [, dd, mm, yyyy] = compactDate;
    return `${dd}/${mm}/${yyyy}`;
  }

  const separatedDate = normalized.match(/(?:^|[^0-9])(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})(?:[^0-9]|$)/);
  if (separatedDate) {
    const [, d, m, yyyy] = separatedDate;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }

  const isoDate = normalized.match(/(?:^|[^0-9])(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?:[^0-9]|$)/);
  if (isoDate) {
    const [, yyyy, m, d] = isoDate;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }

  return undefined;
}

function decodeDelimitedFile(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);

    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }

    return swapped.toString("utf16le");
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  const nullBytes = sample.reduce((total, byte) => total + (byte === 0 ? 1 : 0), 0);

  if (sample.length > 0 && nullBytes / sample.length > 0.15) {
    return buffer.toString("utf16le");
  }

  const utf8 = buffer.toString("utf8");
  const replacementChars = (utf8.match(/\uFFFD/g) || []).length;

  return replacementChars > 2 ? buffer.toString("latin1") : utf8;
}

function detectDelimiter(content: string): string {
  const headerLine =
    content
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0) || "";

  return ["\t", ";", ",", "|"]
    .map((delimiter) => ({
      delimiter,
      count: headerLine.split(delimiter).length - 1,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function getUsableCallRecords<T extends { ani?: string; estado?: string }>(
  records: T[]
): T[] {
  return records.filter(
    (record) => String(record.ani ?? "").trim() && String(record.estado ?? "").trim()
  );
}

function importNeotelReportBuffer(
  buffer: Buffer,
  fileName: string,
  source: "MANUAL" | "FTP",
  remotePath?: string,
) {
  const report = parseNeotelReport(buffer, fileName);
  const saved = saveNeotelReport(report, { source, remotePath });

  return {
    fileName,
    status: saved.duplicate ? "DUPLICADO" : "IMPORTADO",
    reportType: saved.reportType,
    importedRows: saved.importedRows,
    rejectedRows: saved.rejectedRows,
    warnings: report.warnings,
  };
}

function listFilesRecursive(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return entry.isFile() ? [fullPath] : [];
    });
}

function toLocalRelativePath(fullPath: string) {
  return path.relative(NEOTEL_LOCAL_REPORTS_DIR, fullPath).split(path.sep).join("/");
}

function toLocalUploadFile(fullPath: string): Express.Multer.File {
  return {
    fieldname: "localFile",
    originalname: toLocalRelativePath(fullPath),
    encoding: "7bit",
    mimetype: "application/vnd.ms-excel",
    destination: path.dirname(fullPath),
    filename: path.basename(fullPath),
    path: fullPath,
    size: fs.statSync(fullPath).size,
    stream: Readable.from([]),
    buffer: Buffer.alloc(0),
  } as Express.Multer.File;
}

function getLocalCompatibleFiles() {
  const allFiles = listFilesRecursive(NEOTEL_LOCAL_REPORTS_DIR).sort();
  const files = allFiles.flatMap((filePath) => {
    const name = path.basename(filePath);
    const isReport = NEOTEL_REPORT_FILE_PATTERN.test(name);
    const isTicket = NEOTEL_TICKET_FILE_PATTERN.test(filePath);
    if (!isReport && !isTicket) return [];

    const stat = fs.statSync(filePath);
    return [
      {
        relativePath: toLocalRelativePath(filePath),
        name,
        type: isReport ? "REPORT" : "TICKET",
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      },
    ];
  });

  return {
    files,
    skippedFiles: allFiles.length - files.length,
    reportFiles: files.filter((file) => file.type === "REPORT").length,
    ticketFiles: files.filter((file) => file.type === "TICKET").length,
  };
}

function resolveLocalCompatibleFile(relativePath: string) {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  const fullPath = path.resolve(NEOTEL_LOCAL_REPORTS_DIR, normalizedRelativePath);
  const rootWithSeparator = `${NEOTEL_LOCAL_REPORTS_DIR}${path.sep}`;

  if (
    fullPath !== NEOTEL_LOCAL_REPORTS_DIR &&
    !fullPath.startsWith(rootWithSeparator)
  ) {
    throw new Error("Ruta local fuera de la carpeta configurada.");
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error("El archivo local no existe.");
  }

  const name = path.basename(fullPath);
  const isReport = NEOTEL_REPORT_FILE_PATTERN.test(name);
  const isTicket = NEOTEL_TICKET_FILE_PATTERN.test(fullPath);
  if (!isReport && !isTicket) {
    throw new Error("El archivo no es compatible con la importacion local.");
  }

  return {
    fullPath,
    relativePath: toLocalRelativePath(fullPath),
    type: isReport ? "REPORT" : "TICKET",
  };
}

async function importLocalCompatibleFile(relativePath: string) {
  const file = resolveLocalCompatibleFile(relativePath);

  if (file.type === "REPORT") {
    return importNeotelReportBuffer(
      fs.readFileSync(file.fullPath),
      path.basename(file.fullPath),
      "MANUAL",
      file.fullPath,
    );
  }

  const cancellationController = new AbortController();
  const { sqliteResult, sqliteError } = await runUploadWorker(
    [toLocalUploadFile(file.fullPath)],
    cancellationController.signal,
  );

  return {
    fileName: file.relativePath,
    status:
      (sqliteResult?.insertedFiles ?? 0) > 0 ? "IMPORTADO" : "DUPLICADO",
    reportType: "TICKET",
    insertedFiles: sqliteResult?.insertedFiles ?? 0,
    duplicatedFiles: sqliteResult?.duplicatedFiles ?? 0,
    insertedRecords: sqliteResult?.insertedRecords ?? 0,
    duplicatedRecords: sqliteResult?.duplicatedRecords ?? 0,
    sqliteError,
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/neotel-sync/status", (_req, res) => {
    try {
      return res.json({
        ftp: getNeotelFtpPublicStatus(),
        localReportsDir: NEOTEL_LOCAL_REPORTS_DIR,
        stats: getNeotelReportStats(),
      });
    } catch (error) {
      return res.status(500).json({
        message: "No se pudo leer el estado de las fuentes Neotel.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/neotel-reports/local-files", (_req, res) => {
    try {
      if (!fs.existsSync(NEOTEL_LOCAL_REPORTS_DIR)) {
        return res.status(404).json({
          message: "No se encontro la carpeta local configurada.",
          detail: NEOTEL_LOCAL_REPORTS_DIR,
        });
      }

      return res.json({
        sourcePath: NEOTEL_LOCAL_REPORTS_DIR,
        ...getLocalCompatibleFiles(),
      });
    } catch (error) {
      return res.status(500).json({
        message: "No se pudo leer la carpeta local.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/neotel-reports/import-local-file", async (req, res) => {
    const relativePath = String(req.body?.relativePath ?? "").trim();
    if (!relativePath) {
      return res.status(400).json({ message: "Falta indicar el archivo local." });
    }

    try {
      const result = await importLocalCompatibleFile(relativePath);
      return res.json({
        result,
        historyStats: getLocalHistoryStats(),
        stats: getNeotelReportStats(),
      });
    } catch (error) {
      return res.status(422).json({
        message: "No se pudo importar el archivo local.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/neotel-reports/import-local", async (_req, res) => {
    try {
      if (!fs.existsSync(NEOTEL_LOCAL_REPORTS_DIR)) {
        return res.status(404).json({
          message: "No se encontro la carpeta local de reportes Neotel.",
          detail: NEOTEL_LOCAL_REPORTS_DIR,
        });
      }

      const localFiles = getLocalCompatibleFiles();
      const reportFiles = localFiles.files.filter((file) => file.type === "REPORT");
      const ticketFiles = localFiles.files.filter((file) => file.type === "TICKET");
      const { skippedFiles } = localFiles;

      if (reportFiles.length === 0 && ticketFiles.length === 0) {
        return res.status(422).json({
          message: "No hay reportes o tickets compatibles para importar.",
          detail: NEOTEL_LOCAL_REPORTS_DIR,
        });
      }

      const results: Array<Record<string, unknown>> = [];
      for (const file of localFiles.files) {
        try {
          results.push(await importLocalCompatibleFile(file.relativePath));
        } catch (error) {
          results.push({
            fileName: file.relativePath,
            status: "ERROR",
            reportType: file.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const imported = results.filter((result) => result.status === "IMPORTADO").length;
      const duplicates = results.filter((result) => result.status === "DUPLICADO").length;
      const errors = results.filter((result) => result.status === "ERROR").length;
      const insertedRecords = results.reduce(
        (total, result) => total + Number(result.insertedRecords ?? 0),
        0,
      );
      const duplicatedRecords = results.reduce(
        (total, result) => total + Number(result.duplicatedRecords ?? 0),
        0,
      );

      return res.status(errors === results.length ? 422 : 200).json({
        imported,
        duplicates,
        errors,
        reportFiles: reportFiles.length,
        ticketFiles: ticketFiles.length,
        skippedFiles,
        insertedRecords,
        duplicatedRecords,
        sourcePath: NEOTEL_LOCAL_REPORTS_DIR,
        results,
        historyStats: getLocalHistoryStats(),
        stats: getNeotelReportStats(),
      });
    } catch (error) {
      return res.status(500).json({
        message: "No se pudieron importar los reportes locales.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/neotel-reports/catalog", (_req, res) => {
    try {
      return res.json(getGestionCatalog());
    } catch (error) {
      return res.status(500).json({
        message: "No se pudo leer el catálogo de gestiones.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post(
    "/api/neotel-reports/upload",
    upload.array("files", 20),
    async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        return res.status(400).json({ message: "Seleccioná al menos un reporte." });
      }

      const results: Array<Record<string, unknown>> = [];

      try {
        for (const file of files) {
          try {
            results.push(importNeotelReportBuffer(
              fs.readFileSync(file.path),
              file.originalname,
              "MANUAL",
            ));
          } catch (error) {
            results.push({
              fileName: file.originalname,
              status: "ERROR",
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const imported = results.filter((result) => result.status === "IMPORTADO").length;
        const duplicates = results.filter((result) => result.status === "DUPLICADO").length;
        const errors = results.filter((result) => result.status === "ERROR").length;

        return res.status(errors === results.length ? 422 : 200).json({
          imported,
          duplicates,
          errors,
          results,
          stats: getNeotelReportStats(),
        });
      } finally {
        removeTemporaryUploads(files);
      }
    },
  );

  app.post("/api/neotel-sync/run", async (_req, res) => {
    try {
      const result = await syncNeotelReportsFromFtp(UPLOAD_TMP_DIR);
      return res.json({ ...result, stats: getNeotelReportStats() });
    } catch (error) {
      return res.status(503).json({
        message: "No se pudo sincronizar el FTP de Neotel.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/neotel-reports/catalog/export", (req, res) => {
    try {
      const rows = getGestionAnisForCatalog({
        resultado: String(req.body?.resultado ?? "").trim() || undefined,
        subresultado: String(req.body?.subresultado ?? "").trim() || undefined,
        accionComercial:
          String(req.body?.accionComercial ?? "").trim() || undefined,
      });

      if (rows.length === 0) {
        return res.status(422).json({
          message: "No hay ANIs para exportar con esa catalogación.",
        });
      }

      const neotelRows = rows.map((row) => ({
        LINEA: row.ani ?? "",
        "RAZON SOCIAL": row.titular ?? "",
        DOCUMENTO: row.dniCuit ?? "",
        "DIRECCION del CLIENTE": "",
        "FECHA DE NACIMIENTO": "",
        "MERCADO ACTUAL": "",
        "PLAN ACTUAL": "",
        "PLAN SUGERIDO": "",
        PRECIO: "",
        "FUENTE DE SOLICITUD": `${row.resultado ?? ""} - ${row.subresultado ?? ""}`,
        LOCALIDAD: row.localidad ?? "",
        CP: "",
      }));
      const worksheet = buildNeotelWorksheet(neotelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Contactos");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "biff8" });

      res.setHeader("Content-Type", "application/vnd.ms-excel");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=catalogacion_neotel.xls",
      );
      return res.send(buffer);
    } catch (error) {
      return res.status(500).json({
        message: "No se pudo exportar la catalogación.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/fuzzion/preview", upload.single("file"), async (req, res) => {
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ message: "Seleccioná un archivo de Fuzzión." });
    }

    try {
      const extension = path.extname(uploadedFile.originalname).toLowerCase();
      let rows: Record<string, unknown>[] = [];

      if (extension === ".csv" || extension === ".txt") {
        const content = decodeDelimitedFile(fs.readFileSync(uploadedFile.path));
        const parsed = Papa.parse<Record<string, unknown>>(content, {
          header: true,
          skipEmptyLines: true,
          delimiter: detectDelimiter(content),
        });
        rows = parsed.data;
      } else {
        const workbook = XLSX.read(fs.readFileSync(uploadedFile.path), {
          type: "buffer",
          cellDates: false,
          raw: false,
        });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: "",
          raw: false,
        });
      }

      const parsedRows = rows
        .map((row, index) => ({
          row,
          rowNumber: index + 2,
          linea: limpiarLineaNeotel(
            getFuzzionValue(row, [
              "LINEA",
              "ANI",
              "ANIS",
              "TELEFONO",
              "TELÉFONO",
              "DNI/TELEFONO",
            ]),
          ),
        }))
        .filter((item) => item.linea.length >= 7);

      if (parsedRows.length === 0) {
        return res.status(422).json({
          message:
            "No se encontró una columna LINEA o Ani con teléfonos válidos.",
        });
      }

      const history = getHistorySummaryForAnis(
        parsedRows.map((item) => item.linea),
      );

      const leads: FuzzionLead[] = parsedRows.map(({ row, rowNumber, linea }) => {
        const summary = history.get(linea);

        return {
          rowNumber,
          linea,
          razonSocial: getFuzzionText(row, [
            "RAZON SOCIAL",
            "NOMBRE",
            "APELLIDO Y NOMBRE",
          ]),
          documento: getFuzzionText(row, ["DOCUMENTO", "DNI"]),
          mercadoActual: getFuzzionText(row, [
            "MERCADO ACTUAL",
            "COMPAÑIA",
            "COMPANIA",
          ]),
          planActual: getFuzzionText(row, [
            "PLAN ACTUAL",
            "DEUDA/LINEAS/FECHA DE PORTACION",
            "DEUDA LINEAS FECHA DE PORTACION",
          ]),
          planSugerido: getFuzzionText(row, [
            "PLAN SUGERIDO",
            "PODES VENDER PLAN CORPORATIVO",
          ]),
          localidad: getFuzzionText(row, ["LOCALIDAD"]),
          originalRow: row,
          intentosTotales: summary?.intentosTotales ?? 0,
          contactosEfectivos: summary?.intentosAnswerAgent ?? 0,
          buzones: summary?.intentosAnsweringMachine ?? 0,
          noAnswer: summary?.intentosNoAnswer ?? 0,
          invalidos: summary?.intentosUnallocated ?? 0,
          rechazados: summary?.intentosRejected ?? 0,
          ultimoLlamado: summary?.ultimoLlamado ?? "",
          ultimoEstado: summary?.ultimoEstado ?? "",
          ultimoSubestado: summary?.ultimoSubestado ?? "",
          bases: summary?.bases ?? [],
          categorias: classifyFuzzionLead(summary),
        };
      });

      const session: FuzzionSession = {
        id: randomUUID(),
        fileName: uploadedFile.originalname,
        leads,
        createdAt: Date.now(),
      };
      fuzzionSessions.set(session.id, session);

      if (fuzzionSessions.size > 10) {
        const oldest = Array.from(fuzzionSessions.values()).sort(
          (a, b) => a.createdAt - b.createdAt,
        )[0];
        if (oldest) fuzzionSessions.delete(oldest.id);
      }

      const countCategory = (category: FuzzionCategory) =>
        leads.filter((lead) => lead.categorias.includes(category)).length;

      return res.json({
        id: session.id,
        fileName: session.fileName,
        totalRows: rows.length,
        validRows: leads.length,
        uniqueAnis: new Set(leads.map((lead) => lead.linea)).size,
        stats: {
          nuncaTrabajados: countCategory("NUNCA_TRABAJADO"),
          contactados: countCategory("CONTACTADO"),
          buzonesSinContacto: countCategory("BUZON_SIN_CONTACTO"),
          noSaturados: countCategory("NO_SATURADO"),
          reintentarMejorFranja: countCategory("REINTENTAR_MEJOR_FRANJA"),
          descartar: countCategory("DESCARTAR"),
        },
        preview: leads.slice(0, 250).map(({ originalRow, ...lead }) => lead),
      });
    } catch (error) {
      console.error("Error procesando base Fuzzión:", error);
      return res.status(500).json({
        message: "No se pudo procesar la base Fuzzión.",
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      fs.rmSync(uploadedFile.path, { force: true });
    }
  });

  app.post("/api/fuzzion/:id/export", async (req, res) => {
    const session = fuzzionSessions.get(req.params.id);
    if (!session) {
      return res.status(404).json({
        message: "La base Fuzzión ya no está disponible. Volvé a cargarla.",
      });
    }

    const category = String(req.body?.category || "TODOS") as FuzzionCategory;
    const search = String(req.body?.search || "");
    const allowedCategories: FuzzionCategory[] = [
      "TODOS",
      "NUNCA_TRABAJADO",
      "CONTACTADO",
      "BUZON_SIN_CONTACTO",
      "NO_SATURADO",
      "REINTENTAR_MEJOR_FRANJA",
      "DESCARTAR",
    ];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ message: "Filtro Fuzzión no válido." });
    }

    const filtered = filterFuzzionLeads(session.leads, category, search);
    const neotelRows = buildFuzzionNeotelRows(filtered);

    if (neotelRows.length === 0) {
      return res.status(422).json({
        message: "No hay líneas para exportar con este filtro.",
      });
    }

    const worksheet = buildNeotelWorksheet(neotelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contactos");
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "biff8",
    });

    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=fuzzion_${category.toLowerCase()}.xls`,
    );
    return res.send(buffer);
  });

  app.get("/api/history/stats", (_req, res) => {
    try {
      res.json(getLocalHistoryStats());
    } catch (error) {
      console.error("Error leyendo estadisticas SQLite:", error);

      res.status(500).json({
        ok: false,
        message: "Error al leer las estadisticas del historial local",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const clearTicketHistoryHandler = (_req: Request, res: Response) => {
    try {
      const result = deleteTicketHistory();
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("Error eliminando tickets locales:", error);
      res.status(500).json({
        ok: false,
        message: "Error al eliminar los tickets locales",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  app.delete("/api/history/clear-tickets", clearTicketHistoryHandler);
  const clearAllHistoryHandler = (_req: Request, res: Response) => {
    try {
      const result = deleteAllLocalHistory();

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      console.error("Error eliminando historial completo:", error);

      res.status(500).json({
        ok: false,
        message: "Error al eliminar el historial completo",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  app.delete("/api/history/clear-all", clearAllHistoryHandler);
  app.post("/api/history/clear-all", clearAllHistoryHandler);

  app.get("/api/history/files", (req, res) => {
    try {
      const limitParam = Number(req.query.limit);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 100;

      const files = getImportedFiles(limit);
      res.json(files);
    } catch (error) {
      console.error("Error leyendo archivos importados:", error);

      res.status(500).json({
        message: "Error al leer los archivos importados",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.delete("/api/history/files/:id", (req, res) => {
    try {
      const fileId = Number(req.params.id);

      if (!Number.isFinite(fileId) || fileId <= 0) {
        return res.status(400).json({
          message: "ID de archivo inválido",
        });
      }

      const result = deleteImportedFile(fileId);

      if (!result.deleted) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("Error eliminando archivo importado:", error);

      res.status(500).json({
        message: "Error al eliminar el archivo importado",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/history/files/:id/analyze", async (req, res) => {
  try {
    const fileId = Number(req.params.id);

    if (!Number.isFinite(fileId) || fileId <= 0) {
      return res.status(400).json({
        message: "ID de archivo inválido",
      });
    }

    const records = getUsableCallRecords(getRecordsForImportedFile(fileId));

    if (records.length === 0) {
      return res.status(422).json({
        message:
          "El ticket guardado no contiene llamadas válidas. Eliminá este historial y volvé a importar el archivo.",
      });
    }

    const analysisResult = processCallRecords(records);
    await storage.storeAnalysis(analysisResult);

    res.json(analysisResult);
  } catch (error) {
    console.error("Error analizando ticket histórico:", error);

    res.status(500).json({
      message: "Error al analizar el ticket histórico",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  });

    app.post("/api/history/analyze-selection", async (req, res) => {
    try {
      const fileIds = Array.isArray(req.body?.fileIds)
        ? req.body.fileIds.map((id: unknown) => Number(id))
        : [];
      const label =
        typeof req.body?.label === "string" && req.body.label.trim()
          ? req.body.label.trim()
          : "Seleccion de historial";

      if (fileIds.length === 0) {
        return res.status(400).json({
          message: "Selecciona al menos un ticket para analizar",
        });
      }

      const records = getUsableCallRecords(getRecordsForImportedFiles(fileIds));

      if (records.length === 0) {
        return res.status(404).json({
          message: "No hay registros guardados para el periodo seleccionado",
        });
      }

      const analysisResult = processCallRecords(records);
      await storage.storeAnalysis(analysisResult);

      const clientResult =
        records.length > 300000
          ? toHistoryClientAnalysis(analysisResult)
          : analysisResult;

      res.json({
        ...clientResult,
        fileName: label,
      });
    } catch (error) {
      console.error("Error analizando seleccion historica:", error);

      res.status(500).json({
        message: "Error al analizar la seleccion historica",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

    app.post("/api/history/analyze-all", async (_req, res) => {
    try {
      const records = getUsableCallRecords(getAllHistoryRecords());

      if (records.length === 0) {
        return res.status(404).json({
          message: "No hay registros guardados en SQLite para analizar",
        });
      }

      const analysisResult = processCallRecords(records);
      await storage.storeAnalysis(analysisResult);

      res.json(toHistoryClientAnalysis(analysisResult));
    } catch (error) {
      console.error("Error analizando historial completo:", error);

      res.status(500).json({
        message: "Error al analizar el historial completo",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 1) Upload a disco + procesamiento cancelable en worker + store.
  app.post("/api/upload", upload.array("files"), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const cancellationController = new AbortController();

    const cancelProcessing = () => {
      if (!res.writableEnded) cancellationController.abort();
    };

    req.once("aborted", cancelProcessing);
    res.once("close", cancelProcessing);

    try {
      if (files.length === 0) {
        return res.status(400).json({ message: "No se recibieron archivos" });
      }

      const { analysisResult, sqliteResult, sqliteError } =
        await runUploadWorker(files, cancellationController.signal);

      if (cancellationController.signal.aborted) {
        throw new UploadCancelledError();
      }

      await storage.storeAnalysis(analysisResult);

      if (sqliteResult) {
        console.log("Historial SQLite actualizado:", {
          archivosNuevos: sqliteResult.insertedFiles,
          archivosDuplicados: sqliteResult.duplicatedFiles,
          registrosNuevos: sqliteResult.insertedRecords,
          registrosDuplicados: sqliteResult.duplicatedRecords,
        });
      }

      if (sqliteError) {
        console.error(
          "No se pudo guardar en SQLite, pero el análisis sigue funcionando:",
          sqliteError,
        );
      }

      return res.json(analysisResult);
    } catch (error) {
      if (error instanceof UploadCancelledError) {
        console.log("Carga cancelada; se detuvo el worker y se limpiaron los temporales.");

        if (!res.headersSent && !res.destroyed) {
          return res.status(499).json({ message: error.message });
        }

        return;
      }

      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Error interno al procesar archivos";

      if (!res.headersSent && !res.destroyed) {
        return res.status(500).json({ message });
      }
    } finally {
      req.off("aborted", cancelProcessing);
      res.off("close", cancelProcessing);
      removeTemporaryUploads(files);
    }
  });

  // 2) Meta para poblar filtros del frontend
  app.get("/api/analysis/:id/meta", async (req, res) => {
    const analysis = await storage.getAnalysis(req.params.id);
    if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });
    res.json(computeAnalysisMeta(analysis));
  });

  // 3) Preview paginada de registros filtrados (sin traer todo)
  app.post("/api/analysis/:id/records/query", async (req, res) => {
    const analysis = await storage.getAnalysis(req.params.id);
    if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });

    const filters = (req.body?.filters || {}) as RecordsFilter;
    const offset = Number(req.body?.offset || 0);
    const limit = Math.min(Number(req.body?.limit || 500), 2000);

    const filtered = applyRecordFilters(analysis.rawRecords, filters);

    const answer = filtered.filter((r) => (r.estado || "").toUpperCase() === "ANSWER").length;
    const noAnswer = filtered.filter((r) => {
      const e = (r.estado || "").toUpperCase();
      return e === "NOANSWER" || e === "NO ANSWER";
    }).length;

    const page = filtered.slice(offset, offset + limit);
    res.json({ total: filtered.length, answer, noAnswer, records: page });
  });

  // 4) Export server-side: analysisId + filtros
  app.post("/api/export/records", async (req, res) => {
    const { analysisId, filters, format } = req.body as {
      analysisId: string;
      filters?: RecordsFilter;
      format: "csv" | "txt" | "xlsx";
    };

    const analysis = await storage.getAnalysis(analysisId);
    if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });

    const filteredRecords = applyRecordFilters(analysis.rawRecords, filters);

    if (filteredRecords.length === 0) {
      return res.status(422).json({
        message: "No hay registros para exportar con los filtros actuales",
      });
    }

    const data = filteredRecords.map((r) => ({
      Fecha: r.fecha || "",
      Estado: r.estado || "",
      SubEstado: r.subestado || "",
      ANI: r.ani || "",
      Base: r.base || "",
      Duracion: r.duracion || "",
      Direccion: r.direccion || "",
    }));

    if (format === "xlsx") {
      const header = ["Fecha", "Estado", "SubEstado", "ANI", "Base", "Duracion", "Direccion"];
      const worksheet = XLSX.utils.json_to_sheet(data, { header });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Registros");
      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
        compression: true,
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=registros_filtrados.xlsx");
      res.setHeader("Content-Length", String(buffer.length));
      return res.send(buffer);
    }

    const csv = generateCSV(data);
    res.setHeader("Content-Type", `${format === "txt" ? "text/plain" : "text/csv"}; charset=utf-8`);
    res.setHeader("Content-Disposition", `attachment; filename=registros_filtrados.${format}`);
    res.send(csv);
  });

  // 5) Export resumen por ANI (CSV)
  app.post("/api/export/resumen", async (req, res) => {
    const { analysisId } = req.body as { analysisId: string };
    const analysis = await storage.getAnalysis(analysisId);
    if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });

    const data = analysis.aniSummaries.map((summary) => ({
      ANI: summary.ani || "",
      IntentosTotales: summary.intentosTotales || 0,
      IntentosAnswerAgent: summary.intentosAnswerAgent || 0,
      IntentosAnsweringMachine: summary.intentosAnsweringMachine || 0,
      IntentosNoAnswer: summary.intentosNoAnswer || 0,
      IntentosBusy: summary.intentosBusy || 0,
      IntentosUnallocated: summary.intentosUnallocated || 0,
      IntentosRejected: summary.intentosRejected || 0,
      PrimerLlamado: summary.primerLlamado || "",
      UltimoLlamado: summary.ultimoLlamado || "",
      TagTelefono: summary.tagTelefono || "",
    }));

    const csv = generateCSV(data);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=resumen_por_ani.csv");
    res.send(csv);
  });

  app.post("/api/export/base-final", async (req, res) => {
  const {
    analysisId,
    tags,
    prioridad,
    accion,
    soloSaturados,
    scoreMinimo,
    busqueda,
  } = req.body as {
    analysisId: string;
    tags?: string[];
    prioridad?: string;
    accion?: string;
    soloSaturados?: boolean;
    scoreMinimo?: number | null;
    busqueda?: string;
  };

  const analysis = await storage.getAnalysis(analysisId);
  if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });

  let rows = [...analysis.aniSummaries];

  if (Array.isArray(tags)) {
    const selectedTags = new Set(tags);
    rows = rows.filter((item) => selectedTags.has(item.tagTelefono));
  }

  if (prioridad && prioridad !== "TODAS") {
    rows = rows.filter((item) => (item.prioridad || "").toUpperCase() === prioridad);
  }

  if (accion && accion !== "TODAS") {
    rows = rows.filter((item) => (item.accionSugerida || "").toUpperCase() === accion);
  }

  if (soloSaturados) {
    rows = rows.filter((item) => item.saturado === true);
  }

  if (typeof scoreMinimo === "number" && Number.isFinite(scoreMinimo)) {
    rows = rows.filter((item) => (item.scoreRecontactabilidad ?? 0) >= scoreMinimo);
  }

const textoBusqueda = (busqueda ?? "").trim().toLowerCase();

  if (textoBusqueda) {
    rows = rows.filter((item) =>
      [
        item.ani,
      item.basePrincipal,
      item.prefijo,
      item.mejorFranja,
      item.prioridad,
      item.accionSugerida,
      item.motivoDepuracion,
      item.ultimoEstadoNormalizado,
      item.ultimoSubestadoNormalizado,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(textoBusqueda))
  );
}

  if (rows.length === 0) {
    return res.status(400).json({
      message: "No hay líneas para exportar con los filtros actuales.",
    });
  }

  const csv = generateCSV(buildBaseFinalRows(rows));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=base_final_depurada.csv");
  res.send(csv);
});

  app.post("/api/export/neotel", async (req, res) => {
  const {
    analysisId,
    aniList,
    segmento,
    tags,
    prioridad,
    accion,
    soloSaturados,
    scoreMinimo,
    busqueda,
  } = req.body as {
    analysisId: string;
    aniList?: string[];
    segmento?: "BUZONES_SIN_CONTACTO";
    tags?: string[];
    prioridad?: string;
    accion?: string;
    soloSaturados?: boolean;
    scoreMinimo?: number | null;
    busqueda?: string;
  };

  const analysis = await storage.getAnalysis(analysisId);
  if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });

  const filteredRows = filtrarAniSummariesParaExportar(analysis.aniSummaries, {
  aniList,
  segmento,
  tags,
  prioridad,
  accion,
  soloSaturados,
  scoreMinimo,
  busqueda,
  });

  const neotelRows = buildNeotelRows(filteredRows);

  if (neotelRows.length === 0) {
    return res.status(400).json({
      message:
        "No hay líneas para exportar con los filtros actuales. Revisá la tabla de decisión por ANI.",
    });
  }

  const worksheet = buildNeotelWorksheet(neotelRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Contactos");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "biff8",
  });

  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", "attachment; filename=contactos_neotel_depurados.xls");
  res.send(buffer);
});

  app.post("/api/export/accion", async (req, res) => {
    const { analysisId, accion } = req.body as {
      analysisId: string;
      accion: string;
    };

    const analysis = await storage.getAnalysis(analysisId);
    if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });

    const rows = analysis.aniSummaries.filter(
      (item) => (item.accionSugerida || "").toUpperCase() === (accion || "").toUpperCase()
    );

    const csv = generateCSV(buildBaseFinalRows(rows));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=base_por_accion_${(accion || "sin_accion").toLowerCase()}.csv`
    );
    res.send(csv);
  });

  // 6) Export base filtrada por tags (CSV)
  app.post("/api/export/filtrado", async (req, res) => {
    const { analysisId, tags } = req.body as { analysisId: string; tags?: string[] };
    const analysis = await storage.getAnalysis(analysisId);
    if (!analysis) return res.status(404).json({ message: "Análisis no encontrado" });

    const selectedTags = new Set(tags || []);
    const anisFiltrados = new Set(
      analysis.aniSummaries
        .filter((summary) => selectedTags.has(summary.tagTelefono))
        .map((summary) => summary.ani)
    );
    const filteredRecords = analysis.rawRecords.filter((record) =>
      anisFiltrados.has(record.ani || "")
    );

    const data = filteredRecords.map((r) => ({
      Fecha: r.fecha || "",
      Estado: r.estado || "",
      SubEstado: r.subestado || "",
      ANI: r.ani || "",
      Base: r.base || "",
      Duracion: r.duracion || "",
      Direccion: r.direccion || "",
    }));

    const csv = generateCSV(data);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=base_filtrada.csv");
    res.send(csv);
  });

  return httpServer;
}
