import type {
  AnalysisResult,
  AnalysisMeta,
  ANISummary,
  CallRecord,
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

function normalizeEstado(value?: string): string {
  return (value || "").toLowerCase().replace(/\s/g, "");
}

function normalizeSubestado(value?: string): string {
  return (value || "").toLowerCase().replace(/\s/g, "");
}

function isAnswerAgent(record: CallRecord): boolean {
  const estado = normalizeEstado(record.estado);
  const subestado = normalizeSubestado(record.subestado);

  return estado === "answer" && subestado.includes("agent");
}

function isAnswerMachine(record: CallRecord): boolean {
  const estado = normalizeEstado(record.estado);
  const subestado = normalizeSubestado(record.subestado);

  return (
    estado === "answer" &&
    (subestado.includes("machine") ||
      subestado.includes("answering") ||
      subestado.includes("buzon") ||
      subestado.includes("voicemail"))
  );
}

function isNoAnswer(record: CallRecord): boolean {
  return normalizeEstado(record.estado) === "noanswer";
}

function isBusy(record: CallRecord): boolean {
  return normalizeEstado(record.estado) === "busy";
}

function isRejected(record: CallRecord): boolean {
  return normalizeEstado(record.estado) === "rejected";
}

function isUnallocated(record: CallRecord): boolean {
  return normalizeEstado(record.estado) === "unallocated";
}

function isNoContacto(record: CallRecord): boolean {
  return (
    isNoAnswer(record) ||
    isBusy(record) ||
    isRejected(record) ||
    isUnallocated(record)
  );
}

export function applyRecordFilters(
  records: CallRecord[],
  filters?: RecordsFilter
): CallRecord[] {
  if (!filters) return records;

  const estados = new Set((filters.estados || []).map((s) => s.toUpperCase()));
  const subestados = new Set((filters.subestados || []).map((s) => s.toUpperCase()));
  const bases = new Set(filters.bases || []);
  const aniContains = (filters.aniContains || "").trim();
  const durMin = typeof filters.durMin === "number" ? filters.durMin : 0;
  const durMax =
    typeof filters.durMax === "number" ? filters.durMax : Number.POSITIVE_INFINITY;

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
    const np = normalizeColumn(p);
    if (columnMap.has(np)) {
      return columnMap.get(np) || null;
    }
  }

  return null;
}

function assignTag(summary: ANISummary): TagType {
  if (summary.intentosUnallocated >= 3) return "INVALIDO";
  if (summary.intentosAnswerAgent >= 1) return "CONTACTADO";
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
  const digits = (ani || "").replace(/\D/g, "");

  if (digits.startsWith("54")) {
    const rest = digits.slice(2);

    if (rest.startsWith("9")) {
      const afterNine = rest.slice(1);
      if (afterNine.startsWith("11")) return "11";
      for (const len of [4, 3, 2]) {
        if (afterNine.length >= len) return afterNine.slice(0, len);
      }
    }

    if (rest.startsWith("11")) return "11";

    for (const len of [4, 3, 2]) {
      if (rest.length >= len) return rest.slice(0, len);
    }
  }

  if (digits.startsWith("11")) return "11";

  for (const len of [4, 3, 2]) {
    if (digits.length >= len) return digits.slice(0, len);
  }

  return digits.slice(0, 2) || "00";
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTicketDate(value?: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (value > 20000) return excelSerialToDate(value);
    return null;
  }

  const s = String(value).trim();
  if (!s) return null;

  if (/^\d+(\.\d+)?$/.test(s)) {
    const num = Number(s);
    if (Number.isFinite(num) && num > 20000) return excelSerialToDate(num);
  }

  if (/^\d{8}$/.test(s)) {
    const year = Number(s.slice(0, 4));
    const month = Number(s.slice(4, 6));
    const day = Number(s.slice(6, 8));
    const d = new Date(year, month - 1, day, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const isoTry = new Date(s);
  if (!Number.isNaN(isoTry.getTime())) return isoTry;

  const [datePart, timePart] = s.split(" ");
  if (!datePart) return null;

  const sep = datePart.includes("-") ? "-" : datePart.includes("/") ? "/" : null;
  if (!sep) return null;

  const [ddStr, mmStr, yyyyStr] = datePart.split(sep);
  const dd = Number(ddStr);
  const mm = Number(mmStr);
  const yyyy = Number(yyyyStr);

  let hh = 0;
  let mi = 0;
  let ss = 0;

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

  if (h >= 9 && h < 11) return "09:00-11:00";
  if (h >= 11 && h < 13) return "11:00-13:00";
  if (h >= 13 && h < 15) return "13:00-15:00";
  if (h >= 15 && h < 17) return "15:00-17:00";
  if (h >= 17 && h < 19) return "17:00-19:00";
  return "Fuera de rango";
}

function getTurno(dateStr?: string): string {
  const d = parseTicketDate(dateStr);
  if (!d) return "Mañana";

  return d.getHours() < 14 ? "Mañana" : "Tarde";
}

function buildBaseInsights(records: CallRecord[], aniSummaries: ANISummary[]) {
  const baseMap = new Map<string, CallRecord[]>();

  records.forEach((record) => {
    const base = (record.base || "SIN_BASE").trim();
    const current = baseMap.get(base) || [];
    current.push(record);
    baseMap.set(base, current);
  });

  return Array.from(baseMap.entries())
    .map(([base, baseRecords]) => {
      const anisBase = new Set(baseRecords.map((r) => r.ani).filter(Boolean));
      const totalAnis = anisBase.size || 1;

      const summariesBase = aniSummaries.filter((s) => anisBase.has(s.ani));

      const contactados = summariesBase.filter((s) => s.intentosAnswerAgent > 0).length;
      const conBuzon = summariesBase.filter((s) => s.intentosAnsweringMachine > 0).length;
      const invalidos = summariesBase.filter((s) => s.tagTelefono === "INVALIDO").length;
      const aDepurar = summariesBase.filter((s) =>
        ["INVALIDO", "SOLO_BUZON", "NO_ATIENDE", "RECHAZA"].includes(s.tagTelefono)
      ).length;

      const pctContactoEfectivo = contactados / totalAnis;
      const pctBuzon = conBuzon / totalAnis;
      const pctInvalidos = invalidos / totalAnis;
      const pctADepurar = aDepurar / totalAnis;

      const intentosPromedio =
        summariesBase.length > 0
          ? summariesBase.reduce((acc, s) => acc + s.intentosTotales, 0) / summariesBase.length
          : 0;

      const scoreCalidad =
        pctContactoEfectivo * 0.5 +
        (1 - pctADepurar) * 0.25 +
        (1 - pctInvalidos) * 0.15 +
        Math.max(0, 1 - intentosPromedio / 10) * 0.1;

      let recomendacion = "REVISAR";
      if (scoreCalidad >= 0.75) recomendacion = "UTILIZAR";
      else if (scoreCalidad < 0.45) recomendacion = "DESCARTAR";

      return {
        base,
        totalRegistros: baseRecords.length,
        totalAnis,
        contactados,
        pctContactoEfectivo,
        pctBuzon,
        pctInvalidos,
        pctADepurar,
        intentosPromedio,
        scoreCalidad,
        recomendacion,
      };
    })
    .sort((a, b) => b.scoreCalidad - a.scoreCalidad);
}

function buildDepuracionInsights(aniSummaries: ANISummary[]) {
  return aniSummaries.map((s) => {
    let prioridad = "MEDIA";
    let accion = "REINTENTAR";
    let motivo = "Aún tiene margen operativo";

    switch (s.tagTelefono) {
      case "CONTACTADO":
        prioridad = "BAJA";
        accion = "NO_REINTENTAR";
        motivo = "Ya tuvo contacto efectivo";
        break;
      case "INVALIDO":
        prioridad = "ALTA";
        accion = "ELIMINAR";
        motivo = "Múltiples intentos unallocated";
        break;
      case "SOLO_BUZON":
        prioridad = "MEDIA";
        accion = "CAMBIAR_ESTRATEGIA";
        motivo = "Predominio de contestador";
        break;
      case "NO_ATIENDE":
        prioridad = "ALTA";
        accion = "LIMITAR_REINTENTOS";
        motivo = "Exceso de no answer sin contacto";
        break;
      case "RECHAZA":
        prioridad = "ALTA";
        accion = "EXCLUIR";
        motivo = "Rechazo reiterado";
        break;
      case "SEGUIR_INTENTANDO":
        prioridad = "MEDIA";
        accion = "REINTENTAR";
        motivo = "No agotó criterios de corte";
        break;
    }

    return {
      ani: s.ani,
      tag: s.tagTelefono,
      prioridad,
      accion,
      motivo,
    };
  });
}

function buildFranjaDistribucion(records: CallRecord[]) {
  const franjaDistribucion: Record<
    string,
    { total: number; contactoEfectivo: number; noContacto: number }
  > = {};

  records.forEach((record) => {
    const rango = getRangoHorario(record.fecha);

    if (!franjaDistribucion[rango]) {
      franjaDistribucion[rango] = {
        total: 0,
        contactoEfectivo: 0,
        noContacto: 0,
      };
    }

    franjaDistribucion[rango].total++;

    if (isAnswerAgent(record)) {
      franjaDistribucion[rango].contactoEfectivo++;
    } else if (isNoContacto(record) || isAnswerMachine(record)) {
      franjaDistribucion[rango].noContacto++;
    }
  });

  return franjaDistribucion;
}

export function processCallRecords(rawData: Record<string, any>[]): AnalysisResult {
  const columns = rawData.length > 0 ? Object.keys(rawData[0]) : [];

  const colEstado = findColumn(columns, ["ESTADO", "STATUS", "STATE"]) || "Estado";
  const colSubestado = findColumn(columns, ["SUBESTADO", "SUBESTATUS", "SUBSTATE"]) || "Sub-Estado";
  const colAni =
    findColumn(columns, [
      "ANI",
      "ANI/TELÉFONO",
      "ANITELEFONO",
      "TELEFONO",
      "PHONE",
      "NUMEROLLAMADO",
      "NUMERO",
    ]) || "ANI/Teléfono";
  const colBase = findColumn(columns, ["BASE", "NOMBREBASE", "ORIGEN"]) || "Base";
  const colDuracion =
    findColumn(columns, ["DURACION", "DURACIONENSEGUNDOS", "SEGUNDOS", "DURATION"]) ||
    "Duración";
  const colFecha =
    findColumn(columns, [
      "INICIO",
      "FECHAINICIO",
      "FECHAHORA",
      "LOGTIME",
      "FECHALLAMADA",
      "START",
      "BEGIN",
    ]) || "Inicio";

  const records: CallRecord[] = rawData.map((row) => {
    const parsed = parseTicketDate(row[colFecha]);

    return {
      fecha: parsed ? parsed.toISOString() : row[colFecha]?.toString() || undefined,
      estado: row[colEstado]?.toString() || "",
      subestado: row[colSubestado]?.toString() || undefined,
      ani: row[colAni]?.toString()?.trim() || "",
      base: row[colBase]?.toString() || undefined,
      duracion: Number.isFinite(Number(row[colDuracion]))
        ? Number(row[colDuracion])
        : undefined,
      direccion: row["Dirección"]?.toString() || row["Direccion"]?.toString() || undefined,
      conexion: row["Conexión"]?.toString() || row["Conexion"]?.toString() || undefined,
      fin: row["Fin"]?.toString() || undefined,
    };
  });

  const rangoDistribucion: Record<string, { total: number; answer: number; noAnswer: number }> = {};

  records.forEach((record) => {
    const rango = getRangoHorario(record.fecha);

    if (!rangoDistribucion[rango]) {
      rangoDistribucion[rango] = { total: 0, answer: 0, noAnswer: 0 };
    }

    rangoDistribucion[rango].total++;

    if (isAnswerAgent(record)) {
      rangoDistribucion[rango].answer++;
    } else if (isNoContacto(record) || isAnswerMachine(record)) {
      rangoDistribucion[rango].noAnswer++;
    }
  });

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
      if (isAnswerAgent(call)) intentosAnswerAgent++;
      else if (isAnswerMachine(call)) intentosAnsweringMachine++;
      else if (isNoAnswer(call)) intentosNoAnswer++;
      else if (isBusy(call)) intentosBusy++;
      else if (isUnallocated(call)) intentosUnallocated++;
      else if (isRejected(call)) intentosRejected++;
    });

    const summary: ANISummary = {
      ani,
      intentosTotales: sortedCalls.length,
      intentosAnswerAgent,
      intentosAnsweringMachine,
      intentosNoAnswer,
      intentosBusy,
      intentosUnallocated,
      intentosRejected,
      primerLlamado: sortedCalls[0]?.fecha,
      ultimoLlamado: sortedCalls[sortedCalls.length - 1]?.fecha,
      tagTelefono: "",
    };

    summary.tagTelefono = assignTag(summary);
    aniSummaries.push(summary);
  });

  const estadoDistribucion: Record<string, number> = {};
  records.forEach((record) => {
    const estado = record.estado?.toUpperCase() || "SIN_ESTADO";
    estadoDistribucion[estado] = (estadoDistribucion[estado] || 0) + 1;
  });

  const tagDistribucion: Record<string, number> = {};
  aniSummaries.forEach((s) => {
    tagDistribucion[s.tagTelefono] = (tagDistribucion[s.tagTelefono] || 0) + 1;
  });

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

    if (isAnswerAgent(record)) {
      turnoDistribucion[turno].answer++;
    } else if (isNoContacto(record) || isAnswerMachine(record)) {
      turnoDistribucion[turno].noAnswer++;
    }
  });

  const prefijoCount: Record<string, number> = {};
  const prefijoAnswerCount: Record<string, number> = {};

  records.forEach((record) => {
    const prefijo = extractPrefijo(record.ani);
    prefijoCount[prefijo] = (prefijoCount[prefijo] || 0) + 1;

    if (isAnswerAgent(record)) {
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

  const firstContactIntento: Record<number, number> = {};
  aniGroups.forEach((calls) => {
    const sortedCalls = [...calls].sort((a, b) => {
      const da = parseTicketDate(a.fecha);
      const db = parseTicketDate(b.fecha);
      if (!da || !db) return 0;
      return da.getTime() - db.getTime();
    });

    for (let i = 0; i < sortedCalls.length; i++) {
      if (isAnswerAgent(sortedCalls[i])) {
        const intento = i + 1;
        firstContactIntento[intento] = (firstContactIntento[intento] || 0) + 1;
        break;
      }
    }
  });

  const curvaContactacion = Object.entries(firstContactIntento)
    .map(([intento, cantidad]) => ({
      intento: parseInt(intento, 10),
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
      intentos: parseInt(intentos, 10),
      cantidad,
      porcentaje: totalAnis > 0 ? (cantidad / totalAnis) * 100 : 0,
    }))
    .sort((a, b) => a.intentos - b.intentos)
    .slice(0, 10);

  const anisContactados = aniSummaries.filter((s) => s.intentosAnswerAgent > 0).length;
  const anisADepurar = aniSummaries.filter((s) =>
    ["INVALIDO", "SOLO_BUZON", "NO_ATIENDE", "RECHAZA"].includes(s.tagTelefono)
  ).length;

  const totalContactoEfectivo = records.filter(isAnswerAgent).length;
  const totalNoContacto = records.filter((r) => isNoContacto(r) || isAnswerMachine(r)).length;

  const pctAnswer = totalRecords > 0 ? (totalContactoEfectivo / totalRecords) * 100 : 0;
  const pctNoAnswer = totalRecords > 0 ? (totalNoContacto / totalRecords) * 100 : 0;

  const baseInsights = buildBaseInsights(records, aniSummaries);
  const depuracionInsights = buildDepuracionInsights(aniSummaries);
  const franjaDistribucion = buildFranjaDistribucion(records);

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
    curvaContactacion,
    intentosDistribucion,
    aniSummaries,
    rawRecords: records,
    rangoDistribucion,
    baseInsights,
    depuracionInsights,
    franjaDistribucion,
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