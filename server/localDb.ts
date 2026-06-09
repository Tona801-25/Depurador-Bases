import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { AnalysisResult, CallRecord } from "@shared/schema";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "depurador-bases.sqlite");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeEstado(value?: string): string {
  return normalizeValue(value).replace(/\s/g, "");
}

function normalizeSubestado(value?: string): string {
  return normalizeValue(value).replace(/\s/g, "");
}

function isContactoEfectivo(record: CallRecord): boolean {
  const estado = normalizeEstado(record.estado);
  const subestado = normalizeSubestado(record.subestado);

  return estado === "answer" && subestado.includes("agent");
}

function getPrefijo(ani?: string): string {
  const clean = String(ani ?? "").replace(/\D/g, "");

  if (clean.startsWith("549")) return clean.slice(3, 6);
  if (clean.startsWith("54")) return clean.slice(2, 5);
  if (clean.length >= 3) return clean.slice(0, 3);

  return "";
}

function buildRecordHash(record: CallRecord): string {
  return sha256(
    [
      normalizeValue(record.ani),
      normalizeValue(record.fecha),
      normalizeValue(record.estado),
      normalizeValue(record.subestado),
      normalizeValue(record.base),
      normalizeValue(record.duracion),
      normalizeValue(record.conexion),
      normalizeValue(record.fin),
    ].join("|")
  );
}

function buildFileHash(_fileName: string, records: CallRecord[]): string {
  const recordHashes = records.map(buildRecordHash).sort();

  return sha256(
    [
      String(records.length),
      recordHashes[0] ?? "",
      recordHashes[recordHashes.length - 1] ?? "",
      sha256(recordHashes.join("|")),
    ].join("|")
  );
}

export function initLocalDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS imported_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL UNIQUE,
      fecha_archivo TEXT,
      uploaded_at TEXT NOT NULL,
      total_records INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS call_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_hash TEXT NOT NULL UNIQUE,
      file_id INTEGER,
      fecha TEXT,
      archivo_origen TEXT,
      fecha_archivo TEXT,
      ani TEXT NOT NULL,
      estado TEXT NOT NULL,
      subestado TEXT,
      base TEXT,
      prefijo TEXT,
      duracion INTEGER,
      is_contacto_efectivo INTEGER NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES imported_files(id)
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      scope TEXT NOT NULL,
      total_records INTEGER NOT NULL DEFAULT 0,
      total_anis INTEGER NOT NULL DEFAULT 0,
      pct_answer_agent REAL NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_call_records_fecha ON call_records(fecha);
    CREATE INDEX IF NOT EXISTS idx_call_records_ani ON call_records(ani);
    CREATE INDEX IF NOT EXISTS idx_call_records_base ON call_records(base);
    CREATE INDEX IF NOT EXISTS idx_call_records_estado_subestado ON call_records(estado, subestado);
    CREATE INDEX IF NOT EXISTS idx_call_records_prefijo ON call_records(prefijo);
    CREATE INDEX IF NOT EXISTS idx_imported_files_fecha_archivo ON imported_files(fecha_archivo);
  `);
}

export function saveAnalysisToLocalDb(analysis: AnalysisResult) {
  initLocalDb();

  const now = new Date().toISOString();

  const recordsByFile = new Map<string, CallRecord[]>();

  for (const record of analysis.rawRecords) {
    const fileName = record.archivoOrigen || "archivo_sin_nombre";

    if (!recordsByFile.has(fileName)) {
      recordsByFile.set(fileName, []);
    }

    recordsByFile.get(fileName)!.push(record);
  }

  const insertFile = db.prepare(`
    INSERT OR IGNORE INTO imported_files (
      file_name,
      file_hash,
      fecha_archivo,
      uploaded_at,
      total_records
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const getFileId = db.prepare(`
    SELECT id
    FROM imported_files
    WHERE file_hash = ?
  `);

  const insertRecord = db.prepare(`
    INSERT OR IGNORE INTO call_records (
      record_hash,
      file_id,
      fecha,
      archivo_origen,
      fecha_archivo,
      ani,
      estado,
      subestado,
      base,
      prefijo,
      duracion,
      is_contacto_efectivo,
      raw_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAnalysis = db.prepare(`
    INSERT OR REPLACE INTO analysis_runs (
      id,
      created_at,
      scope,
      total_records,
      total_anis,
      pct_answer_agent,
      result_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    let insertedRecords = 0;
    let duplicatedRecords = 0;
    let insertedFiles = 0;
    let duplicatedFiles = 0;

    Array.from(recordsByFile.entries()).forEach(([fileName, records]: [string, CallRecord[]]) => {
        const fileHash = buildFileHash(fileName, records);
        const fechaArchivo = records.find((record: CallRecord) => record.fechaArchivo)?.fechaArchivo || "";

      const fileResult = insertFile.run(
        fileName,
        fileHash,
        fechaArchivo,
        now,
        records.length
      );

      if (fileResult.changes > 0) {
        insertedFiles++;
      } else {
        duplicatedFiles++;
      }

      const fileRow = getFileId.get(fileHash) as { id: number } | undefined;
      const fileId = fileRow?.id ?? null;

      for (const record of records) {
        const recordHash = buildRecordHash(record);

        const recordResult = insertRecord.run(
          recordHash,
          fileId,
          record.fecha ?? null,
          record.archivoOrigen ?? fileName,
          record.fechaArchivo ?? null,
          record.ani,
          record.estado,
          record.subestado ?? null,
          record.base ?? null,
          getPrefijo(record.ani),
          typeof record.duracion === "number" ? record.duracion : null,
          isContactoEfectivo(record) ? 1 : 0,
          JSON.stringify(record),
          now
        );

        if (recordResult.changes > 0) {
          insertedRecords++;
        } else {
          duplicatedRecords++;
        }
      }
    });

    insertAnalysis.run(
      analysis.id,
      now,
      "upload",
      analysis.totalRecords,
      analysis.totalAnis,
      analysis.pctAnswer,
      JSON.stringify(analysis)
    );

    return {
      insertedFiles,
      duplicatedFiles,
      insertedRecords,
      duplicatedRecords,
    };
  });

  return transaction();
}

export function getLocalHistoryStats() {
  initLocalDb();

  const files = db
    .prepare(`SELECT COUNT(*) AS total FROM imported_files`)
    .get() as { total: number };

  const records = db
    .prepare(`SELECT COUNT(*) AS total FROM call_records`)
    .get() as { total: number };

  const anis = db
    .prepare(`SELECT COUNT(DISTINCT ani) AS total FROM call_records`)
    .get() as { total: number };

  const contactos = db
    .prepare(`
      SELECT COUNT(*) AS total
      FROM call_records
      WHERE is_contacto_efectivo = 1
    `)
    .get() as { total: number };

  const analyses = db
    .prepare(`SELECT COUNT(*) AS total FROM analysis_runs`)
    .get() as { total: number };

  return {
    dbPath: DB_PATH,
    totalFiles: files.total,
    totalRecords: records.total,
    totalAnis: anis.total,
    totalContactosEfectivos: contactos.total,
    totalAnalysisRuns: analyses.total,
  };
}

export function getImportedFiles(limit = 10) {
  initLocalDb();

  const safeLimit = Math.min(Math.max(limit, 1), 50);

  const rows = db
    .prepare(`
      SELECT
        id,
        file_name AS fileName,
        file_hash AS fileHash,
        fecha_archivo AS fechaArchivo,
        uploaded_at AS uploadedAt,
        total_records AS totalRecords
      FROM imported_files
      ORDER BY uploaded_at DESC, id DESC
      LIMIT ?
    `)
    .all(safeLimit) as Array<{
      id: number;
      fileName: string;
      fileHash: string;
      fechaArchivo: string | null;
      uploadedAt: string;
      totalRecords: number;
    }>;

  return rows;
}

export function deleteImportedFile(fileId: number) {
  initLocalDb();

  const file = db
    .prepare(`
      SELECT
        id,
        file_name AS fileName,
        total_records AS totalRecords
      FROM imported_files
      WHERE id = ?
    `)
    .get(fileId) as
    | {
        id: number;
        fileName: string;
        totalRecords: number;
      }
    | undefined;

  if (!file) {
    return {
      deleted: false,
      message: "No se encontró el archivo importado",
      deletedRecords: 0,
    };
  }

  const transaction = db.transaction(() => {
    const deletedRecordsResult = db
      .prepare(`
        DELETE FROM call_records
        WHERE file_id = ?
      `)
      .run(fileId);

    db.prepare(`
      DELETE FROM imported_files
      WHERE id = ?
    `).run(fileId);

    return {
      deleted: true,
      file,
      deletedRecords: deletedRecordsResult.changes,
    };
  });

  return transaction();
}