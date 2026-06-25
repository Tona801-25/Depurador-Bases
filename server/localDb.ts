import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { AnalysisResult, CallRecord } from "@shared/schema";
import { extractPrefijoArgentina } from "@shared/prefijos";

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

function getRecordExtra(record: CallRecord, key: string): string | undefined {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getAnyRecordText(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const utcDate = new Date(ms);
  if (Number.isNaN(utcDate.getTime())) return null;

  return buildValidatedLocalDate(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate(),
    utcDate.getUTCHours(),
    utcDate.getUTCMinutes(),
    utcDate.getUTCSeconds()
  );
}

function buildValidatedLocalDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date | null {
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  const date = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(date.getTime())) return null;

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  return date;
}

function normalizeDateForStorage(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (typeof value === "number") {
    const date = value > 20000 ? excelSerialToDate(value) : null;
    return date?.toISOString();
  }

  const raw = String(value).trim().replace(/\s+/g, " ");
  if (!raw) return undefined;

  if (/^\d{8}$/.test(raw)) {
    const date = buildValidatedLocalDate(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)),
      Number(raw.slice(6, 8))
    );

    return date?.toISOString();
  }

  const numericString = raw.replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(numericString)) {
    const numericValue = Number(numericString);
    const date = numericValue > 20000 ? excelSerialToDate(numericValue) : null;
    return date?.toISOString();
  }

  const localMatch = raw.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*(AM|PM))?$/i
  );

  if (localMatch) {
    const [, firstStr, secondStr, yearStr, hourStr = "0", minuteStr = "0", secondStrValue = "0", meridian] =
      localMatch;
    const first = Number(firstStr);
    const second = Number(secondStr);
    const year = Number(yearStr.length === 2 ? `20${yearStr}` : yearStr);
    let hour = Number(hourStr);

    if (meridian) {
      const upperMeridian = meridian.toUpperCase();
      if (upperMeridian === "PM" && hour < 12) hour += 12;
      if (upperMeridian === "AM" && hour === 12) hour = 0;
    }

    const isMonthDay = first <= 12 && second > 12;
    const day = isMonthDay ? second : first;
    const month = isMonthDay ? first : second;
    const date = buildValidatedLocalDate(
      year,
      month,
      day,
      hour,
      Number(minuteStr),
      Number(secondStrValue)
    );

    return date?.toISOString();
  }

  const isoDate = new Date(raw);
  if (!Number.isNaN(isoDate.getTime())) return isoDate.toISOString();

  return raw;
}

function getFechaFromRecord(record: Record<string, unknown>): string | undefined {
  const value = getAnyRecordText(record, [
    "fecha",
    "Fecha",
    "FECHA",
    "fechaHora",
    "fecha_hora",
    "Fecha Hora",
    "FECHA HORA",
    "inicio",
    "Inicio",
    "INICIO",
    "fechaInicio",
    "fecha_inicio",
    "Fecha Inicio",
    "FECHA INICIO",
    "horaInicio",
    "hora_inicio",
    "Hora Inicio",
    "HORA INICIO",
    "callDate",
    "call_date",
    "Call Date",
    "CALL DATE",
    "startTime",
    "start_time",
    "Start Time",
    "START TIME",
  ]);

  return normalizeDateForStorage(value);
}

function formatFechaArchivo(value: unknown): string | undefined {
  const normalized = normalizeDateForStorage(value);
  if (!normalized) return undefined;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return undefined;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

function inferFechaArchivo(records: CallRecord[]): string | undefined {
  const explicitDate = records
    .map(
      (record) =>
        getRecordExtra(record, "fechaArchivo") ||
        getRecordExtra(record, "fecha_archivo")
    )
    .find((value) => Boolean(value?.trim()));

  if (explicitDate) return explicitDate;

  let earliestDate: Date | null = null;

  for (const record of records) {
    const normalized = getFechaFromRecord(record as Record<string, unknown>);
    if (!normalized) continue;

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) continue;

    if (!earliestDate || date.getTime() < earliestDate.getTime()) {
      earliestDate = date;
    }
  }

  return earliestDate ? formatFechaArchivo(earliestDate) : undefined;
}

function getPrefijo(ani?: string): string {
  const prefijo = extractPrefijoArgentina(ani);
  return prefijo === "00" ? "" : prefijo;
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

    CREATE TABLE IF NOT EXISTS local_db_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_call_records_fecha ON call_records(fecha);
    CREATE INDEX IF NOT EXISTS idx_call_records_ani ON call_records(ani);
    CREATE INDEX IF NOT EXISTS idx_call_records_base ON call_records(base);
    CREATE INDEX IF NOT EXISTS idx_call_records_estado_subestado ON call_records(estado, subestado);
    CREATE INDEX IF NOT EXISTS idx_call_records_prefijo ON call_records(prefijo);
    CREATE INDEX IF NOT EXISTS idx_imported_files_fecha_archivo ON imported_files(fecha_archivo);
  `);

  const migrationId = "backfill_imported_file_dates_v1";
  const migrationApplied = db
    .prepare(`SELECT 1 FROM local_db_migrations WHERE id = ?`)
    .get(migrationId);

  if (!migrationApplied) {
    const missingDates = db
      .prepare(`
        SELECT
          imported_files.id,
          MIN(call_records.fecha) AS first_record_date
        FROM imported_files
        INNER JOIN call_records ON call_records.file_id = imported_files.id
        WHERE TRIM(COALESCE(imported_files.fecha_archivo, '')) = ''
          AND TRIM(COALESCE(call_records.fecha, '')) <> ''
        GROUP BY imported_files.id
      `)
      .all() as Array<{ id: number; first_record_date: string | null }>;

    const updateFileDate = db.prepare(`
      UPDATE imported_files
      SET fecha_archivo = ?
      WHERE id = ?
        AND TRIM(COALESCE(fecha_archivo, '')) = ''
    `);

    const applyMigration = db.transaction(() => {
      for (const row of missingDates) {
        const inferredDate = formatFechaArchivo(row.first_record_date);
        if (inferredDate) {
          updateFileDate.run(inferredDate, row.id);
        }
      }

      db.prepare(`
        INSERT INTO local_db_migrations (id, applied_at)
        VALUES (?, ?)
      `).run(migrationId, new Date().toISOString());
    });

    applyMigration();
  }
}

export function saveAnalysisToLocalDb(analysis: AnalysisResult) {
  initLocalDb();

  const now = new Date().toISOString();

  const recordsByFile = new Map<string, CallRecord[]>();

  for (const record of analysis.rawRecords) {
    const archivoOrigen =
      getRecordExtra(record, "archivoOrigen") ||
      getRecordExtra(record, "archivo_origen") ||
      analysis.fileName ||
      "archivo_sin_nombre";

    if (!recordsByFile.has(archivoOrigen)) {
      recordsByFile.set(archivoOrigen, []);
    }

    recordsByFile.get(archivoOrigen)!.push(record);
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

  const updateMissingFileDate = db.prepare(`
    UPDATE imported_files
    SET fecha_archivo = ?
    WHERE id = ?
      AND TRIM(COALESCE(fecha_archivo, '')) = ''
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

    Array.from(recordsByFile.entries()).forEach(
      ([fileName, records]: [string, CallRecord[]]) => {
        const fileHash = buildFileHash(fileName, records);

        const fechaArchivo = inferFechaArchivo(records) || "";

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

        if (fileId && fechaArchivo) {
          updateMissingFileDate.run(fechaArchivo, fileId);
        }

        for (const record of records) {
          const recordHash = buildRecordHash(record);

          const archivoOrigen =
            getRecordExtra(record, "archivoOrigen") ||
            getRecordExtra(record, "archivo_origen") ||
            fileName;

          const fechaArchivoRecord =
            getRecordExtra(record, "fechaArchivo") ||
            getRecordExtra(record, "fecha_archivo") ||
            fechaArchivo;

          const recordResult = insertRecord.run(
            recordHash,
            fileId,
            getFechaFromRecord(record as Record<string, unknown>) ?? normalizeDateForStorage(record.fecha) ?? null,
            archivoOrigen,
            fechaArchivoRecord,
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
      }
    );

    const analysisSummary = {
      id: analysis.id,
      fileName: analysis.fileName,
      uploadedAt: analysis.uploadedAt,
      totalRecords: analysis.totalRecords,
      totalAnis: analysis.totalAnis,
      anisContactados: analysis.anisContactados,
      anisADepurar: analysis.anisADepurar,
      pctAnswer: analysis.pctAnswer,
      pctNoAnswer: analysis.pctNoAnswer,
      estadoDistribucion: analysis.estadoDistribucion,
      tagDistribucion: analysis.tagDistribucion,
      turnoDistribucion: analysis.turnoDistribucion,
      rangoDistribucion: analysis.rangoDistribucion,
      resumenEjecutivo: analysis.resumenEjecutivo,
    };

    insertAnalysis.run(
      analysis.id,
      now,
      "upload",
      analysis.totalRecords,
      analysis.totalAnis,
      analysis.pctAnswer,
      JSON.stringify(analysisSummary)
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

  const safeCount = (sql: string) => {
    try {
      const row = db.prepare(sql).get() as { total: number } | undefined;
      return row?.total ?? 0;
    } catch (error) {
      console.error("Error calculando estadística SQLite:", error);
      return 0;
    }
  };

  const totalFiles = safeCount(`
    SELECT COUNT(*) AS total
    FROM imported_files
  `);

  const totalRecords = safeCount(`
    SELECT COUNT(*) AS total
    FROM call_records
  `);

  const totalAnis = safeCount(`
    SELECT COUNT(DISTINCT ani) AS total
    FROM call_records
  `);

  const totalContactosEfectivos = safeCount(`
    SELECT COUNT(*) AS total
    FROM call_records
    WHERE LOWER(TRIM(estado)) = 'answer'
      AND LOWER(TRIM(COALESCE(subestado, ''))) LIKE '%agent%'
  `);

  const totalAnalysisRuns = safeCount(`
    SELECT COUNT(*) AS total
    FROM analysis_runs
  `);

  return {
    dbPath: DB_PATH,
    totalFiles,
    totalRecords,
    totalAnis,
    totalContactosEfectivos,
    totalAnalysisRuns,
  };
}

export function getImportedFiles(limit = 100) {
  initLocalDb();

  const safeLimit = Math.min(Math.max(limit, 1), 500);

  const rows = db
    .prepare(`
      SELECT
        id,
        file_name,
        file_hash,
        fecha_archivo,
        uploaded_at,
        total_records
      FROM imported_files
      ORDER BY uploaded_at DESC, id DESC
      LIMIT ?
    `)
    .all(safeLimit) as Array<{
      id: number;
      file_name: string;
      file_hash: string;
      fecha_archivo: string | null;
      uploaded_at: string;
      total_records: number;
    }>;

  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    fileHash: row.file_hash,
    fechaArchivo: row.fecha_archivo,
    uploadedAt: row.uploaded_at,
    totalRecords: row.total_records,
  }));
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

type StoredCallRecordRow = {
  raw_json: string;
  fecha: string | null;
  archivo_origen: string | null;
  fecha_archivo: string | null;
  ani: string;
  estado: string;
  subestado: string | null;
  base: string | null;
  prefijo: string | null;
  duracion: number | null;
};

function rowToCallRecord(row: StoredCallRecordRow): CallRecord {
  let parsed: Record<string, unknown> = {};

  try {
    parsed = JSON.parse(row.raw_json) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const fechaDetectada = getFechaFromRecord(parsed) || normalizeDateForStorage(row.fecha);

  return {
    ...parsed,
    fecha: fechaDetectada || row.fecha || undefined,
    archivoOrigen:
      typeof parsed.archivoOrigen === "string" && parsed.archivoOrigen.trim()
        ? parsed.archivoOrigen
        : row.archivo_origen ?? undefined,
    fechaArchivo:
      typeof parsed.fechaArchivo === "string" && parsed.fechaArchivo.trim()
        ? parsed.fechaArchivo
        : row.fecha_archivo ?? undefined,
    ani:
      typeof parsed.ani === "string" && parsed.ani.trim()
        ? parsed.ani
        : row.ani,
    estado:
      typeof parsed.estado === "string" && parsed.estado.trim()
        ? parsed.estado
        : row.estado,
    subestado:
      typeof parsed.subestado === "string" && parsed.subestado.trim()
        ? parsed.subestado
        : row.subestado ?? undefined,
    base:
      typeof parsed.base === "string" && parsed.base.trim()
        ? parsed.base
        : row.base ?? undefined,
    prefijo: getPrefijo(
      typeof parsed.ani === "string" && parsed.ani.trim() ? parsed.ani : row.ani,
    ),
    duracion:
      typeof parsed.duracion === "number"
        ? parsed.duracion
        : row.duracion ?? undefined,
  } as CallRecord;
}

export function getRecordsForImportedFile(fileId: number): CallRecord[] {
  initLocalDb();

  const rows = db
    .prepare(`
      SELECT
        call_records.raw_json,
        call_records.fecha,
        call_records.archivo_origen,
        COALESCE(
          NULLIF(call_records.fecha_archivo, ''),
          imported_files.fecha_archivo
        ) AS fecha_archivo,
        call_records.ani,
        call_records.estado,
        call_records.subestado,
        call_records.base,
        call_records.prefijo,
        call_records.duracion
      FROM call_records
      LEFT JOIN imported_files ON imported_files.id = call_records.file_id
      WHERE call_records.file_id = ?
      ORDER BY call_records.id ASC
    `)
    .all(fileId) as StoredCallRecordRow[];

  return rows.map(rowToCallRecord);
}

export function getRecordsForImportedFiles(fileIds: number[]): CallRecord[] {
  initLocalDb();

  const normalizedIds = Array.from(
    new Set(
      fileIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );

  if (normalizedIds.length === 0) return [];

  const placeholders = normalizedIds.map(() => "?").join(",");
  const rows = db
    .prepare(`
      SELECT
        call_records.raw_json,
        call_records.fecha,
        call_records.archivo_origen,
        COALESCE(
          NULLIF(call_records.fecha_archivo, ''),
          imported_files.fecha_archivo
        ) AS fecha_archivo,
        call_records.ani,
        call_records.estado,
        call_records.subestado,
        call_records.base,
        call_records.prefijo,
        call_records.duracion
      FROM call_records
      LEFT JOIN imported_files ON imported_files.id = call_records.file_id
      WHERE call_records.file_id IN (${placeholders})
      ORDER BY call_records.id ASC
    `)
    .all(...normalizedIds) as StoredCallRecordRow[];

  return rows.map(rowToCallRecord);
}

export function getAllHistoryRecords(): CallRecord[] {
  initLocalDb();

  const rows = db
    .prepare(`
      SELECT
        call_records.raw_json,
        call_records.fecha,
        call_records.archivo_origen,
        COALESCE(
          NULLIF(call_records.fecha_archivo, ''),
          imported_files.fecha_archivo
        ) AS fecha_archivo,
        call_records.ani,
        call_records.estado,
        call_records.subestado,
        call_records.base,
        call_records.prefijo,
        call_records.duracion
      FROM call_records
      LEFT JOIN imported_files ON imported_files.id = call_records.file_id
      ORDER BY call_records.id ASC
    `)
    .all() as StoredCallRecordRow[];

  return rows.map(rowToCallRecord);
}

export function deleteAllLocalHistory() {
  initLocalDb();

  const transaction = db.transaction(() => {
    const deletedRecords = db.prepare(`DELETE FROM call_records`).run();
    const deletedFiles = db.prepare(`DELETE FROM imported_files`).run();
    const deletedAnalyses = db.prepare(`DELETE FROM analysis_runs`).run();

    // Reinicia los IDs autoincrementales para que el historial arranque limpio.
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('call_records', 'imported_files')`).run();

    return {
      deleted: true,
      deletedRecords: deletedRecords.changes,
      deletedFiles: deletedFiles.changes,
      deletedAnalyses: deletedAnalyses.changes,
    };
  });

  return transaction();
}
