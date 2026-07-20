import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "basic-ftp";

import {
  getImportedNeotelReportNames,
  saveNeotelReport,
} from "./localDb.ts";
import { parseNeotelReport } from "./neotelReports.ts";
import {
  importNeotelTicketBuffer,
  NEOTEL_TICKET_FILE_PATTERN,
} from "./neotelTickets.ts";

const REPORT_PATTERN = /^(Gestiones_todas|Productividad_Usuarios)_20\d{2}-\d{2}-\d{2}\.csv$/i;
const DEFAULT_FTP_BACKUP_DIR = path.resolve(process.cwd(), "data", "neotel-ftp-backup");

const autoSyncState = {
  enabled: false,
  intervalMinutes: 30,
  running: false,
  lastAttemptAt: "",
  lastSuccessAt: "",
  lastError: "",
};

let syncInFlight: Promise<Awaited<ReturnType<typeof performNeotelFtpSync>>> | null = null;
let autoSyncStarted = false;

function getNeotelFtpBackupDir() {
  return path.resolve(process.env.NEOTEL_FTP_BACKUP_DIR || DEFAULT_FTP_BACKUP_DIR);
}

function sha256File(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function timestampSuffix() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function backupDownloadedFtpFile(tempPath: string, fileName: string) {
  const backupDir = getNeotelFtpBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const targetPath = path.join(backupDir, safeName);

  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(tempPath, targetPath);
    return { status: "CREADO", path: targetPath };
  }

  if (sha256File(tempPath) === sha256File(targetPath)) {
    return { status: "EXISTENTE", path: targetPath };
  }

  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension);
  const versionedPath = path.join(
    backupDir,
    `${baseName}__${timestampSuffix()}${extension}`,
  );
  fs.copyFileSync(tempPath, versionedPath);
  return { status: "VERSIONADO", path: versionedPath };
}

export function getNeotelFtpConfig() {
  const host = process.env.NEOTEL_FTP_HOST || "192.168.55.12";
  const port = Number(process.env.NEOTEL_FTP_PORT || 21);
  const user = process.env.NEOTEL_FTP_USER || "Client1";
  const password = process.env.NEOTEL_FTP_PASSWORD || "";
  const remotePath =
    process.env.NEOTEL_FTP_PATH || "/DOWNLOAD/REPORTES/PRODUCTIVIDAD";
  const secure = /^(1|true|yes)$/i.test(process.env.NEOTEL_FTP_SECURE || "false");

  return {
    host,
    port,
    user,
    password,
    remotePath,
    secure,
    configured: Boolean(host && user && password && remotePath),
  };
}

export function getNeotelFtpPublicStatus() {
  const config = getNeotelFtpConfig();
  return {
    configured: config.configured,
    host: config.host,
    port: config.port,
    user: config.user,
    remotePath: config.remotePath,
    secure: config.secure,
    backupDir: getNeotelFtpBackupDir(),
    autoSync: { ...autoSyncState },
  };
}

async function performNeotelFtpSync(tempDirectory: string) {
  const config = getNeotelFtpConfig();
  if (!config.configured) {
    throw new Error(
      "Faltan los datos de conexion del FTP de Neotel.",
    );
  }

  const client = new Client(30_000);
  client.ftp.verbose = false;
  const importedNames = getImportedNeotelReportNames();
  const results: Array<Record<string, unknown>> = [];

  try {
    try {
      await client.access({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        secure: config.secure,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!config.password && /530|login|password|authentication/i.test(detail)) {
        throw new Error(
          "El FTP rechazo el acceso sin contrasena. Windows puede tener la credencial guardada; configurala una sola vez como NEOTEL_FTP_PASSWORD en .env.local.",
        );
      }
      throw error;
    }
    await client.cd(config.remotePath);

    const files = (await client.list())
      .filter((file) => file.isFile && (REPORT_PATTERN.test(file.name) || NEOTEL_TICKET_FILE_PATTERN.test(file.name)))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const file of files) {
      const isReport = REPORT_PATTERN.test(file.name);
      const isTicket = NEOTEL_TICKET_FILE_PATTERN.test(file.name);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const tempPath = path.join(
        tempDirectory,
        `ftp_${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`,
      );

      try {
        await client.downloadTo(tempPath, file.name);
        const backup = backupDownloadedFtpFile(tempPath, file.name);
        if (isReport && importedNames.has(file.name)) {
          results.push({
            fileName: file.name,
            status: "DUPLICADO",
            backupStatus: backup.status,
            backupPath: backup.path,
          });
          continue;
        }

        const buffer = fs.readFileSync(tempPath);
        const remotePath = `${config.remotePath}/${file.name}`;
        const saved = isTicket
          ? importNeotelTicketBuffer(buffer, file.name, "FTP", remotePath)
          : (() => {
              const report = parseNeotelReport(buffer, file.name);
              return saveNeotelReport(report, {
                source: "FTP",
                remotePath,
              });
            })();

        results.push({
          fileName: file.name,
          status: "status" in saved
            ? saved.status
            : saved.duplicate ? "DUPLICADO" : "IMPORTADO",
          reportType: saved.reportType,
          importedRows: "importedRows" in saved ? saved.importedRows : saved.insertedRecords,
          rejectedRows: "rejectedRows" in saved ? saved.rejectedRows : 0,
          insertedRecords: "insertedRecords" in saved ? saved.insertedRecords : undefined,
          duplicatedRecords: "duplicatedRecords" in saved ? saved.duplicatedRecords : undefined,
          backupStatus: backup.status,
          backupPath: backup.path,
        });
      } catch (error) {
        results.push({
          fileName: file.name,
          status: "ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
      }
    }

    return {
      remoteFiles: files.length,
      imported: results.filter((result) => result.status === "IMPORTADO").length,
      duplicates: results.filter((result) => result.status === "DUPLICADO").length,
      errors: results.filter((result) => result.status === "ERROR").length,
      results,
    };
  } finally {
    client.close();
  }
}

export function syncNeotelReportsFromFtp(tempDirectory: string) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = performNeotelFtpSync(tempDirectory).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export function startNeotelFtpAutoSync(
  tempDirectory: string,
  onLog: (message: string) => void = console.log,
) {
  if (autoSyncStarted) return;
  autoSyncStarted = true;
  autoSyncState.enabled = /^(1|true|yes)$/i.test(
    process.env.NEOTEL_FTP_AUTO_SYNC || "false",
  );
  autoSyncState.intervalMinutes = Math.max(
    5,
    Number(process.env.NEOTEL_FTP_SYNC_INTERVAL_MINUTES || 30) || 30,
  );
  if (!autoSyncState.enabled) return;

  const run = async () => {
    autoSyncState.running = true;
    autoSyncState.lastAttemptAt = new Date().toISOString();
    autoSyncState.lastError = "";
    try {
      const result = await syncNeotelReportsFromFtp(tempDirectory);
      autoSyncState.lastSuccessAt = new Date().toISOString();
      onLog(
        `Sincronización automática: ${result.imported} nuevos, ${result.duplicates} duplicados, ${result.errors} errores.`,
      );
    } catch (error) {
      autoSyncState.lastError = error instanceof Error ? error.message : String(error);
      onLog(`Falló la sincronización automática: ${autoSyncState.lastError}`);
    } finally {
      autoSyncState.running = false;
    }
  };

  const initialTimer = setTimeout(run, 3_000);
  initialTimer.unref();
  const interval = setInterval(run, autoSyncState.intervalMinutes * 60_000);
  interval.unref();
}
