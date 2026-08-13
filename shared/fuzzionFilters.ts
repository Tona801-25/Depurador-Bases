export const FUZZION_HISTORY_RANGES = [0, 7, 30, 60, 90] as const;

export type FuzzionHistoryRangeDays =
  (typeof FUZZION_HISTORY_RANGES)[number];

export type FuzzionDownloadType = "DEPURADO" | "SEGMENTO";
export type FuzzionConditionType = "CATALOG" | "GATEWAY";

export type FuzzionFilterCondition = {
  key: string;
  label: string;
  minimumCount: number;
};

export type FuzzionFilterCriteria = {
  downloadType: FuzzionDownloadType;
  rangeDays: FuzzionHistoryRangeDays;
  catalogConditions: FuzzionFilterCondition[];
  gatewayConditions: FuzzionFilterCondition[];
  protectEffectiveContact: boolean;
};

export type FuzzionEvidenceCondition = {
  key: string;
  label: string;
  count: number;
};

export type FuzzionAniEvidence = {
  ani: string;
  catalogs: Record<string, FuzzionEvidenceCondition>;
  gateways: Record<string, FuzzionEvidenceCondition>;
  hasEffectiveContact: boolean;
};

export type FuzzionHistorySnapshot = {
  maxCallRecordId: number;
  maxGestionRecordId: number;
  historyAsOf: string;
};

export type FuzzionGatewayHistoryCount = {
  ani: string;
  estado: string;
  subestado: string;
  count: number;
};

export type FuzzionCatalogHistoryCount = {
  ani: string;
  resultado: string;
  subresultado: string;
  count: number;
};

export type FuzzionHistoryEvidenceRows = {
  gatewayRows: FuzzionGatewayHistoryCount[];
  catalogRows: FuzzionCatalogHistoryCount[];
  effectiveContactAnis: string[];
};

export type FuzzionEvaluationReason = {
  type: FuzzionConditionType;
  key: string;
  label: string;
  foundCount: number;
  minimumCount: number;
  rangeDays: FuzzionHistoryRangeDays;
};

export type FuzzionLotDecision = {
  ani: string;
  included: boolean;
  protectedByEffectiveContact: boolean;
  hasEffectiveContact: boolean;
  reasons: FuzzionEvaluationReason[];
};

export type FuzzionLotEvaluation = {
  criteria: FuzzionFilterCriteria;
  decisions: FuzzionLotDecision[];
  includedAnis: string[];
  excludedAnis: string[];
  totals: {
    initial: number;
    included: number;
    excluded: number;
    protectedByEffectiveContact: number;
  };
};

export type FuzzionMatrixCell = {
  catalogKey: string;
  catalogLabel: string;
  gatewayKey: string;
  gatewayLabel: string;
  uniqueAnis: number;
};

export type FuzzionAvailableCondition = {
  key: string;
  label: string;
  occurrences: number;
  uniqueAnis: number;
};

export type FuzzionOptionsV2 = {
  rangeDays: FuzzionHistoryRangeDays;
  catalogOptions: FuzzionAvailableCondition[];
  gatewayOptions: FuzzionAvailableCondition[];
  matrix: FuzzionMatrixCell[];
  metrics: {
    uniqueAnis: number;
    historyQueryMs: number;
    aggregationMs: number;
    totalMs: number;
  };
};

export type FuzzionFilterConfig = {
  id: string;
  name: string;
  criteria: FuzzionFilterCriteria;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FuzzionFilterConfigInput = {
  name: string;
  criteria: FuzzionFilterCriteria;
};
