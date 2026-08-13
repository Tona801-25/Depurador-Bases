import type {
  FuzzionFilterConfig,
  FuzzionFilterCondition,
  FuzzionFilterCriteria,
} from "./fuzzionFilters.ts";

export function resolveFuzzionDevelopmentUi(search: string) {
  return new URLSearchParams(search).get("fuzzion-ui") === "legacy"
    ? "legacy" as const
    : "v2" as const;
}

export function parsePositiveIntegerInput(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function hasUnsavedFuzzionConfigChanges(
  loadedConfig: FuzzionFilterConfig | null,
  visibleName: string,
  visibleCriteria: FuzzionFilterCriteria,
) {
  if (!loadedConfig) return false;
  return loadedConfig.name.trim() !== visibleName.trim() ||
    fuzzionCriteriaSignature(loadedConfig.criteria) !==
      fuzzionCriteriaSignature(visibleCriteria);
}

export function fuzzionConfigSwitchAction(hasUnsavedChanges: boolean) {
  return hasUnsavedChanges ? "CONFIRM" as const : "APPLY" as const;
}

export function hasFuzzionConditions(criteria: FuzzionFilterCriteria) {
  return criteria.catalogConditions.length > 0 || criteria.gatewayConditions.length > 0;
}

export function canSimulateFuzzionCriteria(criteria: FuzzionFilterCriteria) {
  return criteria.downloadType === "DEPURADO" || hasFuzzionConditions(criteria);
}

function canonicalConditions(conditions: FuzzionFilterCondition[]) {
  return [...conditions]
    .map(({ key, label, minimumCount }) => ({ key, label, minimumCount }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function fuzzionCriteriaSignature(criteria: FuzzionFilterCriteria) {
  return JSON.stringify({
    downloadType: criteria.downloadType,
    rangeDays: criteria.rangeDays,
    catalogConditions: canonicalConditions(criteria.catalogConditions),
    gatewayConditions: canonicalConditions(criteria.gatewayConditions),
    protectEffectiveContact:
      criteria.downloadType === "DEPURADO" && criteria.protectEffectiveContact,
  });
}

export function isCurrentFuzzionResponse(
  responseRequestId: number,
  latestRequestId: number,
  responseSignature: string,
  visibleSignature: string,
) {
  return responseRequestId === latestRequestId && responseSignature === visibleSignature;
}

export function matchesFuzzionPreviewSearch(
  values: unknown[],
  search: string,
) {
  const query = search.trim().toLocaleLowerCase("es");
  if (!query) return true;
  return values.some((value) =>
    String(value ?? "").toLocaleLowerCase("es").includes(query),
  );
}
