import { parentPort, workerData } from "node:worker_threads";
import fs from "node:fs";
import * as XLSX from "xlsx";
import Papa from "papaparse";

import { processCallRecords } from "./storage.ts";
import { saveAnalysisToLocalDb } from "./localDb.ts";

type UploadWorkerFile = {
  path: string;
  originalName: string;
};

type UploadWorkerData = {
  files: UploadWorkerFile[];
};

const FULL_ANALYSIS_RESPONSE_LIMIT = 400_000;

function extractFechaArchivoFromName(fileName: string): string | undefined {
  const normalized = fileName.trim();

  const compactDate = normalized.match(
    /(?:^|[^0-9])(\d{2})(\d{2})(20\d{2})(?:[^0-9]|$)/,
  );
  if (compactDate) {
    const [, dd, mm, yyyy] = compactDate;
    return `${dd}/${mm}/${yyyy}`;
  }

  const separatedDate = normalized.match(
    /(?:^|[^0-9])(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})(?:[^0-9]|$)/,
  );
  if (separatedDate) {
    const [, d, m, yyyy] = separatedDate;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${yyyy}`;
  }

  const isoDate = normalized.match(
    /(?:^|[^0-9])(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?:[^0-9]|$)/,
  );
  if (isoDate) {
    const [, yyyy, m, d] = isoDate;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${yyyy}`;
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

function readUploadedFile(file: UploadWorkerFile): Record<string, unknown>[] {
  const lowerName = file.originalName.toLowerCase();

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt")) {
    const content = decodeDelimitedFile(fs.readFileSync(file.path));
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
    const workbook = XLSX.read(fs.readFileSync(file.path), {
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

function run() {
  if (!parentPort) {
    throw new Error("El worker de carga no tiene un canal de comunicación.");
  }

  const { files } = workerData as UploadWorkerData;
  let allRecords: Record<string, unknown>[] = [];

  for (const file of files) {
    const records = readUploadedFile(file);
    const fechaArchivo = extractFechaArchivoFromName(file.originalName) || "";

    allRecords = allRecords.concat(
      records.map((row) => ({
        ...row,
        __archivoOrigen: file.originalName,
        __fechaArchivo: fechaArchivo,
      })),
    );
  }

  if (allRecords.length === 0) {
    throw new Error("No se pudieron leer datos de los archivos seleccionados.");
  }

  const initialAnalysis = processCallRecords(allRecords);
  const usableRecords = initialAnalysis.rawRecords.filter(
    (record) => record.ani.trim() && record.estado.trim(),
  );

  if (usableRecords.length === 0) {
    throw new Error(
      "El archivo no parece ser un ticket de llamadas de Neotel. Debe incluir ANI/Teléfono y Estado; para analizar horarios también debe incluir Inicio.",
    );
  }

  const analysisResult =
    usableRecords.length === initialAnalysis.rawRecords.length
      ? initialAnalysis
      : processCallRecords(usableRecords);

  allRecords = [];

  let sqliteResult: ReturnType<typeof saveAnalysisToLocalDb> | undefined;
  let sqliteError: string | undefined;

  try {
    sqliteResult = saveAnalysisToLocalDb(analysisResult);
  } catch (error) {
    sqliteError = error instanceof Error ? error.message : String(error);
  }

  const clientAnalysis =
    analysisResult.totalRecords > FULL_ANALYSIS_RESPONSE_LIMIT
      ? {
          ...analysisResult,
          aniSummaries: [],
          rawRecords: [],
          clientDataMode: "summary",
        }
      : analysisResult;

  parentPort.postMessage({
    type: "success",
    analysisResult: clientAnalysis,
    sqliteResult,
    sqliteError,
  });
  parentPort.close();
}

try {
  run();
} catch (error) {
  parentPort?.postMessage({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
  parentPort?.close();
}
