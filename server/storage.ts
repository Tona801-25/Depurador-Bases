import type { AnalysisResult, ANISummary, CallRecord, TagType, PrefijoCatalogo } from "@shared/schema";
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

function getTurno(dateStr: string | undefined): string {
  if (!dateStr) return "Mañana";
  try {
    const date = new Date(dateStr);
    const hour = date.getHours();
    return hour < 14 ? "Mañana" : "Tarde";
  } catch {
    return "Mañana";
  }
}

export function processCallRecords(rawData: Record<string, any>[]): AnalysisResult {
  const columns = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  
  const colEstado = findColumn(columns, ["ESTADO", "STATUS", "STATE"]) || "Estado";
  const colSubestado = findColumn(columns, ["SUBESTADO", "SUBESTATUS", "SUBSTATE"]) || "Sub-Estado";
  const colAni = findColumn(columns, ["ANI", "ANITELEFONO", "TELEFONO", "PHONE", "NUMEROLLAMADO", "NUMERO"]) || "ANI/Teléfono";
  const colBase = findColumn(columns, ["BASE", "NOMBREBASE", "ORIGEN"]) || "Base";
  const colDuracion = findColumn(columns, ["DURACION", "DURACIONENSEGUNDOS", "SEGUNDOS", "DURATION"]) || "Duración";
  const colFecha = findColumn(columns, ["FECHAINICIO", "FECHAHORA", "INICIO", "LOGTIME", "FECHALLAMADA"]) || "Inicio";

  const records: CallRecord[] = rawData.map((row) => ({
    fecha: row[colFecha]?.toString() || undefined,
    estado: row[colEstado]?.toString() || "",
    subestado: row[colSubestado]?.toString() || undefined,
    ani: row[colAni]?.toString()?.trim() || "",
    base: row[colBase]?.toString() || undefined,
    duracion: parseFloat(row[colDuracion]) || undefined,
    direccion: row["Dirección"]?.toString() || row["Direccion"]?.toString() || undefined,
    conexion: row["Conexión"]?.toString() || row["Conexion"]?.toString() || undefined,
    fin: row["Fin"]?.toString() || undefined,
  }));

  const aniGroups = new Map<string, CallRecord[]>();
  records.forEach((record) => {
    if (!record.ani) return;
    const existing = aniGroups.get(record.ani) || [];
    existing.push(record);
    aniGroups.set(record.ani, existing);
  });

  const aniSummaries: ANISummary[] = [];
  
  aniGroups.forEach((calls, ani) => {
    const sortedCalls = [...calls].sort((a, b) => {
      if (!a.fecha || !b.fecha) return 0;
      return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
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
        (subestado.includes("answering") || subestado.includes("machine"))
      ) {
        intentosAnsweringMachine++;
      } else if (estado === "noanswer") {
        intentosNoAnswer++;
      } else if (estado === "busy") {
        intentosBusy++;
      } else if (estado === "unallocated" || subestado === "unallocated") {
        intentosUnallocated++;
      } else if (estado === "rejected" || subestado === "rejected") {
        intentosRejected++;
      }
    });

    const summary: ANISummary = {
      ani,
      intentosTotales: calls.length,
      intentosAnswerAgent,
      intentosAnsweringMachine,
      intentosNoAnswer,
      intentosBusy,
      intentosUnallocated,
      intentosRejected,
      primerLlamado: sortedCalls[0]?.fecha,
      ultimoLlamado: sortedCalls[sortedCalls.length - 1]?.fecha,
      tagTelefono: "SEGUIR_INTENTANDO",
    };

    summary.tagTelefono = assignTag(summary);
    aniSummaries.push(summary);
  });

  const estadoDistribucion: Record<string, number> = {};
  records.forEach((record) => {
    const estado = (record.estado || "UNKNOWN").toUpperCase();
    estadoDistribucion[estado] = (estadoDistribucion[estado] || 0) + 1;
  });

  const tagDistribucion: Record<string, number> = {};
  aniSummaries.forEach((s) => {
    tagDistribucion[s.tagTelefono] = (tagDistribucion[s.tagTelefono] || 0) + 1;
  });

  const turnoDistribucion: Record<string, { total: number; answer: number; noAnswer: number }> = {
    "Mañana": { total: 0, answer: 0, noAnswer: 0 },
    "Tarde": { total: 0, answer: 0, noAnswer: 0 },
  };
  records.forEach((record) => {
    const turno = getTurno(record.fecha);
    turnoDistribucion[turno].total++;
    const estado = (record.estado || "").toLowerCase().replace(/\s/g, "");
    if (estado === "answer") {
      turnoDistribucion[turno].answer++;
    } else if (estado === "noanswer") {
      turnoDistribucion[turno].noAnswer++;
    }
  });

  const prefijoCount: Record<string, number> = {};
  records.forEach((record) => {
    const prefijo = extractPrefijo(record.ani);
    prefijoCount[prefijo] = (prefijoCount[prefijo] || 0) + 1;
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

  const firstContactIntento: Record<number, number> = {};
  aniGroups.forEach((calls, ani) => {
    const sortedCalls = [...calls].sort((a, b) => {
      if (!a.fecha || !b.fecha) return 0;
      return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
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
    .map(([intento, cantidad]) => ({
      intento: parseInt(intento),
      cantidad,
    }))
    .sort((a, b) => a.intento - b.intento);

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
    curvaContactacion,
    intentosDistribucion,
    aniSummaries,
    rawRecords: records,
  };
}

export function generateCSV(data: Record<string, any>[]): string {
  if (data.length === 0) return "";
  
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );
  
  return [headers.join(","), ...rows].join("\n");
}
