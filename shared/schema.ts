import { z } from "zod";

export const callRecordSchema = z.object({
  fecha: z.string().optional(),
  archivoOrigen: z.string().optional(),
  fechaArchivo: z.string().optional(),
  estado: z.string(),
  subestado: z.string().optional(),
  ani: z.string(),
  base: z.string().optional(),
  duracion: z.number().optional(),
  direccion: z.string().optional(),
  conexion: z.string().optional(),
  fin: z.string().optional(),
  tipoGrabacion: z.string().optional(),
  grabacion: z.string().optional(),
  grabacionDepurada: z.string().optional(),
  detalle: z.string().optional(),
});

export type CallRecord = z.infer<typeof callRecordSchema>;

export const aniSummarySchema = z.object({
  ani: z.string(),
  intentosTotales: z.number(),
  intentosAnswerAgent: z.number(),
  intentosAnsweringMachine: z.number(),
  intentosNoAnswer: z.number(),
  intentosBusy: z.number(),
  intentosUnallocated: z.number(),
  intentosRejected: z.number(),

  primerLlamado: z.string().optional(),
  ultimoLlamado: z.string().optional(),

  tagTelefono: z.string(),

  // Nuevos campos "pro"
  basePrincipal: z.string().optional(),
  prefijo: z.string().optional(),
  mejorFranja: z.string().optional(),
  ultimoEstadoNormalizado: z.string().optional(),
  ultimoSubestadoNormalizado: z.string().optional(),

  diasDesdeUltimoIntento: z.number().optional(),
  intentosUltimas24h: z.number().optional(),
  intentosUltimas48h: z.number().optional(),

  saturado: z.boolean().optional(),
  tuvoContactoPrevio: z.boolean().optional(),
  contactoReciente: z.boolean().optional(),

  scoreRecontactabilidad: z.number().optional(),
  accionSugerida: z.string().optional(),
  prioridad: z.string().optional(),
  motivoDepuracion: z.string().optional(),
});

export type ANISummary = z.infer<typeof aniSummarySchema>;

export const tagTypes = [
  "SEGUIR_INTENTANDO",
  "CONTACTADO",
  "INVALIDO",
  "SOLO_BUZON",
  "NO_ATIENDE",
  "RECHAZA",
] as const;

export type TagType = (typeof tagTypes)[number];

export const baseInsightSchema = z.object({
  base: z.string(),
  totalRegistros: z.number(),
  totalAnis: z.number(),
  contactados: z.number(),
  pctContactoEfectivo: z.number(),
  pctBuzon: z.number(),
  pctInvalidos: z.number(),
  pctADepurar: z.number(),
  intentosPromedio: z.number(),

  scoreCalidad: z.number(),
  scoreCalidadOriginal: z.number().optional(),

  confiabilidadMuestra: z.string().optional(),
  penalizacionMuestra: z.number().optional(),
  advertenciaMuestra: z.string().optional(),

  recomendacion: z.string(),
});

export type BaseInsight = z.infer<typeof baseInsightSchema>;

export const depuracionInsightSchema = z.object({
  ani: z.string(),
  tag: z.string(),
  prioridad: z.string(),
  accion: z.string(),
  motivo: z.string(),
});

export type DepuracionInsight = z.infer<typeof depuracionInsightSchema>;

export const franjaDistribucionItemSchema = z.object({
  total: z.number(),
  contactoEfectivo: z.number(),
  noContacto: z.number(),
});

export type FranjaDistribucionItem = z.infer<typeof franjaDistribucionItemSchema>;

export const resumenEjecutivoSchema = z.object({
  diagnosticoGeneral: z.string(),
  focoPrincipal: z.string(),
  mejorBase: z.string(),
  peorBase: z.string(),
  mejorFranja: z.string(),
  peorFranja: z.string(),
  porcentajeADepurar: z.number(),
  porcentajeAltaPrioridad: z.number(),
  porcentajeSaturados: z.number(),
  accionDominante: z.string(),

  // Diagnóstico ejecutivo ampliado
  nivelCalidadGeneral: z.string().optional(),
  principalProblemaDetectado: z.string().optional(),
  estadoDominante: z.string().optional(),
  tagDominante: z.string().optional(),
  riesgoOperativo: z.string().optional(),
  accionRecomendada: z.string().optional(),

  // Lectura lista para mostrar en pantalla o presentación
  lecturaEjecutiva: z.string().optional(),
  lecturaPresentacion: z.array(z.string()).optional(),

  // Análisis comercial/operativo explicado
  interpretacionCalidad: z.string().optional(),
  interpretacionContacto: z.string().optional(),
  interpretacionDepuracion: z.string().optional(),
  interpretacionHorario: z.string().optional(),

  // Semáforo general para visuales
  semaforoCalidad: z.enum(["VERDE", "AMARILLO", "ROJO"]).optional(),
});

export type ResumenEjecutivo = z.infer<typeof resumenEjecutivoSchema>;

export const recomendacionOperativaSchema = z.object({
  tipo: z.enum(["BASE", "FRANJA"]),
  objetivo: z.string(),
  prioridad: z.string(),
  recomendacion: z.string(),
  motivo: z.string(),
  score: z.number().optional(),
  contactoPct: z.number().optional(),
  volumen: z.number().optional(),
});

export const segmentoMultiarchivoSchema = z.object({
  archivoOrigen: z.string(),
  fechaArchivo: z.string().optional(),
  base: z.string(),
  prefijo: z.string(),
  franja: z.string(),
  totalRegistros: z.number(),
  totalAnis: z.number(),
  contactoEfectivo: z.number(),
  pctContactoEfectivo: z.number(),
  noContacto: z.number(),
  pctNoContacto: z.number(),
  buzones: z.number(),
  invalidos: z.number(),
  accionSugerida: z.string(),
  nivel: z.string(),
  lectura: z.string(),
});

export type SegmentoMultiarchivo = z.infer<typeof segmentoMultiarchivoSchema>;

export const baseRepetidaMultiarchivoSchema = z.object({
  base: z.string(),
  apariciones: z.number(),
  archivos: z.array(z.string()),
  totalRegistros: z.number(),
  lectura: z.string(),
});

export type BaseRepetidaMultiarchivo = z.infer<
  typeof baseRepetidaMultiarchivoSchema
>;

export const comparativaMultiarchivoSchema = z.object({
  totalArchivos: z.number(),
  archivosCargados: z.array(z.string()),
  basesRepetidas: z.array(baseRepetidaMultiarchivoSchema),
  mejoresSegmentos: z.array(segmentoMultiarchivoSchema),
  segmentosARevisar: z.array(segmentoMultiarchivoSchema),
  prefijoMasEstable: z.string().optional(),
  franjaMasConveniente: z.string().optional(),
  recomendacionGeneral: z.string(),
});

export type ComparativaMultiarchivo = z.infer<
  typeof comparativaMultiarchivoSchema
>;

export type RecomendacionOperativa = z.infer<typeof recomendacionOperativaSchema>;

export const analysisResultSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  uploadedAt: z.string(),
  totalRecords: z.number(),
  totalAnis: z.number(),
  anisContactados: z.number(),
  anisADepurar: z.number(),
  pctAnswer: z.number(),
  pctNoAnswer: z.number(),

  estadoDistribucion: z.record(z.string(), z.number()),

  estadoOperativoDistribucion: z
    .record(z.string(), z.number())
    .optional(),

  tagDistribucion: z.record(z.string(), z.number()),

  turnoDistribucion: z.record(
    z.string(),
    z.object({
      total: z.number(),
      answer: z.number(),
      noAnswer: z.number(),
    })
  ),

  prefijoDistribucion: z.array(
    z.object({
      prefijo: z.string(),
      total: z.number(),
      pctSobreTotal: z.number(),
    })
  ),

  prefijoDistribucionAnswer: z.array(
    z.object({
      prefijo: z.string(),
      total: z.number(),
      pctSobreTotal: z.number(),
    })
  ),

  curvaContactacion: z.array(
    z.object({
      intento: z.number(),
      cantidad: z.number(),
    })
  ),

  intentosDistribucion: z.array(
    z.object({
      intentos: z.number(),
      cantidad: z.number(),
      porcentaje: z.number(),
    })
  ),

  aniSummaries: z.array(aniSummarySchema),
  rawRecords: z.array(callRecordSchema),

  rangoDistribucion: z.record(
    z.string(),
    z.object({
      total: z.number(),
      answer: z.number(),
      noAnswer: z.number(),
    })
  ),

      baseInsights: z.array(baseInsightSchema).optional(),
    depuracionInsights: z.array(depuracionInsightSchema).optional(),
    franjaDistribucion: z
      .record(z.string(), franjaDistribucionItemSchema)
      .optional(),
    resumenEjecutivo: resumenEjecutivoSchema.optional(),
    recomendacionesOperativas: z.array(recomendacionOperativaSchema).optional(),
    comparativaMultiarchivo: comparativaMultiarchivoSchema.optional(),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const prefijoCatalogoSchema = z.object({
  prefijo: z.string(),
  areaLocal: z.string(),
});

export type PrefijoCatalogo = z.infer<typeof prefijoCatalogoSchema>;

export const fileUploadSchema = z.object({
  files: z.array(z.instanceof(File)).min(1, "Se requiere al menos un archivo"),
});

export type FileUpload = z.infer<typeof fileUploadSchema>;

export const simuladorCorteResultSchema = z.object({
  corte: z.number(),
  anisQueSeCortan: z.number(),
  anisQueSiguen: z.number(),
  pctDelAmbito: z.number(),
});

export type SimuladorCorteResult = z.infer<typeof simuladorCorteResultSchema>;

export const analysisSummarySchema = analysisResultSchema.omit({
  rawRecords: true,
});

export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export const recordsFilterSchema = z.object({
  estados: z.array(z.string()).optional(),
  subestados: z.array(z.string()).optional(),
  bases: z.array(z.string()).optional(),
  aniContains: z.string().optional(),
  durMin: z.number().optional(),
  durMax: z.number().optional(),
});

export type RecordsFilter = z.infer<typeof recordsFilterSchema>;

export const analysisMetaSchema = z.object({
  distinctEstados: z.array(z.string()),
  distinctSubestados: z.array(z.string()),
  distinctBases: z.array(z.string()),
  maxDuracion: z.number(),
});

export type AnalysisMeta = z.infer<typeof analysisMetaSchema>;

export const recordsQueryResponseSchema = z.object({
  total: z.number(),
  answer: z.number(),
  noAnswer: z.number(),
  records: z.array(callRecordSchema),
});

export type RecordsQueryResponse = z.infer<typeof recordsQueryResponseSchema>;