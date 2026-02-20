import type {
  AnalysisResult,
  AnalysisMeta,
  ANISummary,
  CallRecord,
  PrefijoCatalogo,
  RecordsFilter,
  TagType,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  storeAnalysis(analysis: AnalysisResult): Promise<AnalysisResult>;
  getAnalysis(id: string): Promise<AnalysisResult | undefined>;
  getAllAnalyses(): Promise<AnalysisResult[]>;
}

export class MemStorage implements IStorage {
  private analyses: Map<string, AnalysisResult>;

  constructor() {
    this.analyses = new Map();
  }

  async storeAnalysis(analysis: AnalysisResult): Promise<AnalysisResult> {
    this.analyses.set(analysis.id, analysis);
    return analysis;
  }

  async getAnalysis(id: string): Promise<AnalysisResult | undefined> {
    return this.analyses.get(id);
  }

  async getAllAnalyses(): Promise<AnalysisResult[]> {
    return Array.from(this.analyses.values());
  }
}

export const storage = new MemStorage();
function normalizeColumn(col: string): string {
  return col
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s\-\/]/g, "");
}

export function applyRecordFilters(records: CallRecord[], filters?: RecordsFilter): CallRecord[] {
  if (!filters) return records;

  const estados = new Set((filters.estados || []).map((s) => s.toUpperCase()));
  const subestados = new Set((filters.subestados || []).map((s) => s.toUpperCase()));
  const bases = new Set(filters.bases || []);
  const aniContains = (filters.aniContains || "").trim();
  const durMin = typeof filters.durMin === "number" ? filters.durMin : 0;
  const durMax = typeof filters.durMax === "number" ? filters.durMax : Number.POSITIVE_INFINITY;

  return records.filter((r) => {
    if (estados.size > 0 && !estados.has((r.estado || "").toUpperCase())) return false;
    if (subestados.size > 0 && !subestados.has((r.subestado || "").toUpperCase())) return false;
    if (bases.size > 0 && !bases.has(r.base || "")) return false;
    if (aniContains && !(r.ani || "").includes(aniContains)) return false;
    const d = r.duracion ?? 0;
    if (d < durMin || d > durMax) return false;
    return true;
  });
}

export function computeAnalysisMeta(analysis: AnalysisResult): AnalysisMeta {
  const estados = new Set<string>();
  const subestados = new Set<string>();
  const bases = new Set<string>();
  let maxDur = 0;

  for (const r of analysis.rawRecords) {
    if (r.estado) estados.add(r.estado.toUpperCase());
    if (r.subestado) subestados.add(r.subestado.toUpperCase());
    if (r.base) bases.add(r.base);
    const d = r.duracion ?? 0;
    if (d > maxDur) maxDur = d;
  }

  if (maxDur <= 0) maxDur = 3600;

  return {
    distinctEstados: Array.from(estados).sort(),
    distinctSubestados: Array.from(subestados).sort(),
    distinctBases: Array.from(bases).sort(),
    maxDuracion: maxDur,
  };
}

function findColumn(columns: string[], possibles: string[]): string | null {
  const normalizedColumns = columns.map(normalizeColumn);
  const columnMap = new Map(columns.map((c, i) => [normalizedColumns[i], c]));

  for (const p of possibles) {
    if (columnMap.has(p)) {
      return columnMap.get(p) || null;
    }
  }
  return null;
}

function assignTag(summary: ANISummary): TagType {
  if (summary.intentosUnallocated >= 3) {
    return "INVALIDO";
  }
  if (summary.intentosAnswerAgent >= 1) {
    return "CONTACTADO";
  }
  if (summary.intentosAnsweringMachine >= 5 && summary.intentosAnswerAgent === 0) {
    return "SOLO_BUZON";
  }
  if (
    summary.intentosNoAnswer >= 6 &&
    summary.intentosAnswerAgent === 0 &&
    summary.intentosAnsweringMachine === 0
  ) {
    return "NO_ATIENDE";
  }
  if (summary.intentosRejected >= 3 && summary.intentosAnswerAgent === 0) {
    return "RECHAZA";
  }
  return "SEGUIR_INTENTANDO";
}

function extractPrefijo(ani: string): string {
  const digits = ani.replace(/\D/g, "");
  if (digits.startsWith("54")) {
    const rest = digits.slice(2);
    if (rest.startsWith("9")) {
      const afterNine = rest.slice(1);
      if (afterNine.startsWith("11")) return "11";
      for (const len of [4, 3, 2]) {
        if (afterNine.length >= len) {
          return afterNine.slice(0, len);
        }
      }
    }
    if (rest.startsWith("11")) return "11";
    for (const len of [4, 3, 2]) {
      if (rest.length >= len) {
        return rest.slice(0, len);
      }
    }
  }
  if (digits.startsWith("11")) return "11";
  for (const len of [4, 3, 2]) {
    if (digits.length >= len) {
      return digits.slice(0, len);
    }
  }
  return digits.slice(0, 2) || "00";
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;

  // Excel (Windows) epoch: 1899-12-30
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTicketDate(value?: unknown): Date | null {
  if (value === null || value === undefined) return null;

  // 1) Si ya viene como número (Excel serial)
  if (typeof value === "number") {
    // Heurística: serials válidos suelen ser > 20000 (~1954)
    if (value > 20000) return excelSerialToDate(value);
    return null;
  }

  const s = String(value).trim();
  if (!s) return null;

  // 2) Si viene como string numérico (ej: "46096.46079")
  if (/^\d+(\.\d+)?$/.test(s)) {
    const num = Number(s);
    if (Number.isFinite(num) && num > 20000) return excelSerialToDate(num);
  }

  // 3) Caso YYYYMMDD (ej: 20260213)
  if (/^\d{8}$/.test(s)) {
    const year = Number(s.slice(0, 4));
    const month = Number(s.slice(4, 6));
    const day = Number(s.slice(6, 8));
    const d = new Date(year, month - 1, day, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // 4) ISO o YYYY-MM-DD...
  const isoTry = new Date(s);
  if (!Number.isNaN(isoTry.getTime())) return isoTry;

  // 5) "DD-MM-YYYY HH:mm:ss" o "DD/MM/YYYY HH:mm:ss"
  const [datePart, timePart] = s.split(" ");
  if (!datePart) return null;

  const sep = datePart.includes("-") ? "-" : (datePart.includes("/") ? "/" : null);
  if (!sep) return null;

  const [ddStr, mmStr, yyyyStr] = datePart.split(sep);
  const dd = Number(ddStr);
  const mm = Number(mmStr);
  const yyyy = Number(yyyyStr);

  let hh = 0, mi = 0, ss = 0;
  if (timePart) {
    const t = timePart.split(":").map(Number);
    hh = t[0] ?? 0;
    mi = t[1] ?? 0;
    ss = t[2] ?? 0;
  }

  if (![dd, mm, yyyy, hh, mi, ss].every(Number.isFinite)) return null;

  const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getRangoHorario(dateStr?: string): string {
  const d = parseTicketDate(dateStr);
  if (!d) return "Sin hora";

  const h = d.getHours();
  if (h >= 9 && h < 12) return "09:00-12:00";
  if (h >= 12 && h < 15) return "12:00-15:00";
  if (h >= 15 && h < 18) return "15:00-18:00";
  return "Fuera de rango";
}

function getTurno(dateStr: string | undefined): string {
  const d = parseTicketDate(dateStr);
  if (!d) return "Mañana"; // default seguro
  const hour = d.getHours();
  return hour < 14 ? "Mañana" : "Tarde";
}

export function processCallRecords(rawData: Record<string, any>[]): AnalysisResult {
  const columns = rawData.length > 0 ? Object.keys(rawData[0]) : [];

  const colEstado =
    findColumn(columns, ["ESTADO", "STATUS", "STATE"]) || "Estado";
  const colSubestado =
    findColumn(columns, ["SUBESTADO", "SUBESTATUS", "SUBSTATE"]) || "Sub-Estado";
  const colAni =
    findColumn(columns, ["ANI", "ANITELEFONO", "TELEFONO", "PHONE", "NUMEROLLAMADO", "NUMERO"]) ||
    "ANI/Teléfono";
  const colBase =
    findColumn(columns, ["BASE", "NOMBREBASE", "ORIGEN"]) || "Base";
  const colDuracion =
    findColumn(columns, ["DURACION", "DURACIONENSEGUNDOS", "SEGUNDOS", "DURATION"]) || "Duración";

  // IMPORTANTE: priorizamos INICIO porque FECHA (YYYYMMDD) no trae hora
  const colFecha =
    findColumn(columns, ["INICIO", "FECHAINICIO", "FECHAHORA", "LOGTIME", "FECHALLAMADA"]) ||
    "Inicio";

  console.log("colFecha detectada:", colFecha);
  console.log("raw sample:", rawData[0]);

  // 1) Normalizamos records
  const records: CallRecord[] = rawData.map((row) => {
  const parsed = parseTicketDate(row[colFecha]);
  return {
    fecha: parsed ? parsed.toISOString() : (row[colFecha]?.toString() || undefined),
    estado: row[colEstado]?.toString() || "",
    subestado: row[colSubestado]?.toString() || undefined,
    ani: row[colAni]?.toString()?.trim() || "",
    base: row[colBase]?.toString() || undefined,
    duracion: parseFloat(row[colDuracion]) || undefined,
    direccion: row["Dirección"]?.toString() || row["Direccion"]?.toString() || undefined,
    conexion: row["Conexión"]?.toString() || row["Conexion"]?.toString() || undefined,
    fin: row["Fin"]?.toString() || undefined,
  };
  });

  console.log("records[0].fecha:", records[0]?.fecha);

  // 2) Rango horario (09-12 / 12-15 / 15-18)
  const rangoDistribucion: Record<string, { total: number; answer: number; noAnswer: number }> = {};
  records.forEach((record) => {
    const rango = getRangoHorario(record.fecha);
    if (!rangoDistribucion[rango]) {
      rangoDistribucion[rango] = { total: 0, answer: 0, noAnswer: 0 };
    }
    rangoDistribucion[rango].total++;

    const estado = (record.estado || "").toLowerCase().replace(/\s/g, "");
    if (estado === "answer") rangoDistribucion[rango].answer++;
    else if (estado === "noanswer") rangoDistribucion[rango].noAnswer++;
  });

  // 3) Agrupación por ANI
  const aniGroups = new Map<string, CallRecord[]>();
  records.forEach((record) => {
    if (!record.ani) return;
    const existing = aniGroups.get(record.ani) || [];
    existing.push(record);
    aniGroups.set(record.ani, existing);
  });

  // 4) Resumen por ANI
  const aniSummaries: ANISummary[] = [];

  aniGroups.forEach((calls, ani) => {
    const sortedCalls = [...calls].sort((a, b) => {
      const da = parseTicketDate(a.fecha);
      const db = parseTicketDate(b.fecha);
      if (!da || !db) return 0;
      return da.getTime() - db.getTime();
    });

    let intentosAnswerAgent = 0;
    let intentosAnsweringMachine = 0;
    let intentosNoAnswer = 0;
    let intentosBusy = 0;
    let intentosUnallocated = 0;
    let intentosRejected = 0;

    sortedCalls.forEach((call) => {
      const estado = (call.estado || "").toLowerCase().replace(/\s/g, "");
      const subestado = (call.subestado || "").toLowerCase();

      if (estado === "answer" && subestado.includes("agent")) {
        intentosAnswerAgent++;
      } else if (
        estado === "answer" &&
        (subestado.includes("machine") || subestado.includes("buzon"))
      ) {
        intentosAnsweringMachine++;
      } else if (estado === "noanswer") {
        intentosNoAnswer++;
      } else if (estado === "busy") {
        intentosBusy++;
      } else if (estado === "unallocated") {
        intentosUnallocated++;
      } else if (estado === "rejected") {
        intentosRejected++;
      }
    });

    const intentosTotales = sortedCalls.length;
    const primerLlamado = sortedCalls[0]?.fecha;
    const ultimoLlamado = sortedCalls[sortedCalls.length - 1]?.fecha;

    const summary: ANISummary = {
      ani,
      intentosTotales,
      intentosAnswerAgent,
      intentosAnsweringMachine,
      intentosNoAnswer,
      intentosBusy,
      intentosUnallocated,
      intentosRejected,
      primerLlamado,
      ultimoLlamado,
      tagTelefono: "",
    };

    summary.tagTelefono = assignTag(summary);
    aniSummaries.push(summary);
  });

  // 5) Distribución de estados
  const estadoDistribucion: Record<string, number> = {};
  records.forEach((record) => {
    const estado = record.estado?.toUpperCase() || "SIN_ESTADO";
    estadoDistribucion[estado] = (estadoDistribucion[estado] || 0) + 1;
  });

  // 6) Distribución de tags
  const tagDistribucion: Record<string, number> = {};
  aniSummaries.forEach((s) => {
    tagDistribucion[s.tagTelefono] = (tagDistribucion[s.tagTelefono] || 0) + 1;
  });

  // 7) Turno Mañana / Tarde (blindado)
  const turnoDistribucion: Record<string, { total: number; answer: number; noAnswer: number }> = {
    Mañana: { total: 0, answer: 0, noAnswer: 0 },
    Tarde: { total: 0, answer: 0, noAnswer: 0 },
  };

  records.forEach((record) => {
    const turno = getTurno(record.fecha);

    if (!turnoDistribucion[turno]) {
      turnoDistribucion[turno] = { total: 0, answer: 0, noAnswer: 0 };
    }

    turnoDistribucion[turno].total++;

    const estado = (record.estado || "").toLowerCase().replace(/\s/g, "");
    if (estado === "answer") turnoDistribucion[turno].answer++;
    else if (estado === "noanswer") turnoDistribucion[turno].noAnswer++;
  });

  // 8) Prefijos (total y sobre ANSWER)
  const prefijoCount: Record<string, number> = {};
  const prefijoAnswerCount: Record<string, number> = {};

  records.forEach((record) => {
    const prefijo = extractPrefijo(record.ani);
    prefijoCount[prefijo] = (prefijoCount[prefijo] || 0) + 1;

    const estado = (record.estado || "").toLowerCase().replace(/\s/g, "");
    if (estado === "answer") {
      prefijoAnswerCount[prefijo] = (prefijoAnswerCount[prefijo] || 0) + 1;
    }
  });

  const totalRecords = records.length;

  const prefijoDistribucion = Object.entries(prefijoCount)
    .map(([prefijo, total]) => ({
      prefijo,
      total,
      pctSobreTotal: totalRecords > 0 ? (total / totalRecords) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  const totalAnswerPrefijos = Object.values(prefijoAnswerCount).reduce((a, b) => a + b, 0);

  const prefijoDistribucionAnswer = Object.entries(prefijoAnswerCount)
    .map(([prefijo, total]) => ({
      prefijo,
      total,
      pctSobreTotal: totalAnswerPrefijos > 0 ? (total / totalAnswerPrefijos) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  // 9) Prefijo predominante por HORA (usa parseTicketDate)
  const prefijoPorHoraMap: Record<number, Record<string, number>> = {};

  records.forEach((record) => {
    const date = parseTicketDate(record.fecha);
    if (!date) return;

    const hour = date.getHours();
    const prefijo = extractPrefijo(record.ani);

    if (!prefijoPorHoraMap[hour]) prefijoPorHoraMap[hour] = {};
    prefijoPorHoraMap[hour][prefijo] = (prefijoPorHoraMap[hour][prefijo] || 0) + 1;
  });

  const prefijoPorHora = Object.entries(prefijoPorHoraMap)
    .map(([hora, counts]) => {
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return { hora: Number(hora), prefijo: top?.[0] ?? "", total: top?.[1] ?? 0 };
    })
    .sort((a, b) => a.hora - b.hora);

  // 10) Curva de contactación (primer ANSWER+AGENT por intento)
  const firstContactIntento: Record<number, number> = {};

  aniGroups.forEach((calls) => {
    const sortedCalls = [...calls].sort((a, b) => {
      const da = parseTicketDate(a.fecha);
      const db = parseTicketDate(b.fecha);
      if (!da || !db) return 0;
      return da.getTime() - db.getTime();
    });

    for (let i = 0; i < sortedCalls.length; i++) {
      const call = sortedCalls[i];
      const estado = (call.estado || "").toLowerCase().replace(/\s/g, "");
      const subestado = (call.subestado || "").toLowerCase();

      if (estado === "answer" && subestado.includes("agent")) {
        const intento = i + 1;
        firstContactIntento[intento] = (firstContactIntento[intento] || 0) + 1;
        break;
      }
    }
  });

  const curvaContactacion = Object.entries(firstContactIntento)
    .map(([intento, cantidad]) => ({ intento: parseInt(intento), cantidad }))
    .sort((a, b) => a.intento - b.intento);

  // 11) Distribución de intentos por ANI
  const intentosCount: Record<number, number> = {};
  aniSummaries.forEach((s) => {
    intentosCount[s.intentosTotales] = (intentosCount[s.intentosTotales] || 0) + 1;
  });

  const totalAnis = aniSummaries.length;

  const intentosDistribucion = Object.entries(intentosCount)
    .map(([intentos, cantidad]) => ({
      intentos: parseInt(intentos),
      cantidad,
      porcentaje: totalAnis > 0 ? (cantidad / totalAnis) * 100 : 0,
    }))
    .sort((a, b) => a.intentos - b.intentos)
    .slice(0, 10);

  // 12) KPIs
  const anisContactados = aniSummaries.filter((s) => s.intentosAnswerAgent > 0).length;
  const anisADepurar = aniSummaries.filter((s) => s.tagTelefono !== "SEGUIR_INTENTANDO").length;

  const totalAnswer = estadoDistribucion["ANSWER"] || 0;
  const totalNoAnswer = estadoDistribucion["NOANSWER"] || estadoDistribucion["NO ANSWER"] || 0;

  const pctAnswer = totalRecords > 0 ? (totalAnswer / totalRecords) * 100 : 0;
  const pctNoAnswer = totalRecords > 0 ? (totalNoAnswer / totalRecords) * 100 : 0;

  return {
    id: randomUUID(),
    fileName: "uploaded_files",
    uploadedAt: new Date().toISOString(),
    totalRecords,
    totalAnis,
    anisContactados,
    anisADepurar,
    pctAnswer,
    pctNoAnswer,
    estadoDistribucion,
    tagDistribucion,
    turnoDistribucion,
    prefijoDistribucion,
    prefijoDistribucionAnswer,
    prefijoPorHora,
    curvaContactacion,
    intentosDistribucion,
    aniSummaries,
    rawRecords: records,
    rangoDistribucion,
  };
}

export function generateCSV(data: Record<string, any>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}