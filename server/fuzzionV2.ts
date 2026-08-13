import { performance } from "node:perf_hooks";

import type {
  FuzzionAvailableCondition,
  FuzzionFilterCriteria,
  FuzzionHistoryRangeDays,
  FuzzionHistorySnapshot,
  FuzzionLotEvaluation,
  FuzzionOptionsV2,
} from "../shared/fuzzionFilters.ts";
import { FUZZION_HISTORY_RANGES } from "../shared/fuzzionFilters.ts";
import {
  buildFuzzionConditionMatrix,
  buildFuzzionEvidenceByAni,
  evaluateFuzzionLot,
  FuzzionFilterValidationError,
  parseFuzzionFilterCriteria,
} from "./fuzzionFilterEngine.ts";
import { getFuzzionHistoryEvidenceRowsForAnis } from "./localDb.ts";

export type FuzzionV2Metrics = {
  uniqueAnis: number;
  rangeDays: number;
  conditionCount: number;
  historyQueryMs: number;
  evaluationMs: number;
  fileCreationMs: number;
  totalMs: number;
  exportedCount: number;
};

export type FuzzionV2ConditionBreakdown = {
  type: "CATALOG" | "GATEWAY";
  key: string;
  label: string;
  minimumCount: number;
  matchingAnis: number;
  protectedAnis: number;
};

export type FuzzionV2EvaluationResult = {
  criteria: FuzzionFilterCriteria;
  evaluation: FuzzionLotEvaluation;
  breakdown: FuzzionV2ConditionBreakdown[];
  metrics: FuzzionV2Metrics;
};

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function parseRangeDays(input: unknown): FuzzionHistoryRangeDays {
  const source = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  const rangeDays = Number(source.rangeDays ?? input);
  if (!FUZZION_HISTORY_RANGES.includes(rangeDays as FuzzionHistoryRangeDays)) {
    throw new FuzzionFilterValidationError(
      "El rango historico debe ser 0, 7, 30, 60 o 90 dias.",
    );
  }
  return rangeDays as FuzzionHistoryRangeDays;
}

function aggregateAvailableConditions(
  values: Array<Record<string, { key: string; label: string; count: number }>>,
) {
  const aggregated = new Map<string, FuzzionAvailableCondition>();

  for (const conditions of values) {
    for (const condition of Object.values(conditions)) {
      const current = aggregated.get(condition.key);
      if (current) {
        current.occurrences += condition.count;
        current.uniqueAnis += 1;
      } else {
        aggregated.set(condition.key, {
          key: condition.key,
          label: condition.label,
          occurrences: condition.count,
          uniqueAnis: 1,
        });
      }
    }
  }

  return Array.from(aggregated.values()).sort(
    (a, b) =>
      b.uniqueAnis - a.uniqueAnis ||
      b.occurrences - a.occurrences ||
      a.label.localeCompare(b.label),
  );
}

export function getFuzzionSessionOptionsV2(
  anis: string[],
  snapshot: FuzzionHistorySnapshot,
  input: unknown,
): FuzzionOptionsV2 {
  const totalStartedAt = performance.now();
  const rangeDays = parseRangeDays(input);
  const queryStartedAt = performance.now();
  const rows = getFuzzionHistoryEvidenceRowsForAnis(
    anis,
    rangeDays,
    snapshot,
    { includeEffectiveContact: false },
  );
  const historyQueryMs = performance.now() - queryStartedAt;

  const aggregationStartedAt = performance.now();
  const evidenceByAni = buildFuzzionEvidenceByAni(
    anis,
    rows.gatewayRows,
    rows.catalogRows,
  );
  const catalogOptions = aggregateAvailableConditions(
    Array.from(evidenceByAni.values(), (item) => item.catalogs),
  );
  const gatewayOptions = aggregateAvailableConditions(
    Array.from(evidenceByAni.values(), (item) => item.gateways),
  );
  const matrix = buildFuzzionConditionMatrix(evidenceByAni);
  const aggregationMs = performance.now() - aggregationStartedAt;

  return {
    rangeDays,
    catalogOptions,
    gatewayOptions,
    matrix,
    metrics: {
      uniqueAnis: evidenceByAni.size,
      historyQueryMs: roundMs(historyQueryMs),
      aggregationMs: roundMs(aggregationMs),
      totalMs: roundMs(performance.now() - totalStartedAt),
    },
  };
}

function buildConditionBreakdown(evaluation: FuzzionLotEvaluation) {
  const result = new Map<string, FuzzionV2ConditionBreakdown>();
  const selectedConditions = [
    ...evaluation.criteria.catalogConditions.map((condition) => ({
      ...condition,
      type: "CATALOG" as const,
    })),
    ...evaluation.criteria.gatewayConditions.map((condition) => ({
      ...condition,
      type: "GATEWAY" as const,
    })),
  ];

  for (const condition of selectedConditions) {
    result.set(`${condition.type}\u001f${condition.key}`, {
      type: condition.type,
      key: condition.key,
      label: condition.label,
      minimumCount: condition.minimumCount,
      matchingAnis: 0,
      protectedAnis: 0,
    });
  }

  for (const decision of evaluation.decisions) {
    for (const reason of decision.reasons) {
      const item = result.get(`${reason.type}\u001f${reason.key}`);
      if (!item) continue;
      item.matchingAnis += 1;
      if (decision.protectedByEffectiveContact) item.protectedAnis += 1;
    }
  }

  return Array.from(result.values());
}

export function evaluateFuzzionSessionV2(
  anis: string[],
  snapshot: FuzzionHistorySnapshot,
  criteriaInput: unknown,
): FuzzionV2EvaluationResult {
  const totalStartedAt = performance.now();
  const criteria = parseFuzzionFilterCriteria(criteriaInput);
  const conditionCount =
    criteria.catalogConditions.length + criteria.gatewayConditions.length;
  const shouldProtectContact =
    criteria.downloadType === "DEPURADO" &&
    criteria.protectEffectiveContact &&
    conditionCount > 0;

  const queryStartedAt = performance.now();
  const evidenceRows = conditionCount > 0
    ? getFuzzionHistoryEvidenceRowsForAnis(
        anis,
        criteria.rangeDays,
        snapshot,
        {
          gatewayKeys: criteria.gatewayConditions.map((condition) => condition.key),
          catalogKeys: criteria.catalogConditions.map((condition) => condition.key),
          includeEffectiveContact: shouldProtectContact,
        },
      )
    : {
        gatewayRows: [],
        catalogRows: [],
        effectiveContactAnis: [],
      };
  const historyQueryMs = performance.now() - queryStartedAt;

  const evaluationStartedAt = performance.now();
  const evidenceByAni = buildFuzzionEvidenceByAni(
    anis,
    evidenceRows.gatewayRows,
    evidenceRows.catalogRows,
    evidenceRows.effectiveContactAnis,
  );
  const evaluation = evaluateFuzzionLot(anis, evidenceByAni, criteria);
  const breakdown = buildConditionBreakdown(evaluation);
  const evaluationMs = performance.now() - evaluationStartedAt;

  return {
    criteria,
    evaluation,
    breakdown,
    metrics: {
      uniqueAnis: evaluation.totals.initial,
      rangeDays: criteria.rangeDays,
      conditionCount,
      historyQueryMs: roundMs(historyQueryMs),
      evaluationMs: roundMs(evaluationMs),
      fileCreationMs: 0,
      totalMs: roundMs(performance.now() - totalStartedAt),
      exportedCount: evaluation.totals.included,
    },
  };
}

export function withFuzzionV2FileMetrics(
  result: FuzzionV2EvaluationResult,
  fileCreationMs: number,
  totalMs: number,
  exportedCount: number,
) {
  return {
    ...result.metrics,
    fileCreationMs: roundMs(fileCreationMs),
    totalMs: roundMs(totalMs),
    exportedCount,
  };
}
