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

function getEstadoOperativo(record: CallRecord): string {
  const estado = normalizeEstado(record.estado);
  const subestado = normalizeSubestado(record.subestado);

  if (estado === "answer" && subestado.includes("agent")) {
    return "CONTACTO_EFECTIVO";
  }

  if (
    estado === "answer" &&
    (subestado.includes("machine") ||
      subestado.includes("answering") ||
      subestado.includes("buzon") ||
      subestado.includes("voicemail"))
  ) {
    return "CONTESTADOR_BUZON";
  }

  if (estado === "noanswer") {
    return "NO_CONTESTA";
  }

  if (estado === "busy" || estado === "rejected") {
    return "OCUPADO_RECHAZO";
  }

  if (estado === "unallocated") {
    return "INVALIDO";
  }

  return "OTROS_TECNICOS";
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

type DepuracionConfig = {
  thresholds: {
    unallocatedInvalido: number;
    answeringMachineSoloBuzon: number;
    noAnswerNoAtiende: number;
    rejectedRechaza: number;
    intentosAltos: number;
    intentosMuyAltos: number;
  };
  recencia: {
    contactoRecienteDias: number;
    enfriamientoHoras: number;
  };
  saturacion: {
    maxIntentos24h: number;
    maxIntentos48h: number;
  };
};

type ANIContext = {
  basePrincipal: string;
  prefijo: string;
  mejorFranja: string;
  ultimoEstadoNormalizado: string;
  ultimoSubestadoNormalizado: string;
  diasDesdeUltimoIntento: number | null;
  intentosUltimas24h: number;
  intentosUltimas48h: number;
  saturado: boolean;
  tuvoContactoPrevio: boolean;
  contactoReciente: boolean;
  scoreRecontactabilidad: number;
  accionSugerida: string;
  prioridad: string;
  motivoDepuracion: string;
};

const ANALYSIS_CONFIG = {
  horaInicioTarde: 14,

  muestra: {
    bajaMaxAnis: 20,
    mediaMaxAnis: 100,
    penalizacionBaja: 0.2,
    penalizacionMedia: 0.08,
  },
};

const DEFAULT_DEPURACION_CONFIG: DepuracionConfig = {
  thresholds: {
    unallocatedInvalido: 3,
    answeringMachineSoloBuzon: 5,
    noAnswerNoAtiende: 6,
    rejectedRechaza: 3,
    intentosAltos: 6,
    intentosMuyAltos: 9,
  },
  recencia: {
    contactoRecienteDias: 7,
    enfriamientoHoras: 24,
  },
  saturacion: {
    maxIntentos24h: 3,
    maxIntentos48h: 5,
  },
};

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

function assignTag(
  summary: ANISummary,
  context: ANIContext,
  config: DepuracionConfig
): TagType {
  if (summary.intentosUnallocated >= config.thresholds.unallocatedInvalido) {
    return "INVALIDO";
  }

  if (context.contactoReciente) {
    return "CONTACTADO";
  }

  if (
    summary.intentosRejected >= config.thresholds.rejectedRechaza &&
    summary.intentosAnswerAgent === 0
  ) {
    return "RECHAZA";
  }

  if (
    summary.intentosAnsweringMachine >= config.thresholds.answeringMachineSoloBuzon &&
    summary.intentosAnswerAgent === 0
  ) {
    return "SOLO_BUZON";
  }

  if (
    summary.intentosNoAnswer >= config.thresholds.noAnswerNoAtiende &&
    summary.intentosAnswerAgent === 0 &&
    summary.intentosAnsweringMachine === 0
  ) {
    return "NO_ATIENDE";
  }

  if (context.saturado && context.scoreRecontactabilidad < 45) {
    return "NO_ATIENDE";
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

  if (h < 9) return "Antes de 09:00";
  if (h >= 9 && h < 11) return "09:00-11:00";
  if (h >= 11 && h < 13) return "11:00-13:00";
  if (h >= 13 && h < 15) return "13:00-15:00";
  if (h >= 15 && h < 17) return "15:00-17:00";
  if (h >= 17 && h < 19) return "17:00-19:00";
  if (h >= 19 && h < 21) return "19:00-21:00";

  return "Después de 21:00";
}

function isFranjaOperativaValida(franja: string): boolean {
  return !["Sin hora", "Antes de 09:00", "Después de 21:00"].includes(franja);
}

function getTurno(dateStr?: string): string {
  const d = parseTicketDate(dateStr);

  if (!d) return "Sin hora";

  const hour = d.getHours();

  if (hour >= ANALYSIS_CONFIG.horaInicioTarde) return "Tarde";

  return "Mañana";
}

function hoursBetween(from: Date, to: Date): number {
  return Math.abs(to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

function daysBetween(from: Date, to: Date): number {
  return Math.abs(to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

function getAnalysisReferenceDate(records: CallRecord[]): Date {
  const dates = records
    .map((record) => parseTicketDate(record.fecha))
    .filter((date): date is Date => !!date)
    .sort((a, b) => b.getTime() - a.getTime());

  return dates[0] || new Date();
}

function getMuestraInfo(totalAnis: number) {
  if (totalAnis <= ANALYSIS_CONFIG.muestra.bajaMaxAnis) {
    return {
      confiabilidadMuestra: "BAJA",
      penalizacionMuestra: ANALYSIS_CONFIG.muestra.penalizacionBaja,
      advertenciaMuestra:
        "Muestra baja: validar antes de tomar decisiones operativas fuertes.",
    };
  }

  if (totalAnis <= ANALYSIS_CONFIG.muestra.mediaMaxAnis) {
    return {
      confiabilidadMuestra: "MEDIA",
      penalizacionMuestra: ANALYSIS_CONFIG.muestra.penalizacionMedia,
      advertenciaMuestra:
        "Muestra media: útil para lectura inicial, pero conviene validar con más volumen.",
    };
  }

  return {
    confiabilidadMuestra: "ALTA",
    penalizacionMuestra: 0,
    advertenciaMuestra:
      "Muestra confiable: volumen suficiente para priorización operativa.",
  };
}

function getEstadoNormalizado(record?: CallRecord): string {
  return normalizeEstado(record?.estado);
}

function getSubestadoNormalizado(record?: CallRecord): string {
  return normalizeSubestado(record?.subestado);
}

function getBasePrincipal(calls: CallRecord[]): string {
  const count: Record<string, number> = {};

  for (const call of calls) {
    const key = (call.base || "SIN_BASE").trim() || "SIN_BASE";
    count[key] = (count[key] || 0) + 1;
  }

  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || "SIN_BASE";
}

function getMejorFranja(calls: CallRecord[]): string {
  const franjaStats: Record<string, { total: number; contacto: number }> = {};

  for (const call of calls) {
    const franja = getRangoHorario(call.fecha);

    if (!franjaStats[franja]) {
      franjaStats[franja] = { total: 0, contacto: 0 };
    }

    franjaStats[franja].total++;

    if (isAnswerAgent(call)) {
      franjaStats[franja].contacto++;
    }
  }

  const minMuestra = Math.min(100, Math.max(10, Math.round(calls.length * 0.001)));

  const ranked = Object.entries(franjaStats)
    .map(([franja, stats]) => ({
      franja,
      total: stats.total,
      contacto: stats.contacto,
      ratio: stats.total > 0 ? stats.contacto / stats.total : 0,
    }))
    .sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.contacto - a.contacto;
    });

  const rankedOperativas = ranked.filter(
    (item) => isFranjaOperativaValida(item.franja) && item.total >= minMuestra
  );

  return rankedOperativas[0]?.franja || ranked[0]?.franja || "Sin hora";
}

function buildANIContext(
  calls: CallRecord[],
  summary: ANISummary,
  config: DepuracionConfig,
  referenceDate: Date
): ANIContext {
  const now = referenceDate;

  const datedCalls = calls
    .map((call) => ({
      call,
      date: parseTicketDate(call.fecha),
    }))
    .filter((item): item is { call: CallRecord; date: Date } => !!item.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const last = datedCalls[datedCalls.length - 1];
  const diasDesdeUltimoIntento = last ? daysBetween(last.date, now) : null;

  const intentosUltimas24h = datedCalls.filter(
    ({ date }) => hoursBetween(date, now) <= 24
  ).length;

  const intentosUltimas48h = datedCalls.filter(
    ({ date }) => hoursBetween(date, now) <= 48
  ).length;

  const saturado =
    intentosUltimas24h >= config.saturacion.maxIntentos24h ||
    intentosUltimas48h >= config.saturacion.maxIntentos48h;

  const tuvoContactoPrevio = summary.intentosAnswerAgent > 0;

  const contactoReciente =
    tuvoContactoPrevio &&
    diasDesdeUltimoIntento !== null &&
    diasDesdeUltimoIntento <= config.recencia.contactoRecienteDias;

  let score = 100;

  score -= summary.intentosUnallocated * 25;
  score -= summary.intentosRejected * 18;
  score -= summary.intentosAnsweringMachine * 10;
  score -= summary.intentosNoAnswer * 6;
  score -= summary.intentosBusy * 4;

  if (summary.intentosTotales >= config.thresholds.intentosAltos) score -= 10;
  if (summary.intentosTotales >= config.thresholds.intentosMuyAltos) score -= 15;
  if (saturado) score -= 20;
  if (contactoReciente) score -= 50;

  if (
    diasDesdeUltimoIntento !== null &&
    diasDesdeUltimoIntento >= 2 &&
    !tuvoContactoPrevio
  ) {
    score += 8;
  }

  if (
    diasDesdeUltimoIntento !== null &&
    diasDesdeUltimoIntento >= 5 &&
    !saturado &&
    !contactoReciente
  ) {
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));

  let accionSugerida = "REINTENTAR";
  let prioridad = "MEDIA";
  let motivoDepuracion = "ANI con margen operativo";

  if (summary.intentosUnallocated >= config.thresholds.unallocatedInvalido) {
    accionSugerida = "ELIMINAR";
    prioridad = "ALTA";
    motivoDepuracion = "Múltiples intentos unallocated";
  } else if (contactoReciente) {
    accionSugerida = "NO_REINTENTAR_AUN";
    prioridad = "BAJA";
    motivoDepuracion = "Tuvo contacto efectivo reciente";
  } else if (
    summary.intentosRejected >= config.thresholds.rejectedRechaza &&
    summary.intentosAnswerAgent === 0
  ) {
    accionSugerida = "EXCLUIR";
    prioridad = "ALTA";
    motivoDepuracion = "Rechazo reiterado sin contacto efectivo";
  } else if (
    summary.intentosAnsweringMachine >= config.thresholds.answeringMachineSoloBuzon &&
    summary.intentosAnswerAgent === 0
  ) {
    accionSugerida = "CAMBIAR_ESTRATEGIA";
    prioridad = "MEDIA";
    motivoDepuracion = "Predominio de contestador";
  } else if (
    summary.intentosNoAnswer >= config.thresholds.noAnswerNoAtiende &&
    summary.intentosAnswerAgent === 0 &&
    summary.intentosAnsweringMachine === 0
  ) {
    accionSugerida = saturado ? "PAUSAR_24H" : "LIMITAR_REINTENTOS";
    prioridad = "ALTA";
    motivoDepuracion = saturado
      ? "Exceso de no answer con saturación reciente"
      : "Exceso de no answer sin contacto";
  } else if (saturado) {
    accionSugerida = "PAUSAR_24H";
    prioridad = "MEDIA";
    motivoDepuracion = "Alta densidad de intentos en poco tiempo";
  } else if (score >= 70) {
    accionSugerida = "REINTENTAR_EN_MEJOR_FRANJA";
    prioridad = "ALTA";
    motivoDepuracion = "Buen potencial de recontacto";
  } else if (score >= 45) {
    accionSugerida = "REINTENTAR_CON_CONTROL";
    prioridad = "MEDIA";
    motivoDepuracion = "Potencial moderado de recontacto";
  } else {
    accionSugerida = "REVISAR_O_PAUSAR";
    prioridad = "BAJA";
    motivoDepuracion = "Bajo potencial de recontacto";
  }

  return {
    basePrincipal: getBasePrincipal(calls),
    prefijo: extractPrefijo(summary.ani),
    mejorFranja: getMejorFranja(calls),
    ultimoEstadoNormalizado: getEstadoNormalizado(last?.call),
    ultimoSubestadoNormalizado: getSubestadoNormalizado(last?.call),
    diasDesdeUltimoIntento,
    intentosUltimas24h,
    intentosUltimas48h,
    saturado,
    tuvoContactoPrevio,
    contactoReciente,
    scoreRecontactabilidad: score,
    accionSugerida,
    prioridad,
    motivoDepuracion,
  };
}

function buildBaseInsights(records: CallRecord[], aniSummaries: ANISummary[]) {
  const baseMap = new Map<string, CallRecord[]>();

  records.forEach((record) => {
    const base = (record.base || "SIN_BASE").trim() || "SIN_BASE";
    const current = baseMap.get(base) || [];
    current.push(record);
    baseMap.set(base, current);
  });

  return Array.from(baseMap.entries())
    .map(([base, baseRecords]) => {
      const anisBase = new Set(baseRecords.map((r) => r.ani).filter(Boolean));
      const totalAnis = anisBase.size;
      const totalAnisParaCalculo = Math.max(totalAnis, 1);

      const summariesBase = aniSummaries.filter((s) => anisBase.has(s.ani));

      const contactados = summariesBase.filter(
        (s) => s.intentosAnswerAgent > 0
      ).length;

      const conBuzon = summariesBase.filter(
        (s) => s.intentosAnsweringMachine > 0
      ).length;

      const invalidos = summariesBase.filter(
        (s) => s.tagTelefono === "INVALIDO"
      ).length;

      const aDepurar = summariesBase.filter((s) =>
        ["INVALIDO", "SOLO_BUZON", "NO_ATIENDE", "RECHAZA"].includes(
          s.tagTelefono
        )
      ).length;

      const pctContactoEfectivo = contactados / totalAnisParaCalculo;
      const pctBuzon = conBuzon / totalAnisParaCalculo;
      const pctInvalidos = invalidos / totalAnisParaCalculo;
      const pctADepurar = aDepurar / totalAnisParaCalculo;

      const intentosPromedio =
        summariesBase.length > 0
          ? summariesBase.reduce((acc, s) => acc + s.intentosTotales, 0) /
            summariesBase.length
          : 0;

      const muestraInfo = getMuestraInfo(totalAnis);

      const scoreCalidadOriginal =
        pctContactoEfectivo * 0.5 +
        (1 - pctADepurar) * 0.25 +
        (1 - pctInvalidos) * 0.15 +
        Math.max(0, 1 - intentosPromedio / 10) * 0.1;

      const scoreCalidad = Math.max(
        0,
        Math.min(1, scoreCalidadOriginal - muestraInfo.penalizacionMuestra)
      );

      let recomendacion = "REVISAR";

      if (scoreCalidad >= 0.75 && muestraInfo.confiabilidadMuestra !== "BAJA") {
        recomendacion = "UTILIZAR";
      } else if (scoreCalidad < 0.45) {
        recomendacion = "DESCARTAR";
      }

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
        scoreCalidadOriginal,
        confiabilidadMuestra: muestraInfo.confiabilidadMuestra,
        penalizacionMuestra: muestraInfo.penalizacionMuestra,
        advertenciaMuestra: muestraInfo.advertenciaMuestra,

        recomendacion,
      };
    })
    .sort((a, b) => b.scoreCalidad - a.scoreCalidad);
}

function buildDepuracionInsights(aniSummaries: ANISummary[]) {
  return aniSummaries.map((s) => ({
    ani: s.ani,
    tag: s.tagTelefono,
    prioridad: s.prioridad || "MEDIA",
    accion: s.accionSugerida || "REINTENTAR",
    motivo: s.motivoDepuracion || "Sin motivo específico",
  }));
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

  const analysisReferenceDate = getAnalysisReferenceDate(records);

  const rangoDistribucion: Record<string, { total: number; answer: number; noAnswer: number }> = {};

  return franjaDistribucion;
}

function safePct(value: number, total: number): number {
  if (!total) return 0;
  return (value / total) * 100;
}

function buildResumenEjecutivo(
  aniSummaries: ANISummary[],
  baseInsights: ReturnType<typeof buildBaseInsights>,
  franjaDistribucion: Record<
    string,
    { total: number; contactoEfectivo: number; noContacto: number }
  >
) {
  const totalAnisReal = aniSummaries.length;
  const totalAnis = totalAnisReal || 1;

  const tagsADepurar = ["INVALIDO", "SOLO_BUZON", "NO_ATIENDE", "RECHAZA"];

  const aDepurar = aniSummaries.filter((s) =>
    tagsADepurar.includes(s.tagTelefono)
  ).length;

  const altaPrioridad = aniSummaries.filter((s) => s.prioridad === "ALTA").length;
  const saturados = aniSummaries.filter((s) => s.saturado === true).length;
  const contactados = aniSummaries.filter((s) => s.intentosAnswerAgent > 0).length;

  const accionMap: Record<string, number> = {};
  const tagMap: Record<string, number> = {};
  const estadoMap: Record<string, number> = {};

  aniSummaries.forEach((s) => {
    const accion = s.accionSugerida || "SIN_ACCION";
    accionMap[accion] = (accionMap[accion] || 0) + 1;

    const tag = s.tagTelefono || "SIN_TAG";
    tagMap[tag] = (tagMap[tag] || 0) + 1;

    const estado = s.ultimoEstadoNormalizado || "SIN_ESTADO";
    estadoMap[estado] = (estadoMap[estado] || 0) + 1;
  });

  const accionDominante =
    Object.entries(accionMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  const tagDominante =
    Object.entries(tagMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  const estadoDominante =
    Object.entries(estadoMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  const bestBase = [...baseInsights].sort((a, b) => b.scoreCalidad - a.scoreCalidad)[0];
  const worstBase = [...baseInsights].sort((a, b) => a.scoreCalidad - b.scoreCalidad)[0];

  const totalRegistrosFranja = Object.values(franjaDistribucion).reduce(
  (acc, stats) => acc + stats.total,
  0
);

const minMuestraFranja = Math.min(
  100,
  Math.max(10, Math.round(totalRegistrosFranja * 0.001))
);

const franjaRanked = Object.entries(franjaDistribucion)
  .map(([franja, stats]) => ({
    franja,
    total: stats.total,
    contactoPct: safePct(stats.contactoEfectivo, stats.total),
    noContactoPct: safePct(stats.noContacto, stats.total),
  }))
  .sort((a, b) => {
    if (b.contactoPct !== a.contactoPct) {
      return b.contactoPct - a.contactoPct;
    }

    return b.total - a.total;
  });

const franjaRankedOperativas = franjaRanked.filter(
  (item) =>
    isFranjaOperativaValida(item.franja) &&
    item.total >= minMuestraFranja
);

const bestFranjaData = franjaRankedOperativas[0] || franjaRanked[0];

const worstFranjaData =
  [...franjaRankedOperativas].sort((a, b) => {
    if (b.noContactoPct !== a.noContactoPct) {
      return b.noContactoPct - a.noContactoPct;
    }

    return b.total - a.total;
  })[0] ||
  [...franjaRanked].sort((a, b) => {
    if (b.noContactoPct !== a.noContactoPct) {
      return b.noContactoPct - a.noContactoPct;
    }

    return b.total - a.total;
  })[0];

const bestFranja = bestFranjaData?.franja || "-";
const worstFranja = worstFranjaData?.franja || "-";

  const porcentajeADepurar = safePct(aDepurar, totalAnis);
  const porcentajeAltaPrioridad = safePct(altaPrioridad, totalAnis);
  const porcentajeSaturados = safePct(saturados, totalAnis);
  const porcentajeContactados = safePct(contactados, totalAnis);

  let nivelCalidadGeneral = "Media";
  let semaforoCalidad: "VERDE" | "AMARILLO" | "ROJO" = "AMARILLO";
  let diagnosticoGeneral = "Base equilibrada, con margen operativo razonable.";
  let focoPrincipal = "Optimizar reintentos según score y mejor franja.";
  let principalProblemaDetectado = "No se detecta un único problema crítico dominante.";
  let riesgoOperativo = "Riesgo moderado de pérdida de productividad si no se segmenta la gestión.";
  let accionRecomendada = "Priorizar los ANI con mejor score y revisar los casos con baja respuesta.";

  if (porcentajeADepurar >= 45) {
    nivelCalidadGeneral = "Baja";
    semaforoCalidad = "ROJO";
    diagnosticoGeneral =
      "La base presenta un nivel alto de desgaste y requiere depuración antes de seguir insistiendo.";
    focoPrincipal =
      "Reducir intentos improductivos, excluir ANI de bajo valor y conservar solo segmentos trabajables.";
    principalProblemaDetectado =
      "Alta proporción de ANIs clasificados para depuración.";
    riesgoOperativo =
      "Alto riesgo de consumir tiempo operativo en registros con baja probabilidad de contacto.";
    accionRecomendada =
      "Depurar la base antes de volver a marcar y priorizar únicamente los segmentos con mejor score.";
  } else if (porcentajeSaturados >= 25) {
    nivelCalidadGeneral = "Media baja";
    semaforoCalidad = "ROJO";
    diagnosticoGeneral =
      "La base muestra presión operativa alta por saturación reciente de intentos.";
    focoPrincipal =
      "Enfriar ANIs saturados y redistribuir llamados hacia mejores franjas horarias.";
    principalProblemaDetectado =
      "Concentración relevante de ANIs saturados por exceso de intentos recientes.";
    riesgoOperativo =
      "Riesgo alto de quemar base por insistencia sobre contactos que todavía no deberían remarcarse.";
    accionRecomendada =
      "Pausar temporalmente los ANIs saturados y reintentar luego con una estrategia por franja.";
  } else if (porcentajeAltaPrioridad >= 25) {
    nivelCalidadGeneral = "Media";
    semaforoCalidad = "AMARILLO";
    diagnosticoGeneral =
      "Existe una porción relevante de ANIs con alta prioridad de tratamiento.";
    focoPrincipal =
      "Atacar primero los ANIs con mejor score y acción sugerida clara.";
    principalProblemaDetectado =
      "Hay muchos registros que requieren gestión prioritaria para no perder oportunidad comercial.";
    riesgoOperativo =
      "Riesgo medio de desaprovechar contactos trabajables si no se ordena la gestión.";
    accionRecomendada =
      "Ordenar la base por prioridad y trabajar primero los ANIs con mayor probabilidad de contacto.";
  } else if (porcentajeContactados >= 20 && porcentajeADepurar < 30) {
    nivelCalidadGeneral = "Buena";
    semaforoCalidad = "VERDE";
    diagnosticoGeneral =
      "La base presenta buen nivel relativo de contacto efectivo y volumen depurable controlado.";
    focoPrincipal =
      "Sostener la estrategia actual, reforzando las mejores franjas y bases con mayor score.";
    principalProblemaDetectado =
      "No se observa un problema crítico de calidad; el foco debe estar en priorización y eficiencia.";
    riesgoOperativo =
      "Riesgo bajo, siempre que se mantenga control sobre saturación y reintentos.";
    accionRecomendada =
      "Priorizar las bases y franjas de mejor rendimiento para maximizar productividad.";
  }

  const formatPct = (value: number) => `${value.toFixed(1)}%`;

  const lecturaEjecutiva =
    `${diagnosticoGeneral} El TAG dominante es ${tagDominante}, ` +
    `el estado dominante es ${estadoDominante} y la acción dominante sugerida es ${accionDominante}.`;

  const interpretacionCalidad =
    `Nivel de calidad general: ${nivelCalidadGeneral}. ` +
    `El ${formatPct(porcentajeADepurar)} de los ANIs queda dentro de categorías de depuración.`;

  const interpretacionContacto =
    `El ${formatPct(porcentajeContactados)} de los ANIs tuvo al menos un contacto efectivo ANSWER-AGENT. ` +
    `La mejor franja detectada es ${bestFranja}.`;

  const interpretacionDepuracion =
    `La acción dominante es ${accionDominante}. ` +
    `Esto indica dónde debería concentrarse la limpieza o segmentación de la base antes de remarcar.`;

  const interpretacionHorario =
    `La franja con mejor respuesta es ${bestFranja}, mientras que la franja más débil o de mayor no contacto es ${worstFranja}.`;

  const lecturaPresentacion = [
    `La base analizada presenta un nivel de calidad general ${nivelCalidadGeneral.toLowerCase()}.`,
    principalProblemaDetectado,
    `La mejor base para priorizar es ${bestBase?.base || "-"}, con un score de calidad de ${
      bestBase?.scoreCalidad?.toFixed(1) || "0.0"
    }.`,
    `La base que requiere mayor revisión es ${worstBase?.base || "-"}, por menor rendimiento relativo.`,
    `El horario de mejor respuesta es ${bestFranja}.`,
    riesgoOperativo,
    accionRecomendada,
  ];

  return {
    diagnosticoGeneral,
    focoPrincipal,
    mejorBase: bestBase?.base || "-",
    peorBase: worstBase?.base || "-",
    mejorFranja: bestFranja,
    peorFranja: worstFranja,
    porcentajeADepurar,
    porcentajeAltaPrioridad,
    porcentajeSaturados,
    accionDominante,

    nivelCalidadGeneral,
    principalProblemaDetectado,
    estadoDominante,
    tagDominante,
    riesgoOperativo,
    accionRecomendada,
    lecturaEjecutiva,
    lecturaPresentacion,
    interpretacionCalidad,
    interpretacionContacto,
    interpretacionDepuracion,
    interpretacionHorario,
    semaforoCalidad,
  };
}

function buildRecomendacionesOperativas(
  aniSummaries: ANISummary[],
  baseInsights: ReturnType<typeof buildBaseInsights>,
  franjaDistribucion: Record<
    string,
    { total: number; contactoEfectivo: number; noContacto: number }
  >
) {
  const recomendaciones: Array<{
    tipo: "BASE" | "FRANJA";
    objetivo: string;
    prioridad: string;
    recomendacion: string;
    motivo: string;
    score?: number;
    contactoPct?: number;
    volumen?: number;
  }> = [];

  const basesOrdenadas = [...baseInsights].sort((a, b) => b.scoreCalidad - a.scoreCalidad);

  const mejorBase = basesOrdenadas[0];
  const peorBase = [...baseInsights].sort((a, b) => a.scoreCalidad - b.scoreCalidad)[0];

  if (mejorBase) {
    recomendaciones.push({
      tipo: "BASE",
      objetivo: mejorBase.base,
      prioridad: "ALTA",
      recomendacion: "PRIORIZAR_BASE",
      motivo: "Mejor score de calidad y mejor potencial de contacto.",
      score: Number((mejorBase.scoreCalidad * 100).toFixed(1)),
      contactoPct: Number((mejorBase.pctContactoEfectivo * 100).toFixed(1)),
      volumen: mejorBase.totalAnis,
    });
  }

  if (peorBase) {
    recomendaciones.push({
      tipo: "BASE",
      objetivo: peorBase.base,
      prioridad: peorBase.scoreCalidad < 0.45 ? "ALTA" : "MEDIA",
      recomendacion: peorBase.scoreCalidad < 0.45 ? "PAUSAR_O_DEPURAR" : "REVISAR_BASE",
      motivo:
        peorBase.scoreCalidad < 0.45
          ? "Bajo score de calidad y alta probabilidad de improductividad."
          : "Conviene revisar estrategia antes de seguir invirtiendo intentos.",
      score: Number((peorBase.scoreCalidad * 100).toFixed(1)),
      contactoPct: Number((peorBase.pctContactoEfectivo * 100).toFixed(1)),
      volumen: peorBase.totalAnis,
    });
  }

const totalRegistrosFranja = Object.values(franjaDistribucion).reduce(
  (acc, stats) => acc + stats.total,
  0
);

const minMuestraFranja = Math.min(
  100,
  Math.max(10, Math.round(totalRegistrosFranja * 0.001))
);

const franjasNoOperativas = [
  "Sin hora",
  "Fuera de rango",
  "Antes de 09:00",
  "Después de 21:00",
];

const franjas = Object.entries(franjaDistribucion)
  .map(([franja, stats]) => ({
    franja,
    total: stats.total,
    contactoPct: safePct(stats.contactoEfectivo, stats.total),
    noContactoPct: safePct(stats.noContacto, stats.total),
  }))
  .sort((a, b) => {
    if (b.contactoPct !== a.contactoPct) return b.contactoPct - a.contactoPct;
    return b.total - a.total;
  });

const franjasOperativas = franjas.filter(
  (item) =>
    !franjasNoOperativas.includes(item.franja) &&
    item.total >= minMuestraFranja
);

const mejorFranja = franjasOperativas[0] || franjas[0];

const peorFranja =
  [...franjasOperativas].sort((a, b) => {
    if (b.noContactoPct !== a.noContactoPct) {
      return b.noContactoPct - a.noContactoPct;
    }

    return b.total - a.total;
  })[0] ||
  [...franjas].sort((a, b) => {
    if (b.noContactoPct !== a.noContactoPct) {
      return b.noContactoPct - a.noContactoPct;
    }

    return b.total - a.total;
  })[0];

  if (mejorFranja) {
    recomendaciones.push({
      tipo: "FRANJA",
      objetivo: mejorFranja.franja,
      prioridad: "ALTA",
      recomendacion: "CONCENTRAR_REINTENTOS",
      motivo: "Franja con mejor tasa histórica de contacto efectivo.",
      contactoPct: Number(mejorFranja.contactoPct.toFixed(1)),
      volumen: mejorFranja.total,
    });
  }

  if (peorFranja) {
    recomendaciones.push({
      tipo: "FRANJA",
      objetivo: peorFranja.franja,
      prioridad: "MEDIA",
      recomendacion: "REDUCIR_INTENSIDAD",
      motivo: "Franja con menor rendimiento relativo de contacto.",
      contactoPct: Number(peorFranja.contactoPct.toFixed(1)),
      volumen: peorFranja.total,
    });
  }

  const saturados = aniSummaries.filter((s) => s.saturado === true).length;
  const pctSaturados = safePct(saturados, aniSummaries.length || 1);

  if (pctSaturados >= 20) {
    recomendaciones.push({
      tipo: "BASE",
      objetivo: "OPERACION_GENERAL",
      prioridad: "ALTA",
      recomendacion: "ENFRIAR_INTENSIDAD",
      motivo: "La saturación reciente supera el umbral recomendado.",
      contactoPct: Number((100 - pctSaturados).toFixed(1)),
      volumen: saturados,
    });
  }

  const prioridadOrden: Record<string, number> = { ALTA: 1, MEDIA: 2, BAJA: 3 };

  return recomendaciones.sort(
    (a, b) => (prioridadOrden[a.prioridad] || 99) - (prioridadOrden[b.prioridad] || 99)
  );
}

function buildComparativaMultiarchivo(records: CallRecord[]) {
  const archivosCargados = Array.from(
    new Set(
      records
        .map((record) => record.archivoOrigen || "Sin archivo identificado")
        .filter(Boolean)
    )
  );

  const totalArchivos = archivosCargados.length;

  const baseArchivoMap = new Map<
    string,
    {
      base: string;
      archivos: Set<string>;
      totalRegistros: number;
    }
  >();

  records.forEach((record) => {
    const base = (record.base || "SIN_BASE").trim() || "SIN_BASE";
    const archivo = record.archivoOrigen || "Sin archivo identificado";

    const current =
      baseArchivoMap.get(base) ||
      {
        base,
        archivos: new Set<string>(),
        totalRegistros: 0,
      };

    current.archivos.add(archivo);
    current.totalRegistros++;
    baseArchivoMap.set(base, current);
  });

  const basesRepetidas = Array.from(baseArchivoMap.values())
    .filter((item) => item.archivos.size > 1)
    .map((item) => ({
      base: item.base,
      apariciones: item.archivos.size,
      archivos: Array.from(item.archivos),
      totalRegistros: item.totalRegistros,
      lectura:
        "Esta base aparece en más de un archivo. Conviene analizarla por día, prefijo y franja antes de mezclarla completa.",
    }))
    .sort((a, b) => b.apariciones - a.apariciones || b.totalRegistros - a.totalRegistros);

  const segmentoMap = new Map<string, CallRecord[]>();

  records.forEach((record) => {
    const archivo = record.archivoOrigen || "Sin archivo identificado";
    const fechaArchivo = record.fechaArchivo || "Sin fecha";
    const base = (record.base || "SIN_BASE").trim() || "SIN_BASE";
    const prefijo = extractPrefijo(record.ani);
    const franja = getRangoHorario(record.fecha);

    const key = [archivo, fechaArchivo, base, prefijo, franja].join("|||");
    const current = segmentoMap.get(key) || [];

    current.push(record);
    segmentoMap.set(key, current);
  });

  const segmentos = Array.from(segmentoMap.entries())
    .map(([key, segmentRecords]) => {
      const [archivoOrigen, fechaArchivo, base, prefijo, franja] = key.split("|||");

      const anis = new Set(segmentRecords.map((record) => record.ani).filter(Boolean));
      const totalRegistros = segmentRecords.length;
      const totalAnis = anis.size;

      const contactoEfectivo = segmentRecords.filter(isAnswerAgent).length;
      const buzones = segmentRecords.filter(isAnswerMachine).length;
      const invalidos = segmentRecords.filter(isUnallocated).length;

      const noContacto = segmentRecords.filter(
        (record) => isNoContacto(record) || isAnswerMachine(record)
      ).length;

      const pctContactoEfectivo =
        totalRegistros > 0 ? (contactoEfectivo / totalRegistros) * 100 : 0;

      const pctNoContacto =
        totalRegistros > 0 ? (noContacto / totalRegistros) * 100 : 0;

      const pctBuzon = totalRegistros > 0 ? (buzones / totalRegistros) * 100 : 0;
      const pctInvalidos =
        totalRegistros > 0 ? (invalidos / totalRegistros) * 100 : 0;

      let accionSugerida = "REVISAR";
      let nivel = "Medio";
      let lectura =
        "Segmento con comportamiento intermedio. Conviene revisarlo antes de tomar una decisión fuerte.";

      if (totalRegistros < 20) {
        accionSugerida = "VALIDAR_MUESTRA";
        nivel = "Muestra baja";
        lectura =
          "La muestra es baja. Puede servir como señal preliminar, pero no conviene tomarla como conclusión definitiva.";
      } else if (pctContactoEfectivo >= 12 && pctNoContacto < 70) {
        accionSugerida = "PRIORIZAR";
        nivel = "Oportunidad";
        lectura =
          "Segmento con buena señal de contacto efectivo. Conviene priorizarlo para generar más oportunidades comerciales.";
      } else if (pctInvalidos >= 20) {
        accionSugerida = "EXCLUIR_INVALIDOS";
        nivel = "Crítico";
        lectura =
          "Segmento con alto peso de inválidos. Conviene excluir o depurar antes de volver a operar.";
      } else if (pctBuzon >= 30) {
        accionSugerida = "REINTENTAR_OTRA_FRANJA";
        nivel = "Revisar";
        lectura =
          "Segmento con alto peso de contestador o buzón. Conviene probar otra franja antes de insistir.";
      } else if (pctNoContacto >= 75) {
        accionSugerida = "PAUSAR_O_SEGMENTAR";
        nivel = "Riesgo alto";
        lectura =
          "Segmento con alto no contacto. Conviene pausar, segmentar o bajar intensidad de marcado.";
      }

      return {
        archivoOrigen,
        fechaArchivo: fechaArchivo === "Sin fecha" ? undefined : fechaArchivo,
        base,
        prefijo,
        franja,
        totalRegistros,
        totalAnis,
        contactoEfectivo,
        pctContactoEfectivo,
        noContacto,
        pctNoContacto,
        buzones,
        invalidos,
        accionSugerida,
        nivel,
        lectura,
      };
    })
    .sort((a, b) => {
      if (b.pctContactoEfectivo !== a.pctContactoEfectivo) {
        return b.pctContactoEfectivo - a.pctContactoEfectivo;
      }

      return b.totalRegistros - a.totalRegistros;
    });

  const segmentosConMuestra = segmentos.filter((segmento) => segmento.totalRegistros >= 20);

  const mejoresSegmentos = segmentosConMuestra
    .filter((segmento) => segmento.accionSugerida === "PRIORIZAR")
    .slice(0, 5);

  const segmentosARevisar = segmentosConMuestra
    .filter((segmento) =>
      ["PAUSAR_O_SEGMENTAR", "REINTENTAR_OTRA_FRANJA", "EXCLUIR_INVALIDOS"].includes(
        segmento.accionSugerida
      )
    )
    .sort((a, b) => {
      if (b.pctNoContacto !== a.pctNoContacto) {
        return b.pctNoContacto - a.pctNoContacto;
      }

      return b.totalRegistros - a.totalRegistros;
    })
    .slice(0, 5);

  const franjaStats = new Map<
    string,
    {
      total: number;
      contacto: number;
    }
  >();

  records.forEach((record) => {
    const franja = getRangoHorario(record.fecha);

    if (!isFranjaOperativaValida(franja)) return;

    const current =
      franjaStats.get(franja) ||
      {
        total: 0,
        contacto: 0,
      };

    current.total++;

    if (isAnswerAgent(record)) {
      current.contacto++;
    }

    franjaStats.set(franja, current);
  });

  const franjaMasConveniente = Array.from(franjaStats.entries())
    .map(([franja, stats]) => ({
      franja,
      total: stats.total,
      pctContacto: stats.total > 0 ? (stats.contacto / stats.total) * 100 : 0,
    }))
    .filter((item) => item.total >= 20)
    .sort((a, b) => {
      if (b.pctContacto !== a.pctContacto) return b.pctContacto - a.pctContacto;
      return b.total - a.total;
    })[0]?.franja;

  const prefijoArchivoStats = new Map<
    string,
    {
      prefijo: string;
      archivos: Set<string>;
      total: number;
      contacto: number;
    }
  >();

  records.forEach((record) => {
    const prefijo = extractPrefijo(record.ani);
    const archivo = record.archivoOrigen || "Sin archivo identificado";

    const current =
      prefijoArchivoStats.get(prefijo) ||
      {
        prefijo,
        archivos: new Set<string>(),
        total: 0,
        contacto: 0,
      };

    current.archivos.add(archivo);
    current.total++;

    if (isAnswerAgent(record)) {
      current.contacto++;
    }

    prefijoArchivoStats.set(prefijo, current);
  });

  const prefijoMasEstable = Array.from(prefijoArchivoStats.values())
    .map((item) => ({
      prefijo: item.prefijo,
      apariciones: item.archivos.size,
      total: item.total,
      pctContacto: item.total > 0 ? (item.contacto / item.total) * 100 : 0,
    }))
    .filter((item) => item.apariciones >= 2 && item.total >= 20)
    .sort((a, b) => {
      if (b.pctContacto !== a.pctContacto) return b.pctContacto - a.pctContacto;
      if (b.apariciones !== a.apariciones) return b.apariciones - a.apariciones;
      return b.total - a.total;
    })[0]?.prefijo;

  let recomendacionGeneral =
    "Analizar los segmentos por base, prefijo y franja antes de definir la estrategia de marcado.";

  if (totalArchivos > 1 && basesRepetidas.length > 0) {
    recomendacionGeneral =
      "Se detectaron bases repetidas entre archivos. No conviene mezclar todo automáticamente: priorizá los segmentos con mejor contacto efectivo y revisá los que concentran no contacto, buzón o inválidos.";
  } else if (totalArchivos > 1) {
    recomendacionGeneral =
      "Se cargaron varios archivos. Conviene comparar rendimiento por día, prefijo y franja antes de operar toda la base como un único bloque.";
  } else if (mejoresSegmentos.length > 0) {
    recomendacionGeneral =
      "Hay segmentos con buena señal comercial. Conviene priorizarlos para aumentar oportunidades de venta.";
  }

  return {
    totalArchivos,
    archivosCargados,
    basesRepetidas,
    mejoresSegmentos,
    segmentosARevisar,
    prefijoMasEstable,
    franjaMasConveniente,
    recomendacionGeneral,
  };
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
      archivoOrigen: row.__archivoOrigen?.toString() || undefined,
      fechaArchivo: row.__fechaArchivo?.toString() || undefined,
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
const depuracionConfig = DEFAULT_DEPURACION_CONFIG;
const analysisReferenceDate = getAnalysisReferenceDate(records);

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

  const summaryBase: ANISummary = {
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

  const context = buildANIContext(
  sortedCalls,
  summaryBase,
  depuracionConfig,
  analysisReferenceDate
  );
  
  const tagTelefono = assignTag(summaryBase, context, depuracionConfig);

  const summary: ANISummary = {
    ...summaryBase,
    tagTelefono,

    basePrincipal: context.basePrincipal,
    prefijo: context.prefijo,
    mejorFranja: context.mejorFranja,
    ultimoEstadoNormalizado: context.ultimoEstadoNormalizado,
    ultimoSubestadoNormalizado: context.ultimoSubestadoNormalizado,

    diasDesdeUltimoIntento:
      context.diasDesdeUltimoIntento !== null
        ? Number(context.diasDesdeUltimoIntento.toFixed(2))
        : undefined,

    intentosUltimas24h: context.intentosUltimas24h,
    intentosUltimas48h: context.intentosUltimas48h,

    saturado: context.saturado,
    tuvoContactoPrevio: context.tuvoContactoPrevio,
    contactoReciente: context.contactoReciente,

    scoreRecontactabilidad: context.scoreRecontactabilidad,
    accionSugerida: context.accionSugerida,
    prioridad: context.prioridad,
    motivoDepuracion: context.motivoDepuracion,
  };

  aniSummaries.push(summary);
});

  const estadoDistribucion: Record<string, number> = {};
  records.forEach((record) => {
    const estado = record.estado?.toUpperCase() || "SIN_ESTADO";
    estadoDistribucion[estado] = (estadoDistribucion[estado] || 0) + 1;
  });

  const estadoOperativoDistribucion: Record<string, number> = {};
  records.forEach((record) => {
    const estadoOperativo = getEstadoOperativo(record);
    estadoOperativoDistribucion[estadoOperativo] =
      (estadoOperativoDistribucion[estadoOperativo] || 0) + 1;
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

  const resumenEjecutivo = buildResumenEjecutivo(
    aniSummaries,
    baseInsights,
    franjaDistribucion
  );
  const recomendacionesOperativas = buildRecomendacionesOperativas(
    aniSummaries,
    baseInsights,
    franjaDistribucion
  );

  const comparativaMultiarchivo = buildComparativaMultiarchivo(records);

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
    estadoOperativoDistribucion,
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
    resumenEjecutivo,
    recomendacionesOperativas,
    comparativaMultiarchivo,
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