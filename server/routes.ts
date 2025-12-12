import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { storage, processCallRecords, generateCSV } from "./storage";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
            const content = file.buffer.toString("latin1");
            const result = Papa.parse(content, {
              header: true,
              skipEmptyLines: true,
              dynamicTyping: true,
            });
            records = result.data as Record<string, any>[];
          } else if (
            fileName.endsWith(".xlsx") ||
            fileName.endsWith(".xlsm") ||
            fileName.endsWith(".xlsb") ||
            fileName.endsWith(".xls")
          ) {
            const workbook = XLSX.read(file.buffer, { type: "buffer" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            records = XLSX.utils.sheet_to_json(worksheet);
          } else {
            console.warn(`Formato no soportado: ${fileName}`);
            continue;
          }

          allRecords.push(...records);
        } catch (parseError) {
          console.error(`Error parsing ${fileName}:`, parseError);
        }
      }

      if (allRecords.length === 0) {
        return res.status(400).json({ message: "No se pudieron leer datos de los archivos" });
      }

      const analysisResult = processCallRecords(allRecords);
      await storage.storeAnalysis(analysisResult);

      res.json(analysisResult);
    } catch (error) {
      console.error("Error processing upload:", error);
      res.status(500).json({ message: "Error interno al procesar los archivos" });
    }
  });

  app.post("/api/export/resumen", async (req, res) => {
    try {
      const { analysisId } = req.body;
      const analysis = await storage.getAnalysis(analysisId);

      if (!analysis) {
        return res.status(404).json({ message: "Análisis no encontrado" });
      }

      const data = analysis.aniSummaries.map((s) => ({
        ANI: s.ani,
        intentos_totales: s.intentosTotales,
        intentos_answer_agent: s.intentosAnswerAgent,
        intentos_answering_machine: s.intentosAnsweringMachine,
        intentos_no_answer: s.intentosNoAnswer,
        intentos_busy: s.intentosBusy,
        intentos_unallocated: s.intentosUnallocated,
        intentos_rejected: s.intentosRejected,
        primer_llamado: s.primerLlamado || "",
        ultimo_llamado: s.ultimoLlamado || "",
        tag_telefono: s.tagTelefono,
      }));

      const csv = generateCSV(data);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=resumen_por_ani.csv");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting resumen:", error);
      res.status(500).json({ message: "Error al exportar" });
    }
  });

  app.post("/api/export/filtrado", async (req, res) => {
    try {
      const { analysisId, tags } = req.body;
      const analysis = await storage.getAnalysis(analysisId);

      if (!analysis) {
        return res.status(404).json({ message: "Análisis no encontrado" });
      }

      const selectedTags = new Set(tags as string[]);
      const filteredAnis = new Set(
        analysis.aniSummaries
          .filter((s) => selectedTags.has(s.tagTelefono))
          .map((s) => s.ani)
      );

      const filteredRecords = analysis.rawRecords.filter((r) =>
        filteredAnis.has(r.ani)
      );

      const data = filteredRecords.map((r) => ({
        Fecha: r.fecha || "",
        Estado: r.estado,
        SubEstado: r.subestado || "",
        ANI: r.ani,
        Base: r.base || "",
        Duracion: r.duracion || "",
        Direccion: r.direccion || "",
      }));

      const csv = generateCSV(data);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=base_filtrada.csv");
      res.send(csv);
    } catch (error) {
      console.error("Error exporting filtrado:", error);
      res.status(500).json({ message: "Error al exportar" });
    }
  });

  app.post("/api/export/records", async (req, res) => {
    try {
      const { records, format } = req.body;

      const data = (records as any[]).map((r) => ({
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
        res.send(buffer);
      } else {
        const csv = generateCSV(data);
        const contentType = format === "txt" ? "text/plain" : "text/csv";
        const extension = format === "txt" ? "txt" : "csv";

        res.setHeader("Content-Type", `${contentType}; charset=utf-8`);
        res.setHeader("Content-Disposition", `attachment; filename=registros_filtrados.${extension}`);
        res.send(csv);
      }
    } catch (error) {
      console.error("Error exporting records:", error);
      res.status(500).json({ message: "Error al exportar" });
    }
  });

  app.get("/api/analyses", async (_req, res) => {
    try {
      const analyses = await storage.getAllAnalyses();
      res.json(analyses.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        uploadedAt: a.uploadedAt,
        totalRecords: a.totalRecords,
        totalAnis: a.totalAnis,
      })));
    } catch (error) {
      console.error("Error fetching analyses:", error);
      res.status(500).json({ message: "Error al obtener análisis" });
    }
  });

  app.get("/api/analysis/:id", async (req, res) => {
    try {
      const analysis = await storage.getAnalysis(req.params.id);
      if (!analysis) {
        return res.status(404).json({ message: "Análisis no encontrado" });
      }
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ message: "Error al obtener análisis" });
    }
  });

  return httpServer;
}
