import fs from "node:fs";

import Papa from "papaparse";
import * as XLSX from "xlsx";

import { saveAnalysisToLocalDb } from "./localDb.ts";
import { processCallRecords } from "./storage.ts";

export const NEOTEL_TICKET_FILE_PATTERN =
  /^Tickets_20\d{2}-\d{2}-\d{2}\.(csv|txt|xls|xlsx)$/i;

function extractFechaArchivoFromName(fileName: string): string | undefined {
  const normalized = fileName.trim();

  const isoDate = normalized.match(
    /(?:^|[^0-9])(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?:[^0-9]|$)/,
  );
  if (isoDate) {
    const [, yyyy, month, day] = isoDate;
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${yyyy}`;
  }

  const separatedDate = normalized.match(
    /(?:^|[^0-9])(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})(?:[^0-9]|$)/,
  );
  if (separatedDate) {
    const [, day, month, yyyy] = separatedDate;
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${yyyy}`;
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
  const nullBytes = sample.reduce(
    (total, byte) => total + (byte === 0 ? 1 : 0),
    0,
  );

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

function readTicketRows(buffer: Buffer, fileName: string) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt")) {
    const content = decodeDelimitedFile(buffer);
    const result = Papa.parse<Record<string, unknown>>(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimiter: detectDelimiter(content),
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    });

    return result.data;
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
    });

    return workbook.SheetNames.flatMap((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return [];

      return XLSX.utils
        .sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: "",
          raw: false,
        })
        .filter((row) =>
          Object.values(row).some((value) => String(value ?? "").trim() !== ""),
        );
    });
  }

  return [];
}

export function importNeotelTicketBuffer(
  buffer: Buffer,
  fileName: string,
  source: "FTP" | "MANUAL" | "LOCAL" = "MANUAL",
  remotePath?: string,
) {
  const rows = readTicketRows(buffer, fileName);
  const fechaArchivo = extractFechaArchivoFromName(fileName) || "";
  const archivoOrigen = remotePath && source === "FTP" ? fileName : fileName;

  if (rows.length === 0) {
    throw new Error("No se pudieron leer datos del ticket.");
  }

  const analysis = processCallRecords(
    rows.map((row) => ({
      ...row,
      __archivoOrigen: archivoOrigen,
      __fechaArchivo: fechaArchivo,
    })),
  );

  const usableRecords = analysis.rawRecords.filter(
    (record) => record.ani.trim() && record.estado.trim(),
  );

  if (usableRecords.length === 0) {
    throw new Error(
      "El archivo no parece ser un ticket de llamadas de Neotel. Debe incluir ANI/Teléfono y Estado.",
    );
  }

  const finalAnalysis =
    usableRecords.length === analysis.rawRecords.length
      ? analysis
      : processCallRecords(
          usableRecords.map((record) => ({
            ...record,
            __archivoOrigen: archivoOrigen,
            __fechaArchivo: fechaArchivo,
          })),
        );

  const sqliteResult = saveAnalysisToLocalDb(finalAnalysis);

  return {
    fileName,
    status: sqliteResult.insertedFiles > 0 ? "IMPORTADO" : "DUPLICADO",
    reportType: "TICKET",
    insertedFiles: sqliteResult.insertedFiles,
    duplicatedFiles: sqliteResult.duplicatedFiles,
    insertedRecords: sqliteResult.insertedRecords,
    duplicatedRecords: sqliteResult.duplicatedRecords,
  };
}

export function importNeotelTicketFile(filePath: string, source: "LOCAL" | "MANUAL" = "LOCAL") {
  return importNeotelTicketBuffer(
    fs.readFileSync(filePath),
    filePath.split(/[\\/]/).pop() || filePath,
    source,
    filePath,
  );
}
