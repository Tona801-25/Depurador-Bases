import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { AnalysisResult, CallRecord } from "../shared/schema.ts";
import { extractPrefijoArgentina } from "../shared/prefijos.ts";
import type { ParsedNeotelReport } from "./neotelReports.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "depurador-bases.sqlite");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
let localDbInitialized = false;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export type LocalAniHistorySummary = {
  ani: string;
  intentosTotales: number;
  intentosAnswerAgent: number;
  intentosAnsweringMachine: number;
  intentosNoAnswer: number;
  intentosBusy: number;
  intentosUnallocated: number;
  intentosRejected: number;
  ultimoLlamado: string;
  ultimoEstado: string;
  ultimoSubestado: string;
  intentos24h: number;
  intentos7d: number;
  intentos14d: number;
  intentos30d: number;
  noAnswer7d: number;
  buzones14d: number;
  bases: string[];
  prefijos: string[];
};

export type LocalGestionSummary = {
  ani: string;
  resultado: string;
  subresultado: string;
  accionComercial: string;
  motivoAccion: string;
  ultimaGestion: string;
  catalogaciones: Array<{
    resultado: string;
    subresultado: string;
    accionComercial: string;
    ultimaGestion: string;
  }>;
  exclusionComercial: boolean;
  motivoExclusion: string;
};

export type LocalOperationLogEntry = {
  id: string;
  timestamp: number;
  kind: "analysis" | "export" | "filter" | "error";
  title: string;
  detail: string;
  count?: number;
};

export function getLocalDbHealth() {
  try {
    db.prepare(`SELECT 1 AS ok`).get();
    return { ok: true, detail: "SQLite disponible" };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function getCommercialExclusionReason(resultado: string, subresultado: string) {
  const value = `${resultado} ${subresultado}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (resultado.trim().toUpperCase() === "COMPRA") return "Compra registrada";
  if (value.includes("FRAUDE")) return "Catalogado como fraude";
  if (value.includes("CLIENTE MOLESTO")) return "Catalogado como cliente molesto";
  if (value.includes("DEUDA")) return "Catalogado con deuda";
  if (value.includes("ES PREPAGO")) return "Catalogado como prepago";
  if (value.includes("ES PERSONAL")) return "La linea ya pertenece a Personal";
  return "";
}
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
  if (localDbInitialized) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS imported_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL UNIQUE,
      fecha_archivo TEXT,
      uploaded_at TEXT NOT NULL,
      total_records INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS operation_log (
      id TEXT PRIMARY KEY,
      occurred_at_ms INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      record_count INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_operation_log_occurred_at
      ON operation_log (occurred_at_ms DESC);

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

    CREATE TABLE IF NOT EXISTS ani_history_summary (
      ani TEXT PRIMARY KEY,
      intentos_totales INTEGER NOT NULL DEFAULT 0,
      intentos_answer_agent INTEGER NOT NULL DEFAULT 0,
      intentos_answering_machine INTEGER NOT NULL DEFAULT 0,
      intentos_no_answer INTEGER NOT NULL DEFAULT 0,
      intentos_busy INTEGER NOT NULL DEFAULT 0,
      intentos_unallocated INTEGER NOT NULL DEFAULT 0,
      intentos_rejected INTEGER NOT NULL DEFAULT 0,
      ultimo_registro TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ani_history_bases (
      ani TEXT NOT NULL,
      base TEXT NOT NULL,
      PRIMARY KEY (ani, base)
    );

    CREATE TABLE IF NOT EXISTS ani_history_prefijos (
      ani TEXT NOT NULL,
      prefijo TEXT NOT NULL,
      PRIMARY KEY (ani, prefijo)
    );

    CREATE TABLE IF NOT EXISTS ani_history_cache_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_record_id INTEGER NOT NULL DEFAULT 0,
      total_records INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ani_history_hourly (
      ani TEXT NOT NULL,
      bucket_hour TEXT NOT NULL,
      intentos_totales INTEGER NOT NULL DEFAULT 0,
      intentos_answer_agent INTEGER NOT NULL DEFAULT 0,
      intentos_answering_machine INTEGER NOT NULL DEFAULT 0,
      intentos_no_answer INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ani, bucket_hour)
    ) WITHOUT ROWID;

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

    CREATE TABLE IF NOT EXISTS neotel_report_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL UNIQUE,
      report_type TEXT NOT NULL,
      report_date TEXT,
      source TEXT NOT NULL DEFAULT 'MANUAL',
      remote_path TEXT,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      rejected_rows INTEGER NOT NULL DEFAULT 0,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gestion_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_hash TEXT NOT NULL UNIQUE,
      import_id INTEGER NOT NULL,
      ts TEXT NOT NULL,
      report_date TEXT,
      base TEXT,
      id_lote TEXT,
      descripcion TEXT,
      id_contacto TEXT,
      titular TEXT,
      dni_cuit TEXT,
      ani TEXT NOT NULL,
      usuario TEXT,
      resultado TEXT,
      subresultado TEXT,
      cant_llamados INTEGER,
      precio TEXT,
      localidad TEXT,
      observaciones TEXT,
      duracion_llamadas TEXT,
      accion_comercial TEXT NOT NULL,
      motivo_accion TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      FOREIGN KEY (import_id) REFERENCES neotel_report_imports(id)
    );

    CREATE TABLE IF NOT EXISTS agent_productivity_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_hash TEXT NOT NULL UNIQUE,
      import_id INTEGER NOT NULL,
      report_date TEXT,
      usuario TEXT NOT NULL,
      usuario_id TEXT,
      login_seconds INTEGER NOT NULL DEFAULT 0,
      descanso_seconds INTEGER NOT NULL DEFAULT 0,
      administrative_seconds INTEGER NOT NULL DEFAULT 0,
      conversation_inbound_seconds INTEGER NOT NULL DEFAULT 0,
      conversation_outbound_seconds INTEGER NOT NULL DEFAULT 0,
      dialing_seconds INTEGER NOT NULL DEFAULT 0,
      idle_seconds INTEGER NOT NULL DEFAULT 0,
      connected_inbound INTEGER NOT NULL DEFAULT 0,
      connected_outbound INTEGER NOT NULL DEFAULT 0,
      not_connected_outbound INTEGER NOT NULL DEFAULT 0,
      metrics_json TEXT NOT NULL,
      FOREIGN KEY (import_id) REFERENCES neotel_report_imports(id)
    );

    CREATE INDEX IF NOT EXISTS idx_call_records_fecha ON call_records(fecha);
    CREATE INDEX IF NOT EXISTS idx_call_records_ani ON call_records(ani);
    CREATE INDEX IF NOT EXISTS idx_call_records_base ON call_records(base);
    CREATE INDEX IF NOT EXISTS idx_call_records_estado_subestado ON call_records(estado, subestado);
    CREATE INDEX IF NOT EXISTS idx_call_records_prefijo ON call_records(prefijo);
    CREATE INDEX IF NOT EXISTS idx_ani_history_bases_ani ON ani_history_bases(ani);
    CREATE INDEX IF NOT EXISTS idx_ani_history_prefijos_ani ON ani_history_prefijos(ani);
    CREATE INDEX IF NOT EXISTS idx_ani_history_hourly_bucket ON ani_history_hourly(bucket_hour);
    CREATE INDEX IF NOT EXISTS idx_imported_files_fecha_archivo ON imported_files(fecha_archivo);
    CREATE INDEX IF NOT EXISTS idx_neotel_report_imports_type_date ON neotel_report_imports(report_type, report_date);
    CREATE INDEX IF NOT EXISTS idx_gestion_records_ani ON gestion_records(ani);
    CREATE INDEX IF NOT EXISTS idx_gestion_records_ts ON gestion_records(ts);
    CREATE INDEX IF NOT EXISTS idx_gestion_records_catalog ON gestion_records(resultado, subresultado);
    CREATE INDEX IF NOT EXISTS idx_gestion_records_action ON gestion_records(accion_comercial);
    CREATE INDEX IF NOT EXISTS idx_gestion_records_report_date ON gestion_records(report_date);
    CREATE INDEX IF NOT EXISTS idx_gestion_records_date_catalog ON gestion_records(report_date, resultado, subresultado);
    CREATE INDEX IF NOT EXISTS idx_productivity_report_user ON agent_productivity_records(report_date, usuario_id);
  `);

  const operationLogBackfillId = "operation_log_backfill_analysis_runs_v1";
  const operationLogBackfillApplied = db
    .prepare(`SELECT 1 FROM local_db_migrations WHERE id = ?`)
    .get(operationLogBackfillId);

  if (!operationLogBackfillApplied) {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const previousRuns = db.prepare(`
      SELECT id, created_at, scope, total_records, total_anis
      FROM analysis_runs
      ORDER BY created_at DESC
      LIMIT 10
    `).all() as Array<{
      id: string;
      created_at: string;
      scope: string;
      total_records: number;
      total_anis: number;
    }>;

    const insertRecoveredLog = db.prepare(`
      INSERT OR IGNORE INTO operation_log (
        id, occurred_at_ms, kind, title, detail, record_count
      )
      VALUES (?, ?, 'analysis', ?, ?, ?)
    `);

    const applyOperationLogBackfill = db.transaction(() => {
      for (const run of previousRuns) {
        const timestamp = new Date(run.created_at).getTime();
        if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;

        const scopeLabel =
          run.scope === "history"
            ? "Historial completo"
            : run.scope === "file"
              ? "Ticket guardado"
              : "Carga de archivos";

        insertRecoveredLog.run(
          `analysis-run:${run.id}`,
          timestamp,
          "Análisis previo recuperado",
          `${scopeLabel} · ${run.total_anis.toLocaleString("es-AR")} ANIs`,
          run.total_records,
        );
      }

      db.prepare(`
        INSERT INTO local_db_migrations (id, applied_at)
        VALUES (?, ?)
      `).run(operationLogBackfillId, new Date().toISOString());
    });

    applyOperationLogBackfill();
  }

  const operationLogTrimBackfillId = "operation_log_trim_recovered_v1";
  const operationLogTrimBackfillApplied = db
    .prepare(`SELECT 1 FROM local_db_migrations WHERE id = ?`)
    .get(operationLogTrimBackfillId);

  if (!operationLogTrimBackfillApplied) {
    const trimRecoveredLogs = db.transaction(() => {
      db.prepare(`
        DELETE FROM operation_log
        WHERE id LIKE 'analysis-run:%'
          AND id NOT IN (
            SELECT id
            FROM operation_log
            WHERE id LIKE 'analysis-run:%'
            ORDER BY occurred_at_ms DESC
            LIMIT 10
          )
      `).run();

      db.prepare(`
        INSERT INTO local_db_migrations (id, applied_at)
        VALUES (?, ?)
      `).run(operationLogTrimBackfillId, new Date().toISOString());
    });

    trimRecoveredLogs();
  }

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

  const aniSummaryMigrationId = "ani_history_summary_v1";
  const applyAniSummaryMigration = db.transaction(() => {
    const alreadyApplied = db
      .prepare(`SELECT 1 FROM local_db_migrations WHERE id = ?`)
      .get(aniSummaryMigrationId);
    if (alreadyApplied) return;

    db.prepare(`
      INSERT OR REPLACE INTO ani_history_summary (
        ani,
        intentos_totales,
        intentos_answer_agent,
        intentos_answering_machine,
        intentos_no_answer,
        intentos_busy,
        intentos_unallocated,
        intentos_rejected,
        ultimo_registro
      )
      SELECT
        ani,
        COUNT(*),
        SUM(is_contacto_efectivo),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'ANSWER'
              AND (
                UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%MACHINE%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%ANSWERING%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%BUZON%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%VOICEMAIL%'
              )
            THEN 1 ELSE 0
          END
        ),
        SUM(
          CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'NOANSWER'
            THEN 1 ELSE 0 END
        ),
        SUM(
          CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'BUSY'
            THEN 1 ELSE 0 END
        ),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'UNALLOCATED'
              OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) = 'UNALLOCATED'
            THEN 1 ELSE 0
          END
        ),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'REJECTED'
              OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) = 'REJECTED'
            THEN 1 ELSE 0
          END
        ),
        COALESCE(MAX(
          CASE
            WHEN TRIM(COALESCE(fecha, '')) <> ''
            THEN fecha || CHAR(31) || PRINTF('%020d', id) || CHAR(31)
              || COALESCE(estado, '') || CHAR(31) || COALESCE(subestado, '')
            ELSE NULL
          END
        ), '')
      FROM call_records NOT INDEXED
      WHERE TRIM(COALESCE(ani, '')) <> ''
      GROUP BY ani
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO ani_history_bases (ani, base)
      SELECT DISTINCT ani, TRIM(base)
      FROM call_records NOT INDEXED
      WHERE TRIM(COALESCE(ani, '')) <> ''
        AND TRIM(COALESCE(base, '')) <> ''
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO ani_history_prefijos (ani, prefijo)
      SELECT DISTINCT ani, TRIM(prefijo)
      FROM call_records NOT INDEXED
      WHERE TRIM(COALESCE(ani, '')) <> ''
        AND TRIM(COALESCE(prefijo, '')) <> ''
    `).run();

    db.prepare(`
      INSERT INTO local_db_migrations (id, applied_at)
      VALUES (?, ?)
    `).run(aniSummaryMigrationId, new Date().toISOString());
  });

  applyAniSummaryMigration();

  const aniHourlyMigrationId = "ani_history_hourly_v1";
  const applyAniHourlyMigration = db.transaction(() => {
    const alreadyApplied = db
      .prepare(`SELECT 1 FROM local_db_migrations WHERE id = ?`)
      .get(aniHourlyMigrationId);
    if (alreadyApplied) return;

    db.prepare(`
      INSERT OR REPLACE INTO ani_history_hourly (
        ani,
        bucket_hour,
        intentos_totales,
        intentos_answer_agent,
        intentos_answering_machine,
        intentos_no_answer
      )
      SELECT
        ani,
        SUBSTR(fecha, 1, 13) || ':00:00.000Z',
        COUNT(*),
        SUM(is_contacto_efectivo),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'ANSWER'
              AND (
                UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%MACHINE%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%ANSWERING%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%BUZON%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%VOICEMAIL%'
              )
            THEN 1 ELSE 0
          END
        ),
        SUM(
          CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'NOANSWER'
            THEN 1 ELSE 0 END
        )
      FROM call_records NOT INDEXED
      WHERE TRIM(COALESCE(ani, '')) <> ''
        AND LENGTH(fecha) >= 13
        AND fecha >= STRFTIME('%Y-%m-%dT%H:00:00.000Z', 'now', '-35 days')
      GROUP BY ani, SUBSTR(fecha, 1, 13)
    `).run();

    db.prepare(`
      INSERT INTO local_db_migrations (id, applied_at)
      VALUES (?, ?)
    `).run(aniHourlyMigrationId, new Date().toISOString());
  });

  applyAniHourlyMigration();
  db.prepare(`
    DELETE FROM ani_history_hourly
    WHERE bucket_hour < STRFTIME('%Y-%m-%dT%H:00:00.000Z', 'now', '-35 days')
  `).run();

  const applySummaryIncrement = (afterRecordId: number) => {
    db.prepare(`
      INSERT INTO ani_history_summary (
        ani,
        intentos_totales,
        intentos_answer_agent,
        intentos_answering_machine,
        intentos_no_answer,
        intentos_busy,
        intentos_unallocated,
        intentos_rejected,
        ultimo_registro
      )
      SELECT
        ani,
        COUNT(*),
        SUM(is_contacto_efectivo),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'ANSWER'
              AND (
                UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%MACHINE%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%ANSWERING%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%BUZON%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%VOICEMAIL%'
              )
            THEN 1 ELSE 0
          END
        ),
        SUM(CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'NOANSWER' THEN 1 ELSE 0 END),
        SUM(CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'BUSY' THEN 1 ELSE 0 END),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'UNALLOCATED'
              OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) = 'UNALLOCATED'
            THEN 1 ELSE 0
          END
        ),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'REJECTED'
              OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) = 'REJECTED'
            THEN 1 ELSE 0
          END
        ),
        COALESCE(MAX(
          CASE
            WHEN TRIM(COALESCE(fecha, '')) <> ''
            THEN fecha || CHAR(31) || PRINTF('%020d', id) || CHAR(31)
              || COALESCE(estado, '') || CHAR(31) || COALESCE(subestado, '')
            ELSE NULL
          END
        ), '')
      FROM call_records
      WHERE id > ?
        AND TRIM(COALESCE(ani, '')) <> ''
      GROUP BY ani
      ON CONFLICT(ani) DO UPDATE SET
        intentos_totales = ani_history_summary.intentos_totales + excluded.intentos_totales,
        intentos_answer_agent = ani_history_summary.intentos_answer_agent + excluded.intentos_answer_agent,
        intentos_answering_machine = ani_history_summary.intentos_answering_machine + excluded.intentos_answering_machine,
        intentos_no_answer = ani_history_summary.intentos_no_answer + excluded.intentos_no_answer,
        intentos_busy = ani_history_summary.intentos_busy + excluded.intentos_busy,
        intentos_unallocated = ani_history_summary.intentos_unallocated + excluded.intentos_unallocated,
        intentos_rejected = ani_history_summary.intentos_rejected + excluded.intentos_rejected,
        ultimo_registro = CASE
          WHEN excluded.ultimo_registro > ani_history_summary.ultimo_registro
          THEN excluded.ultimo_registro
          ELSE ani_history_summary.ultimo_registro
        END
    `).run(afterRecordId);

    db.prepare(`
      INSERT OR IGNORE INTO ani_history_bases (ani, base)
      SELECT DISTINCT ani, TRIM(base)
      FROM call_records
      WHERE id > ?
        AND TRIM(COALESCE(ani, '')) <> ''
        AND TRIM(COALESCE(base, '')) <> ''
    `).run(afterRecordId);

    db.prepare(`
      INSERT OR IGNORE INTO ani_history_prefijos (ani, prefijo)
      SELECT DISTINCT ani, TRIM(prefijo)
      FROM call_records
      WHERE id > ?
        AND TRIM(COALESCE(ani, '')) <> ''
        AND TRIM(COALESCE(prefijo, '')) <> ''
    `).run(afterRecordId);

    db.prepare(`
      INSERT INTO ani_history_hourly (
        ani,
        bucket_hour,
        intentos_totales,
        intentos_answer_agent,
        intentos_answering_machine,
        intentos_no_answer
      )
      SELECT
        ani,
        SUBSTR(fecha, 1, 13) || ':00:00.000Z',
        COUNT(*),
        SUM(is_contacto_efectivo),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'ANSWER'
              AND (
                UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%MACHINE%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%ANSWERING%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%BUZON%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%VOICEMAIL%'
              )
            THEN 1 ELSE 0
          END
        ),
        SUM(
          CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'NOANSWER'
            THEN 1 ELSE 0 END
        )
      FROM call_records
      WHERE id > ?
        AND TRIM(COALESCE(ani, '')) <> ''
        AND LENGTH(fecha) >= 13
        AND fecha >= STRFTIME('%Y-%m-%dT%H:00:00.000Z', 'now', '-35 days')
      GROUP BY ani, SUBSTR(fecha, 1, 13)
      ON CONFLICT(ani, bucket_hour) DO UPDATE SET
        intentos_totales = ani_history_hourly.intentos_totales + excluded.intentos_totales,
        intentos_answer_agent = ani_history_hourly.intentos_answer_agent + excluded.intentos_answer_agent,
        intentos_answering_machine = ani_history_hourly.intentos_answering_machine + excluded.intentos_answering_machine,
        intentos_no_answer = ani_history_hourly.intentos_no_answer + excluded.intentos_no_answer
    `).run(afterRecordId);
  };

  const synchronizeAniCache = db.transaction(() => {
    const state = db.prepare(`
      SELECT last_record_id AS lastRecordId, total_records AS totalRecords
      FROM ani_history_cache_state
      WHERE id = 1
    `).get() as { totalRecords: number; lastRecordId: number } | undefined;
    const currentLastRecordId = Number(
      (db.prepare(`
        SELECT COALESCE(MAX(id), 0) AS lastRecordId
        FROM call_records
      `).get() as { lastRecordId: number }).lastRecordId,
    );

    if (state && currentLastRecordId === state.lastRecordId) return;

    const currentTotalRecords = Number(
      (db.prepare(`
        SELECT COUNT(*) AS totalRecords
        FROM call_records
      `).get() as { totalRecords: number }).totalRecords,
    );

    let cachedTotal = state?.totalRecords ?? Number(
      (db.prepare(`
        SELECT COALESCE(SUM(intentos_totales), 0) AS total
        FROM ani_history_summary
      `).get() as { total: number }).total,
    );
    let lastRecordId = state?.lastRecordId ?? currentLastRecordId;

    if (!state && cachedTotal < currentTotalRecords) {
      const migration = db.prepare(`
        SELECT applied_at AS appliedAt
        FROM local_db_migrations
        WHERE id = ?
      `).get(aniSummaryMigrationId) as { appliedAt: string } | undefined;
      lastRecordId = Number(
        (db.prepare(`
          SELECT COALESCE(MAX(id), 0) AS lastRecordId
          FROM call_records
          WHERE created_at <= ?
        `).get(migration?.appliedAt ?? "") as { lastRecordId: number }).lastRecordId,
      );
    }

    if (
      currentLastRecordId !== lastRecordId ||
      currentTotalRecords !== cachedTotal
    ) {
      const newRecords = Number(
        (db.prepare(`
          SELECT COUNT(*) AS total
          FROM call_records
          WHERE id > ?
        `).get(lastRecordId) as { total: number }).total,
      );

      if (
        currentLastRecordId < lastRecordId ||
        currentTotalRecords !== cachedTotal + newRecords
      ) {
        throw new Error(
          "El resumen rápido por ANI quedó desincronizado por una eliminación externa. Reiniciá la caché histórica antes de continuar.",
        );
      }

      applySummaryIncrement(lastRecordId);
      cachedTotal += newRecords;
      lastRecordId = currentLastRecordId;
    }

    db.prepare(`
      INSERT INTO ani_history_cache_state (
        id, last_record_id, total_records, updated_at
      )
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_record_id = excluded.last_record_id,
        total_records = excluded.total_records,
        updated_at = excluded.updated_at
    `).run(lastRecordId, cachedTotal, new Date().toISOString());
  });

  synchronizeAniCache();
  localDbInitialized = true;
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

  const upsertAniSummary = db.prepare(`
    INSERT INTO ani_history_summary (
      ani,
      intentos_totales,
      intentos_answer_agent,
      intentos_answering_machine,
      intentos_no_answer,
      intentos_busy,
      intentos_unallocated,
      intentos_rejected,
      ultimo_registro
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ani) DO UPDATE SET
      intentos_totales = ani_history_summary.intentos_totales + excluded.intentos_totales,
      intentos_answer_agent = ani_history_summary.intentos_answer_agent + excluded.intentos_answer_agent,
      intentos_answering_machine = ani_history_summary.intentos_answering_machine + excluded.intentos_answering_machine,
      intentos_no_answer = ani_history_summary.intentos_no_answer + excluded.intentos_no_answer,
      intentos_busy = ani_history_summary.intentos_busy + excluded.intentos_busy,
      intentos_unallocated = ani_history_summary.intentos_unallocated + excluded.intentos_unallocated,
      intentos_rejected = ani_history_summary.intentos_rejected + excluded.intentos_rejected,
      ultimo_registro = CASE
        WHEN excluded.ultimo_registro > ani_history_summary.ultimo_registro
        THEN excluded.ultimo_registro
        ELSE ani_history_summary.ultimo_registro
      END
  `);
  const insertAniBase = db.prepare(`
    INSERT OR IGNORE INTO ani_history_bases (ani, base)
    VALUES (?, ?)
  `);
  const insertAniPrefijo = db.prepare(`
    INSERT OR IGNORE INTO ani_history_prefijos (ani, prefijo)
    VALUES (?, ?)
  `);
  const upsertAniHourly = db.prepare(`
    INSERT INTO ani_history_hourly (
      ani,
      bucket_hour,
      intentos_totales,
      intentos_answer_agent,
      intentos_answering_machine,
      intentos_no_answer
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ani, bucket_hour) DO UPDATE SET
      intentos_totales = ani_history_hourly.intentos_totales + excluded.intentos_totales,
      intentos_answer_agent = ani_history_hourly.intentos_answer_agent + excluded.intentos_answer_agent,
      intentos_answering_machine = ani_history_hourly.intentos_answering_machine + excluded.intentos_answering_machine,
      intentos_no_answer = ani_history_hourly.intentos_no_answer + excluded.intentos_no_answer
  `);

  const transaction = db.transaction(() => {
    let insertedRecords = 0;
    let duplicatedRecords = 0;
    let insertedFiles = 0;
    let duplicatedFiles = 0;
    let maxInsertedRecordId = 0;
    const summaryUpdates = new Map<string, {
      intentosTotales: number;
      intentosAnswerAgent: number;
      intentosAnsweringMachine: number;
      intentosNoAnswer: number;
      intentosBusy: number;
      intentosUnallocated: number;
      intentosRejected: number;
      ultimoRegistro: string;
      bases: Set<string>;
      prefijos: Set<string>;
    }>();
    const hourlyUpdates = new Map<string, {
      ani: string;
      bucketHour: string;
      intentosTotales: number;
      intentosAnswerAgent: number;
      intentosAnsweringMachine: number;
      intentosNoAnswer: number;
    }>();

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
          const fechaRecord =
            getFechaFromRecord(record as Record<string, unknown>) ??
            normalizeDateForStorage(record.fecha) ??
            null;
          const ani = String(record.ani ?? "").replace(/\D/g, "").trim();
          const base = String(record.base ?? "").trim();
          const prefijo = getPrefijo(record.ani);
          const contactoEfectivo = isContactoEfectivo(record);

          const recordResult = insertRecord.run(
            recordHash,
            fileId,
            fechaRecord,
            archivoOrigen,
            fechaArchivoRecord,
            ani,
            record.estado,
            record.subestado ?? null,
            base || null,
            prefijo,
            typeof record.duracion === "number" ? record.duracion : null,
            contactoEfectivo ? 1 : 0,
            JSON.stringify(record),
            now
          );

          if (recordResult.changes > 0) {
            insertedRecords++;
            maxInsertedRecordId = Math.max(
              maxInsertedRecordId,
              Number(recordResult.lastInsertRowid) || 0,
            );
            const estado = normalizeEstado(record.estado);
            const subestado = normalizeSubestado(record.subestado);
            const current = summaryUpdates.get(ani) ?? {
              intentosTotales: 0,
              intentosAnswerAgent: 0,
              intentosAnsweringMachine: 0,
              intentosNoAnswer: 0,
              intentosBusy: 0,
              intentosUnallocated: 0,
              intentosRejected: 0,
              ultimoRegistro: "",
              bases: new Set<string>(),
              prefijos: new Set<string>(),
            };

            current.intentosTotales++;
            if (contactoEfectivo) {
              current.intentosAnswerAgent++;
            } else if (
              estado === "answer" &&
              (
                subestado.includes("machine") ||
                subestado.includes("answering") ||
                subestado.includes("buzon") ||
                subestado.includes("voicemail")
              )
            ) {
              current.intentosAnsweringMachine++;
            } else if (estado === "noanswer") {
              current.intentosNoAnswer++;
            } else if (estado === "busy") {
              current.intentosBusy++;
            } else if (estado === "unallocated" || subestado === "unallocated") {
              current.intentosUnallocated++;
            } else if (estado === "rejected" || subestado === "rejected") {
              current.intentosRejected++;
            }

            if (fechaRecord) {
              const latest = [
                fechaRecord,
                String(recordResult.lastInsertRowid).padStart(20, "0"),
                record.estado ?? "",
                record.subestado ?? "",
              ].join("\u001f");
              if (latest > current.ultimoRegistro) current.ultimoRegistro = latest;

              if (new Date(fechaRecord).getTime() >= Date.now() - 35 * 86400000) {
                const bucketHour = `${fechaRecord.slice(0, 13)}:00:00.000Z`;
                const hourlyKey = `${ani}\u001f${bucketHour}`;
                const hourly = hourlyUpdates.get(hourlyKey) ?? {
                  ani,
                  bucketHour,
                  intentosTotales: 0,
                  intentosAnswerAgent: 0,
                  intentosAnsweringMachine: 0,
                  intentosNoAnswer: 0,
                };
                hourly.intentosTotales++;
                if (contactoEfectivo) {
                  hourly.intentosAnswerAgent++;
                } else if (
                  estado === "answer" &&
                  (
                    subestado.includes("machine") ||
                    subestado.includes("answering") ||
                    subestado.includes("buzon") ||
                    subestado.includes("voicemail")
                  )
                ) {
                  hourly.intentosAnsweringMachine++;
                } else if (estado === "noanswer") {
                  hourly.intentosNoAnswer++;
                }
                hourlyUpdates.set(hourlyKey, hourly);
              }
            }
            if (base) current.bases.add(base);
            if (prefijo) current.prefijos.add(prefijo);
            summaryUpdates.set(ani, current);
          } else {
            duplicatedRecords++;
          }
        }
      }
    );

    for (const [ani, summary] of Array.from(summaryUpdates.entries())) {
      upsertAniSummary.run(
        ani,
        summary.intentosTotales,
        summary.intentosAnswerAgent,
        summary.intentosAnsweringMachine,
        summary.intentosNoAnswer,
        summary.intentosBusy,
        summary.intentosUnallocated,
        summary.intentosRejected,
        summary.ultimoRegistro,
      );
      for (const base of Array.from(summary.bases)) insertAniBase.run(ani, base);
      for (const prefijo of Array.from(summary.prefijos)) {
        insertAniPrefijo.run(ani, prefijo);
      }
    }
    for (const hourly of Array.from(hourlyUpdates.values())) {
      upsertAniHourly.run(
        hourly.ani,
        hourly.bucketHour,
        hourly.intentosTotales,
        hourly.intentosAnswerAgent,
        hourly.intentosAnsweringMachine,
        hourly.intentosNoAnswer,
      );
    }

    if (insertedRecords > 0) {
      db.prepare(`
        UPDATE ani_history_cache_state
        SET
          last_record_id = MAX(last_record_id, ?),
          total_records = total_records + ?,
          updated_at = ?
        WHERE id = 1
      `).run(maxInsertedRecordId, insertedRecords, now);
    }

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
    db.exec(`
      DROP TABLE IF EXISTS temp.affected_deleted_anis;
      CREATE TEMP TABLE affected_deleted_anis (
        ani TEXT PRIMARY KEY
      ) WITHOUT ROWID;
    `);
    db.prepare(`
      INSERT OR IGNORE INTO affected_deleted_anis (ani)
      SELECT DISTINCT ani
      FROM call_records
      WHERE file_id = ?
        AND TRIM(COALESCE(ani, '')) <> ''
    `).run(fileId);

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

    db.exec(`
      DELETE FROM ani_history_summary
      WHERE ani IN (SELECT ani FROM affected_deleted_anis);
      DELETE FROM ani_history_bases
      WHERE ani IN (SELECT ani FROM affected_deleted_anis);
      DELETE FROM ani_history_prefijos
      WHERE ani IN (SELECT ani FROM affected_deleted_anis);
      DELETE FROM ani_history_hourly
      WHERE ani IN (SELECT ani FROM affected_deleted_anis);

      INSERT INTO ani_history_summary (
        ani,
        intentos_totales,
        intentos_answer_agent,
        intentos_answering_machine,
        intentos_no_answer,
        intentos_busy,
        intentos_unallocated,
        intentos_rejected,
        ultimo_registro
      )
      SELECT
        call_records.ani,
        COUNT(*),
        SUM(is_contacto_efectivo),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'ANSWER'
              AND (
                UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%MACHINE%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%ANSWERING%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%BUZON%'
                OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) LIKE '%VOICEMAIL%'
              )
            THEN 1 ELSE 0
          END
        ),
        SUM(CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'NOANSWER' THEN 1 ELSE 0 END),
        SUM(CASE WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'BUSY' THEN 1 ELSE 0 END),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'UNALLOCATED'
              OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) = 'UNALLOCATED'
            THEN 1 ELSE 0
          END
        ),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(estado, '')), ' ', '')) = 'REJECTED'
              OR UPPER(REPLACE(TRIM(COALESCE(subestado, '')), ' ', '')) = 'REJECTED'
            THEN 1 ELSE 0
          END
        ),
        COALESCE(MAX(
          CASE
            WHEN TRIM(COALESCE(fecha, '')) <> ''
            THEN fecha || CHAR(31) || PRINTF('%020d', id) || CHAR(31)
              || COALESCE(estado, '') || CHAR(31) || COALESCE(subestado, '')
            ELSE NULL
          END
        ), '')
      FROM call_records
      INNER JOIN affected_deleted_anis
        ON affected_deleted_anis.ani = call_records.ani
      GROUP BY call_records.ani;

      INSERT OR IGNORE INTO ani_history_bases (ani, base)
      SELECT DISTINCT call_records.ani, TRIM(call_records.base)
      FROM call_records
      INNER JOIN affected_deleted_anis
        ON affected_deleted_anis.ani = call_records.ani
      WHERE TRIM(COALESCE(call_records.base, '')) <> '';

      INSERT OR IGNORE INTO ani_history_prefijos (ani, prefijo)
      SELECT DISTINCT call_records.ani, TRIM(call_records.prefijo)
      FROM call_records
      INNER JOIN affected_deleted_anis
        ON affected_deleted_anis.ani = call_records.ani
      WHERE TRIM(COALESCE(call_records.prefijo, '')) <> '';

      INSERT INTO ani_history_hourly (
        ani,
        bucket_hour,
        intentos_totales,
        intentos_answer_agent,
        intentos_answering_machine,
        intentos_no_answer
      )
      SELECT
        call_records.ani,
        SUBSTR(call_records.fecha, 1, 13) || ':00:00.000Z',
        COUNT(*),
        SUM(call_records.is_contacto_efectivo),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(call_records.estado, '')), ' ', '')) = 'ANSWER'
              AND (
                UPPER(REPLACE(TRIM(COALESCE(call_records.subestado, '')), ' ', '')) LIKE '%MACHINE%'
                OR UPPER(REPLACE(TRIM(COALESCE(call_records.subestado, '')), ' ', '')) LIKE '%ANSWERING%'
                OR UPPER(REPLACE(TRIM(COALESCE(call_records.subestado, '')), ' ', '')) LIKE '%BUZON%'
                OR UPPER(REPLACE(TRIM(COALESCE(call_records.subestado, '')), ' ', '')) LIKE '%VOICEMAIL%'
              )
            THEN 1 ELSE 0
          END
        ),
        SUM(
          CASE
            WHEN UPPER(REPLACE(TRIM(COALESCE(call_records.estado, '')), ' ', '')) = 'NOANSWER'
            THEN 1 ELSE 0
          END
        )
      FROM call_records
      INNER JOIN affected_deleted_anis
        ON affected_deleted_anis.ani = call_records.ani
      WHERE LENGTH(call_records.fecha) >= 13
        AND call_records.fecha >= STRFTIME('%Y-%m-%dT%H:00:00.000Z', 'now', '-35 days')
      GROUP BY call_records.ani, SUBSTR(call_records.fecha, 1, 13);

      DROP TABLE affected_deleted_anis;
    `);
    const lastRecord = db.prepare(`
      SELECT COALESCE(MAX(id), 0) AS lastRecordId
      FROM call_records
    `).get() as { lastRecordId: number };
    db.prepare(`
      UPDATE ani_history_cache_state
      SET
        last_record_id = ?,
        total_records = MAX(0, total_records - ?),
        updated_at = ?
      WHERE id = 1
    `).run(
      lastRecord.lastRecordId,
      deletedRecordsResult.changes,
      new Date().toISOString(),
    );

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

export function getHistorySummaryForAnis(anis: string[]) {
  initLocalDb();

  const normalizedAnis = Array.from(
    new Set(
      anis
        .map((ani) => String(ani ?? "").replace(/\D/g, "").trim())
        .filter(Boolean),
    ),
  );

  const result = new Map<string, LocalAniHistorySummary>();
  if (normalizedAnis.length === 0) return result;

  const latestSeparator = "\u001f";
  const chunkSize = 900;
  const now = Date.now();
  const hourBucket = (timestamp: number) =>
    `${new Date(timestamp).toISOString().slice(0, 13)}:00:00.000Z`;
  const cutoff24h = hourBucket(now - 24 * 60 * 60 * 1000);
  const cutoff7d = hourBucket(now - 7 * 24 * 60 * 60 * 1000);
  const cutoff14d = hourBucket(now - 14 * 24 * 60 * 60 * 1000);
  const cutoff30d = hourBucket(now - 30 * 24 * 60 * 60 * 1000);

  for (let index = 0; index < normalizedAnis.length; index += chunkSize) {
    const chunk = normalizedAnis.slice(index, index + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(`
        SELECT
          ani,
          intentos_totales AS intentosTotales,
          intentos_answer_agent AS intentosAnswerAgent,
          intentos_answering_machine AS intentosAnsweringMachine,
          intentos_no_answer AS intentosNoAnswer,
          intentos_busy AS intentosBusy,
          intentos_unallocated AS intentosUnallocated,
          intentos_rejected AS intentosRejected,
          ultimo_registro AS ultimoRegistro
        FROM ani_history_summary
        WHERE ani IN (${placeholders})
      `)
      .all(...chunk) as Array<{
        ani: string;
        intentosTotales: number;
        intentosAnswerAgent: number;
        intentosAnsweringMachine: number;
        intentosNoAnswer: number;
        intentosBusy: number;
        intentosUnallocated: number;
        intentosRejected: number;
        ultimoRegistro: string;
      }>;

    for (const row of rows) {
      const ani = String(row.ani ?? "").replace(/\D/g, "").trim();
      if (!ani) continue;

      const [ultimoLlamado = "", _ultimoId = "", ultimoEstado = "", ultimoSubestado = ""] =
        row.ultimoRegistro?.split(latestSeparator) ?? [];

      result.set(ani, {
        ani,
        intentosTotales: Number(row.intentosTotales) || 0,
        intentosAnswerAgent: Number(row.intentosAnswerAgent) || 0,
        intentosAnsweringMachine: Number(row.intentosAnsweringMachine) || 0,
        intentosNoAnswer: Number(row.intentosNoAnswer) || 0,
        intentosBusy: Number(row.intentosBusy) || 0,
        intentosUnallocated: Number(row.intentosUnallocated) || 0,
        intentosRejected: Number(row.intentosRejected) || 0,
        ultimoLlamado,
        ultimoEstado,
        ultimoSubestado,
        intentos24h: 0,
        intentos7d: 0,
        intentos14d: 0,
        intentos30d: 0,
        noAnswer7d: 0,
        buzones14d: 0,
        bases: [],
        prefijos: [],
      });
    }

    const recentRows = db.prepare(`
      SELECT
        ani,
        SUM(CASE WHEN bucket_hour >= ? THEN intentos_totales ELSE 0 END) AS intentos24h,
        SUM(CASE WHEN bucket_hour >= ? THEN intentos_totales ELSE 0 END) AS intentos7d,
        SUM(CASE WHEN bucket_hour >= ? THEN intentos_totales ELSE 0 END) AS intentos14d,
        SUM(intentos_totales) AS intentos30d,
        SUM(CASE WHEN bucket_hour >= ? THEN intentos_no_answer ELSE 0 END) AS noAnswer7d,
        SUM(CASE WHEN bucket_hour >= ? THEN intentos_answering_machine ELSE 0 END) AS buzones14d
      FROM ani_history_hourly
      WHERE ani IN (${placeholders})
        AND bucket_hour >= ?
      GROUP BY ani
    `).all(
      cutoff24h,
      cutoff7d,
      cutoff14d,
      cutoff7d,
      cutoff14d,
      ...chunk,
      cutoff30d,
    ) as Array<{
      ani: string;
      intentos24h: number;
      intentos7d: number;
      intentos14d: number;
      intentos30d: number;
      noAnswer7d: number;
      buzones14d: number;
    }>;
    for (const row of recentRows) {
      const summary = result.get(row.ani);
      if (!summary) continue;
      summary.intentos24h = Number(row.intentos24h) || 0;
      summary.intentos7d = Number(row.intentos7d) || 0;
      summary.intentos14d = Number(row.intentos14d) || 0;
      summary.intentos30d = Number(row.intentos30d) || 0;
      summary.noAnswer7d = Number(row.noAnswer7d) || 0;
      summary.buzones14d = Number(row.buzones14d) || 0;
    }

    const baseRows = db.prepare(`
      SELECT ani, base
      FROM ani_history_bases
      WHERE ani IN (${placeholders})
      ORDER BY ani, base
    `).all(...chunk) as Array<{ ani: string; base: string }>;
    for (const row of baseRows) {
      const summary = result.get(row.ani);
      if (summary) summary.bases.push(row.base);
    }

    const prefijoRows = db.prepare(`
      SELECT ani, prefijo
      FROM ani_history_prefijos
      WHERE ani IN (${placeholders})
      ORDER BY ani, prefijo
    `).all(...chunk) as Array<{ ani: string; prefijo: string }>;
    for (const row of prefijoRows) {
      const summary = result.get(row.ani);
      if (summary) summary.prefijos.push(row.prefijo);
    }
  }

  return result;
}

export function getLatestGestionForAnis(anis: string[]) {
  initLocalDb();
  const normalizedAnis = Array.from(new Set(anis.map((ani) => String(ani ?? "").replace(/\D/g, "").trim()).filter(Boolean)));
  const result = new Map<string, LocalGestionSummary>();
  const latestRows = new Map<string, {
    id: number;
    ani: string;
    resultado: string;
    subresultado: string;
    accionComercial: string;
    motivoAccion: string;
    ultimaGestion: string;
  }>();
  const catalogaciones = new Map<string, Map<string, {
    id: number;
    resultado: string;
    subresultado: string;
    accionComercial: string;
    ultimaGestion: string;
  }>>();
  const exclusiones = new Map<string, {
    id: number;
    ultimaGestion: string;
    motivo: string;
  }>();
  const isNewer = (
    candidate: { id: number; ultimaGestion: string },
    current?: { id: number; ultimaGestion: string },
  ) => !current ||
    candidate.ultimaGestion > current.ultimaGestion ||
    (candidate.ultimaGestion === current.ultimaGestion && candidate.id > current.id);

  for (let index = 0; index < normalizedAnis.length; index += 500) {
    const chunk = normalizedAnis.slice(index, index + 500);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT id, ani, resultado, subresultado, accion_comercial AS accionComercial,
        motivo_accion AS motivoAccion, ts AS ultimaGestion
      FROM gestion_records
      WHERE ani IN (${placeholders})
    `).all(...chunk) as Array<{
      id: number;
      ani: string;
      resultado: string;
      subresultado: string;
      accionComercial: string;
      motivoAccion: string;
      ultimaGestion: string;
    }>;

    for (const row of rows) {
      const ani = String(row.ani);
      const currentLatest = latestRows.get(ani);
      if (isNewer(row, currentLatest)) latestRows.set(ani, row);

      const key = `${row.resultado} | ${row.subresultado}`;
      const aniCatalogaciones = catalogaciones.get(ani) ?? new Map();
      const currentCatalogacion = aniCatalogaciones.get(key);
      if (isNewer(row, currentCatalogacion)) aniCatalogaciones.set(key, row);
      catalogaciones.set(ani, aniCatalogaciones);

      const exclusionReason = getCommercialExclusionReason(row.resultado, row.subresultado);
      const currentExclusion = exclusiones.get(ani);
      if (exclusionReason && isNewer(row, currentExclusion)) {
        exclusiones.set(ani, {
          id: row.id,
          ultimaGestion: row.ultimaGestion,
          motivo: exclusionReason,
        });
      }
    }
  }

  for (const [ani, latest] of Array.from(latestRows.entries())) {
    const exclusion = exclusiones.get(ani);
    const items = Array.from(catalogaciones.get(ani)?.values() ?? [])
      .sort((a, b) =>
        b.ultimaGestion.localeCompare(a.ultimaGestion) || b.id - a.id
      )
      .map((item) => ({
        resultado: item.resultado,
        subresultado: item.subresultado,
        accionComercial: item.accionComercial,
        ultimaGestion: item.ultimaGestion,
      }));

    result.set(ani, {
      ani,
      resultado: latest.resultado,
      subresultado: latest.subresultado,
      accionComercial: latest.accionComercial,
      motivoAccion: latest.motivoAccion,
      ultimaGestion: latest.ultimaGestion,
      catalogaciones: items,
      exclusionComercial: Boolean(exclusion),
      motivoExclusion: exclusion?.motivo ?? "",
    });
  }

  return result;
}
export function saveNeotelReport(
  report: ParsedNeotelReport,
  options?: { source?: "FTP" | "MANUAL"; remotePath?: string },
) {
  initLocalDb();

  const existing = db
    .prepare(`SELECT id FROM neotel_report_imports WHERE file_hash = ?`)
    .get(report.fileHash) as { id: number } | undefined;

  if (existing) {
    return {
      duplicate: true,
      importId: existing.id,
      reportType: report.type,
      importedRows: 0,
      rejectedRows: report.rejectedRows,
    };
  }

  const insertImport = db.prepare(`
    INSERT INTO neotel_report_imports (
      file_name, file_hash, report_type, report_date, source, remote_path,
      total_rows, imported_rows, rejected_rows, warnings_json, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);

  const updateImport = db.prepare(`
    UPDATE neotel_report_imports
    SET imported_rows = ?
    WHERE id = ?
  `);

  const insertGestion = db.prepare(`
    INSERT OR IGNORE INTO gestion_records (
      record_hash, import_id, ts, report_date, base, id_lote, descripcion,
      id_contacto, titular, dni_cuit, ani, usuario, resultado, subresultado,
      cant_llamados, precio, localidad, observaciones, duracion_llamadas,
      accion_comercial, motivo_accion, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProductivity = db.prepare(`
    INSERT OR IGNORE INTO agent_productivity_records (
      record_hash, import_id, report_date, usuario, usuario_id,
      login_seconds, descanso_seconds, administrative_seconds,
      conversation_inbound_seconds, conversation_outbound_seconds,
      dialing_seconds, idle_seconds, connected_inbound, connected_outbound,
      not_connected_outbound, metrics_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return db.transaction(() => {
    const importResult = insertImport.run(
      report.fileName,
      report.fileHash,
      report.type,
      report.reportDate || null,
      options?.source ?? "MANUAL",
      options?.remotePath ?? null,
      report.totalRows,
      report.rejectedRows,
      JSON.stringify(report.warnings),
      new Date().toISOString(),
    );
    const importId = Number(importResult.lastInsertRowid);
    let importedRows = 0;

    if (report.type === "GESTIONES") {
      for (const record of report.records) {
        importedRows += insertGestion.run(
          record.recordHash,
          importId,
          record.ts,
          record.reportDate || null,
          record.base || null,
          record.idLote || null,
          record.descripcion || null,
          record.idContacto || null,
          record.titular || null,
          record.dniCuit || null,
          record.ani,
          record.usuario || null,
          record.resultado || null,
          record.subresultado || null,
          record.cantLlamados,
          record.precio || null,
          record.localidad || null,
          record.observaciones || null,
          record.duracionLlamadas || null,
          record.accionComercial,
          record.motivoAccion,
          record.rawJson,
        ).changes;
      }
    } else {
      for (const record of report.records) {
        importedRows += insertProductivity.run(
          record.recordHash,
          importId,
          record.reportDate || null,
          record.usuario,
          record.usuarioId || null,
          record.loginSeconds,
          record.descansoSeconds,
          record.administrativeSeconds,
          record.conversationInboundSeconds,
          record.conversationOutboundSeconds,
          record.dialingSeconds,
          record.idleSeconds,
          record.connectedInbound,
          record.connectedOutbound,
          record.notConnectedOutbound,
          record.metricsJson,
        ).changes;
      }
    }

    updateImport.run(importedRows, importId);

    return {
      duplicate: false,
      importId,
      reportType: report.type,
      importedRows,
      rejectedRows: report.rejectedRows,
    };
  })();
}

export function getNeotelReportStats() {
  initLocalDb();

  const imports = db.prepare(`
    SELECT
      COUNT(*) AS totalImports,
      SUM(CASE WHEN report_type = 'GESTIONES' THEN 1 ELSE 0 END) AS gestionImports,
      SUM(CASE WHEN report_type = 'PRODUCTIVIDAD' THEN 1 ELSE 0 END) AS productivityImports,
      MAX(CASE WHEN report_type = 'GESTIONES' THEN report_date END) AS latestGestionDate,
      MAX(CASE WHEN report_type = 'PRODUCTIVIDAD' THEN report_date END) AS latestProductivityDate
    FROM neotel_report_imports
  `).get() as Record<string, number | string | null>;

  const gestion = db.prepare(`
    SELECT
      COUNT(*) AS totalGestiones,
      COUNT(DISTINCT ani) AS totalAnis,
      COUNT(DISTINCT CASE
        WHEN accion_comercial = 'EXCLUIR'
          OR UPPER(COALESCE(resultado, '') || ' ' || COALESCE(subresultado, '')) LIKE '%DEUDA%'
        THEN ani
      END) AS excludedAnis,
      COUNT(DISTINCT CASE WHEN accion_comercial = 'BUZON' THEN ani END) AS mailboxAnis
    FROM gestion_records
  `).get() as Record<string, number>;

  const productivity = db.prepare(`
    SELECT
      COUNT(*) AS totalRows,
      COUNT(DISTINCT usuario_id) AS totalAgents
    FROM agent_productivity_records
  `).get() as Record<string, number>;

  return {
    totalImports: Number(imports.totalImports ?? 0),
    gestionImports: Number(imports.gestionImports ?? 0),
    productivityImports: Number(imports.productivityImports ?? 0),
    latestGestionDate: imports.latestGestionDate ?? null,
    latestProductivityDate: imports.latestProductivityDate ?? null,
    totalGestiones: Number(gestion.totalGestiones ?? 0),
    totalGestionAnis: Number(gestion.totalAnis ?? 0),
    excludedAnis: Number(gestion.excludedAnis ?? 0),
    mailboxAnis: Number(gestion.mailboxAnis ?? 0),
    productivityRows: Number(productivity.totalRows ?? 0),
    totalAgents: Number(productivity.totalAgents ?? 0),
  };
}

export function getNeotelReportDates() {
  initLocalDb();

  return db.prepare(`
    WITH gestion AS (
      SELECT
        report_date,
        COUNT(*) AS totalGestiones,
        COUNT(DISTINCT ani) AS totalAnis,
        COUNT(DISTINCT CASE
          WHEN accion_comercial = 'EXCLUIR'
            OR UPPER(COALESCE(resultado, '') || ' ' || COALESCE(subresultado, '')) LIKE '%DEUDA%'
          THEN ani
        END) AS excludedAnis,
        COUNT(DISTINCT CASE WHEN accion_comercial = 'BUZON' THEN ani END) AS mailboxAnis
      FROM gestion_records
      WHERE report_date <> ''
      GROUP BY report_date
    ),
    productivity AS (
      SELECT report_date, COUNT(DISTINCT usuario_id) AS totalAgents
      FROM agent_productivity_records
      WHERE report_date <> ''
      GROUP BY report_date
    ),
    dates AS (
      SELECT report_date FROM gestion
      UNION
      SELECT report_date FROM productivity
    )
    SELECT
      dates.report_date AS reportDate,
      COALESCE(gestion.totalGestiones, 0) AS totalGestiones,
      COALESCE(gestion.totalAnis, 0) AS totalAnis,
      COALESCE(gestion.excludedAnis, 0) AS excludedAnis,
      COALESCE(gestion.mailboxAnis, 0) AS mailboxAnis,
      COALESCE(productivity.totalAgents, 0) AS totalAgents
    FROM dates
    LEFT JOIN gestion USING (report_date)
    LEFT JOIN productivity USING (report_date)
    ORDER BY dates.report_date DESC
  `).all();
}

export function getGestionCatalog(options: { reportDate?: string } = {}) {
  initLocalDb();

  const where = options.reportDate ? "WHERE report_date = ?" : "";
  const params = options.reportDate ? [options.reportDate] : [];

  return db.prepare(`
    SELECT
      COALESCE(resultado, '') AS resultado,
      COALESCE(subresultado, '') AS subresultado,
      accion_comercial AS accionComercial,
      motivo_accion AS motivoAccion,
      COUNT(*) AS totalGestiones,
      COUNT(DISTINCT ani) AS totalAnis,
      MAX(ts) AS ultimaGestion
    FROM gestion_records
    ${where}
    GROUP BY resultado, subresultado, accion_comercial, motivo_accion
    ORDER BY totalGestiones DESC, resultado, subresultado
  `).all(...params);
}

export function getGestionAnisForCatalog(options: {
  resultado?: string;
  subresultado?: string;
  accionComercial?: string;
  reportDate?: string;
}) {
  initLocalDb();

  const conditions: string[] = [];
  const params: string[] = [];

  if (options.resultado) {
    conditions.push("resultado = ?");
    params.push(options.resultado);
  }
  if (options.subresultado) {
    conditions.push("subresultado = ?");
    params.push(options.subresultado);
  }
  if (options.accionComercial) {
    conditions.push("accion_comercial = ?");
    params.push(options.accionComercial);
  }
  if (options.reportDate) {
    conditions.push("report_date = ?");
    params.push(options.reportDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT
      ani, titular, dni_cuit AS dniCuit, localidad, resultado, subresultado,
      accion_comercial AS accionComercial, motivo_accion AS motivoAccion,
      ts, base, id_lote AS idLote, usuario
    FROM gestion_records
    ${where}
    ORDER BY ts DESC
  `).all(...params) as Array<Record<string, unknown>>;

  const seen = new Set<string>();
  return rows.filter((row) => {
    const ani = String(row.ani ?? "");
    if (!ani || seen.has(ani)) return false;
    seen.add(ani);
    return true;
  });
}

export function getImportedNeotelReportNames() {
  initLocalDb();
  return new Set(
    (
      db.prepare(`SELECT file_name FROM neotel_report_imports`).all() as Array<{
        file_name: string;
      }>
    ).map((row) => row.file_name),
  );
}

export function getExcludedGestionAniSet() {
  initLocalDb();
  return new Set(
    (
      db.prepare(`
        SELECT DISTINCT ani
        FROM gestion_records
        WHERE accion_comercial = 'EXCLUIR'
      `).all() as Array<{ ani: string }>
    ).map((row) => row.ani),
  );
}

export function saveOperationLogEntry(entry: LocalOperationLogEntry) {
  initLocalDb();

  db.prepare(`
    INSERT INTO operation_log (
      id, occurred_at_ms, kind, title, detail, record_count
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    entry.id,
    entry.timestamp,
    entry.kind,
    entry.title,
    entry.detail,
    entry.count ?? null,
  );

  // La vista usa 48 horas, pero conservamos 30 días como respaldo operativo.
  db.prepare(`
    DELETE FROM operation_log
    WHERE occurred_at_ms < ?
  `).run(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return entry;
}

export function getOperationLogEntries(hours = 48, limit = 500) {
  initLocalDb();

  const safeHours = Math.min(Math.max(Math.trunc(hours), 1), 24 * 30);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 10), 1000);
  const cutoff = Date.now() - safeHours * 60 * 60 * 1000;

  const rows = db.prepare(`
    SELECT
      id,
      occurred_at_ms AS timestamp,
      kind,
      title,
      detail,
      record_count AS count
    FROM operation_log
    WHERE occurred_at_ms >= ?
    ORDER BY occurred_at_ms DESC
    LIMIT ?
  `).all(cutoff, safeLimit) as Array<{
    id: string;
    timestamp: number;
    kind: LocalOperationLogEntry["kind"];
    title: string;
    detail: string;
    count: number | null;
  }>;

  return rows.map((row) => ({
    ...row,
    count: row.count ?? undefined,
  }));
}

export function deleteTicketHistory() {
  initLocalDb();

  const transaction = db.transaction(() => {
    const deletedRecords = db.prepare(`DELETE FROM call_records`).run();
    db.prepare(`DELETE FROM ani_history_summary`).run();
    db.prepare(`DELETE FROM ani_history_bases`).run();
    db.prepare(`DELETE FROM ani_history_prefijos`).run();
    db.prepare(`DELETE FROM ani_history_hourly`).run();
    db.prepare(`
      UPDATE ani_history_cache_state
      SET last_record_id = 0, total_records = 0, updated_at = ?
      WHERE id = 1
    `).run(new Date().toISOString());
    const deletedFiles = db.prepare(`DELETE FROM imported_files`).run();
    const deletedAnalyses = db.prepare(`DELETE FROM analysis_runs`).run();

    db.prepare(`
      DELETE FROM sqlite_sequence
      WHERE name IN ('call_records', 'imported_files')
    `).run();

    return {
      deleted: true,
      deletedRecords: deletedRecords.changes,
      deletedFiles: deletedFiles.changes,
      deletedAnalyses: deletedAnalyses.changes,
    };
  });

  return transaction();
}
export function deleteAllLocalHistory() {
  initLocalDb();

  const transaction = db.transaction(() => {
    const deletedRecords = db.prepare(`DELETE FROM call_records`).run();
    db.prepare(`DELETE FROM ani_history_summary`).run();
    db.prepare(`DELETE FROM ani_history_bases`).run();
    db.prepare(`DELETE FROM ani_history_prefijos`).run();
    db.prepare(`DELETE FROM ani_history_hourly`).run();
    db.prepare(`
      UPDATE ani_history_cache_state
      SET last_record_id = 0, total_records = 0, updated_at = ?
      WHERE id = 1
    `).run(new Date().toISOString());
    const deletedFiles = db.prepare(`DELETE FROM imported_files`).run();
    const deletedAnalyses = db.prepare(`DELETE FROM analysis_runs`).run();
    const deletedGestiones = db.prepare(`DELETE FROM gestion_records`).run();
    const deletedProductivity = db
      .prepare(`DELETE FROM agent_productivity_records`)
      .run();
    const deletedReportImports = db
      .prepare(`DELETE FROM neotel_report_imports`)
      .run();

    // Reinicia los IDs autoincrementales para que el historial arranque limpio.
    db.prepare(`
      DELETE FROM sqlite_sequence
      WHERE name IN (
        'call_records', 'imported_files', 'gestion_records',
        'agent_productivity_records', 'neotel_report_imports'
      )
    `).run();

    return {
      deleted: true,
      deletedRecords: deletedRecords.changes,
      deletedFiles: deletedFiles.changes,
      deletedAnalyses: deletedAnalyses.changes,
      deletedGestiones: deletedGestiones.changes,
      deletedProductivity: deletedProductivity.changes,
      deletedReportImports: deletedReportImports.changes,
    };
  });

  return transaction();
}
