import { z } from "zod";

export const callRecordSchema = z.object({
  fecha: z.string().optional(),
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
  tagDistribucion: z.record(z.string(), z.number()),
  turnoDistribucion: z.record(z.string(), z.object({
    total: z.number(),
    answer: z.number(),
    noAnswer: z.number(),
  })),
  prefijoDistribucion: z.array(z.object({
    prefijo: z.string(),
    total: z.number(),
    pctSobreTotal: z.number(),
  })),
  curvaContactacion: z.array(z.object({
    intento: z.number(),
    cantidad: z.number(),
  })),
  intentosDistribucion: z.array(z.object({
    intentos: z.number(),
    cantidad: z.number(),
    porcentaje: z.number(),
  })),
  aniSummaries: z.array(aniSummarySchema),
  rawRecords: z.array(callRecordSchema),
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
