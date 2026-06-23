import type { Express, Request, Response } from "express";
import type { Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import fs from "fs";
import path from "path";

import { storage, processCallRecords, generateCSV, applyRecordFilters, computeAnalysisMeta } from "./storage";
import {
  deleteAllLocalHistory,
  deleteImportedFile,
  getAllHistoryRecords,
  getImportedFiles,
  getLocalHistoryStats,
  getRecordsForImportedFile,
  saveAnalysisToLocalDb,
} from "./localDb";
import type { RecordsFilter } from "@shared/schema";

// Guardamos archivos temporales en disco para no cargar todo en RAM.
const UPLOAD_TMP_DIR = path.resolve(process.cwd(), "uploads_tmp");
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/health", (_req, res) => res.json({ ok: true }));

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

      res.json(analysisResult);
    } catch (error) {
      console.error("Error analizando historial completo:", error);

      res.status(500).json({
        message: "Error al analizar el historial completo",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 1) Upload a disco + parseo + store (DEVOLVEMOS FULL)
  app.post("/api/upload", upload.array("files"), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No se recibieron archivos" });
    }

    const allRecords: Record<string, any>[] = [];

    for (const file of files) {
      const fileName = file.originalname.toLowerCase();
      let records: Record<string, any>[] = [];

      try {
        if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
          // ✅ Intento UTF-8 primero, fallback latin1
          const buffer = fs.readFileSync(file.path);
          const content = decodeDelimitedFile(buffer);
          const delimiter = detectDelimiter(content);

          const result = Papa.parse(content, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            delimiter,
            transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
          });

          records = result.data as Record<string, any>[];
} else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
  const buf = fs.readFileSync(file.path);
  const workbook = XLSX.read(buf, {
    type: "buffer",
    cellDates: true,
  });

  records = workbook.SheetNames.flatMap((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return [];
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
      defval: "",
      raw: false,
    });
    const cleanRows = sheetRows.filter((row) =>
      Object.values(row).some((value) => String(value ?? "").trim() !== "")
    );
    console.log(
      `Hoja "${sheetName}" leída: ${cleanRows.length.toLocaleString("es-AR")} registros`
    );
    return cleanRows;
  });

  console.log(
    `Archivo "${file.originalname}" procesado completo: ${workbook.SheetNames.length} hoja(s), ${records.length.toLocaleString("es-AR")} registros totales`
  );
} else {
          console.warn(`Formato no soportado: ${fileName}`);
          continue;
        }

        const archivoOrigen = file.originalname;
        const fechaArchivo =
          fileName.endsWith(".csv") || fileName.endsWith(".txt")
            ? undefined
            : extractFechaArchivoFromName(file.originalname);

        const recordsConMetadata = records.map((row) => ({
          ...row,
          __archivoOrigen: archivoOrigen,
          __fechaArchivo: fechaArchivo || "",
        }));

        for (const record of recordsConMetadata) {
          allRecords.push(record);
        }
      } finally {
        // Limpieza
        try {
          if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        } catch {}
      }
    }

    if (allRecords.length === 0) {
      return res.status(400).json({ message: "No se pudieron leer datos" });
    }

  const initialAnalysis = processCallRecords(allRecords);
  const usableRecords = initialAnalysis.rawRecords.filter(
    (record) => record.ani.trim() && record.estado.trim()
  );

  if (usableRecords.length === 0) {
    return res.status(400).json({
      message:
        "El archivo no parece ser un ticket de llamadas de Neotel. Debe incluir al menos ANI/Teléfono y Estado; para analizar horarios también debe incluir Inicio.",
    });
  }

  const analysisResult =
    usableRecords.length === initialAnalysis.rawRecords.length
      ? initialAnalysis
      : processCallRecords(usableRecords);

  await storage.storeAnalysis(analysisResult);

  try {
    const sqliteResult = saveAnalysisToLocalDb(analysisResult);

    console.log("Historial SQLite actualizado:", {
      archivosNuevos: sqliteResult.insertedFiles,
      archivosDuplicados: sqliteResult.duplicatedFiles,
      registrosNuevos: sqliteResult.insertedRecords,
      registrosDuplicados: sqliteResult.duplicatedRecords,
    });
  } catch (sqliteError) {
    console.error("No se pudo guardar en SQLite, pero el análisis sigue funcionando:", sqliteError);
  }

  // ✅ DEVOLVEMOS FULL (incluye rawRecords + prefijoPorHora)
  res.json(analysisResult);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno al procesar archivos" });
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
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Registros");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=registros_filtrados.xlsx");
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
