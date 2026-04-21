import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import fs from "fs";
import path from "path";

import { storage, processCallRecords, generateCSV, applyRecordFilters, computeAnalysisMeta } from "./storage";
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/health", (_req, res) => res.json({ ok: true }));

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
          let content = "";
          try {
            content = fs.readFileSync(file.path, { encoding: "utf8" });
          } catch {
            content = fs.readFileSync(file.path, { encoding: "latin1" });
          }

          const result = Papa.parse(content, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
          });

          records = result.data as Record<string, any>[];
        } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
          const buf = fs.readFileSync(file.path);
          const workbook = XLSX.read(buf, { type: "buffer" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          records = XLSX.utils.sheet_to_json(worksheet);
        } else {
          console.warn(`Formato no soportado: ${fileName}`);
          continue;
        }

        allRecords.push(...records);
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

    const analysisResult = processCallRecords(allRecords);
    await storage.storeAnalysis(analysisResult);

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

  const csv = generateCSV(buildBaseFinalRows(rows));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=base_final_depurada.csv");
  res.send(csv);
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