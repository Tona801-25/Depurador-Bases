import type {
  FuzzionAniEvidence,
  FuzzionEvidenceCondition,
  FuzzionFilterCondition,
  FuzzionFilterCriteria,
  FuzzionGatewayHistoryCount,
  FuzzionCatalogHistoryCount,
  FuzzionHistoryRangeDays,
  FuzzionLotEvaluation,
  FuzzionMatrixCell,
} from "../shared/fuzzionFilters.ts";
import { FUZZION_HISTORY_RANGES } from "../shared/fuzzionFilters.ts";

export class FuzzionFilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FuzzionFilterValidationError";
  }
}

function normalizeReadableText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function compactGatewayToken(value: unknown) {
  return normalizeReadableText(value).replace(/[^A-Z0-9]+/g, "");
}

export function normalizeGatewayConditionKey(value: unknown) {
  return compactGatewayToken(value);
}

export function normalizeCatalogConditionKey(value: unknown) {
  const [resultado = "", ...subresultadoParts] = String(value ?? "").split("|");
  const subresultado = subresultadoParts.join("|");
  return `${normalizeReadableText(resultado)}|${normalizeReadableText(subresultado)}`;
}

export function normalizeCatalogCondition(
  resultado: unknown,
  subresultado: unknown,
) {
  const normalizedResult = normalizeReadableText(resultado);
  const normalizedSubresult = normalizeReadableText(subresultado);
  if (!normalizedResult && !normalizedSubresult) return null;

  const key = normalizeCatalogConditionKey(
    `${normalizedResult}|${normalizedSubresult}`,
  );
  const label = [normalizedResult, normalizedSubresult]
    .filter(Boolean)
    .join(" - ");
  return { key, label };
}

export function classifyGatewayCondition(
  estado: unknown,
  subestado: unknown,
) {
  const stateKey = compactGatewayToken(estado);
  const substateKey = compactGatewayToken(subestado);
  if (!stateKey && !substateKey) return null;

  if (stateKey === "UNALLOCATED" || substateKey === "UNALLOCATED") {
    return { key: "UNALLOCATED", label: "UNALLOCATED" };
  }
  if (stateKey === "REJECTED" || substateKey === "REJECTED") {
    return { key: "REJECTED", label: "REJECTED" };
  }
  if (
    stateKey === "ANSWER" &&
    (
      substateKey.includes("MACHINE") ||
      substateKey.includes("ANSWERING") ||
      substateKey.includes("BUZON") ||
      substateKey.includes("VOICEMAIL")
    )
  ) {
    return { key: "ANSWERINGMACHINE", label: "ANSWERING MACHINE" };
  }

  if (!stateKey) return null;
  const knownLabels: Record<string, string> = {
    ANSWER: "ANSWER",
    NOANSWER: "NOANSWER",
    BUSY: "BUSY",
  };
  return {
    key: stateKey,
    label: knownLabels[stateKey] ?? normalizeReadableText(estado),
  };
}

function normalizeCriteriaCondition(
  condition: FuzzionFilterCondition,
  index: number,
  group: string,
  normalizeKey: (value: unknown) => string,
) {
  const key = normalizeKey(condition.key);
  const label = String(condition.label ?? "").trim() || key;
  const minimumCount = Number(condition.minimumCount);

  if (!key) {
    throw new FuzzionFilterValidationError(
      `La condicion ${index + 1} de ${group} no tiene una clave valida.`,
    );
  }
  if (!Number.isSafeInteger(minimumCount) || minimumCount < 1) {
    throw new FuzzionFilterValidationError(
      `La cantidad minima de ${label} debe ser un entero mayor o igual que 1.`,
    );
  }

  return { key, label, minimumCount };
}

function normalizeConditionGroup(
  conditions: FuzzionFilterCondition[],
  group: string,
  normalizeKey: (value: unknown) => string,
) {
  const normalized = conditions.map((condition, index) =>
    normalizeCriteriaCondition(condition, index, group, normalizeKey),
  );
  const seen = new Set<string>();
  for (const condition of normalized) {
    if (seen.has(condition.key)) {
      throw new FuzzionFilterValidationError(
        `La condicion ${condition.label} esta repetida en ${group}.`,
      );
    }
    seen.add(condition.key);
  }
  return normalized;
}

export function normalizeFuzzionFilterCriteria(
  criteria: FuzzionFilterCriteria,
): FuzzionFilterCriteria {
  if (!FUZZION_HISTORY_RANGES.includes(criteria.rangeDays)) {
    throw new FuzzionFilterValidationError(
      "El rango historico debe ser 0, 7, 30, 60 o 90 dias.",
    );
  }
  if (criteria.downloadType !== "DEPURADO" && criteria.downloadType !== "SEGMENTO") {
    throw new FuzzionFilterValidationError("El tipo de descarga no es valido.");
  }

  const catalogConditions = normalizeConditionGroup(
    criteria.catalogConditions,
    "catalogaciones",
    normalizeCatalogConditionKey,
  );
  const gatewayConditions = normalizeConditionGroup(
    criteria.gatewayConditions,
    "estados Gateway",
    normalizeGatewayConditionKey,
  );
  if (
    criteria.downloadType === "SEGMENTO" &&
    catalogConditions.length === 0 &&
    gatewayConditions.length === 0
  ) {
    throw new FuzzionFilterValidationError(
      "Selecciona al menos una catalogacion o estado Gateway para descargar un grupo puntual.",
    );
  }

  return {
    downloadType: criteria.downloadType,
    rangeDays: criteria.rangeDays,
    catalogConditions,
    gatewayConditions,
    protectEffectiveContact:
      criteria.downloadType === "DEPURADO" &&
      Boolean(criteria.protectEffectiveContact),
  };
}

export function parseFuzzionFilterCriteria(
  input: unknown,
): FuzzionFilterCriteria {
  const raw = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  const parseConditions = (value: unknown): FuzzionFilterCondition[] =>
    Array.isArray(value)
      ? value.map((item) => {
          const condition = item && typeof item === "object"
            ? item as Record<string, unknown>
            : {};
          return {
            key: String(condition.key ?? ""),
            label: String(condition.label ?? condition.key ?? ""),
            minimumCount: Number(condition.minimumCount),
          };
        })
      : [];

  return normalizeFuzzionFilterCriteria({
    downloadType: String(raw.downloadType ?? "") as FuzzionFilterCriteria["downloadType"],
    rangeDays: Number(raw.rangeDays) as FuzzionHistoryRangeDays,
    catalogConditions: parseConditions(raw.catalogConditions),
    gatewayConditions: parseConditions(raw.gatewayConditions),
    protectEffectiveContact: raw.protectEffectiveContact === undefined
      ? true
      : Boolean(raw.protectEffectiveContact),
  });
}

function matchConditions(
  selected: FuzzionFilterCondition[],
  evidence: Record<string, FuzzionEvidenceCondition>,
  type: "CATALOG" | "GATEWAY",
  rangeDays: FuzzionHistoryRangeDays,
) {
  return selected.flatMap((condition) => {
    const foundCount = evidence[condition.key]?.count ?? 0;
    return foundCount >= condition.minimumCount
      ? [{
          type,
          key: condition.key,
          label: condition.label,
          foundCount,
          minimumCount: condition.minimumCount,
          rangeDays,
        }]
      : [];
  });
}

export function evaluateFuzzionLot(
  anis: string[],
  evidenceByAni: ReadonlyMap<string, FuzzionAniEvidence>,
  inputCriteria: FuzzionFilterCriteria,
): FuzzionLotEvaluation {
  const criteria = normalizeFuzzionFilterCriteria(inputCriteria);
  const uniqueAnis = Array.from(
    new Set(
      anis
        .map((ani) => String(ani ?? "").replace(/\D/g, "").trim())
        .filter(Boolean),
    ),
  );

  const decisions = uniqueAnis.map((ani) => {
    const evidence = evidenceByAni.get(ani) ?? {
      ani,
      catalogs: {},
      gateways: {},
      hasEffectiveContact: false,
    };
    const reasons = [
      ...matchConditions(
        criteria.catalogConditions,
        evidence.catalogs,
        "CATALOG",
        criteria.rangeDays,
      ),
      ...matchConditions(
        criteria.gatewayConditions,
        evidence.gateways,
        "GATEWAY",
        criteria.rangeDays,
      ),
    ];
    const matchesAnyCondition = reasons.length > 0;
    const protectedByEffectiveContact =
      criteria.downloadType === "DEPURADO" &&
      matchesAnyCondition &&
      criteria.protectEffectiveContact &&
      evidence.hasEffectiveContact;
    const included = criteria.downloadType === "DEPURADO"
      ? !matchesAnyCondition || protectedByEffectiveContact
      : matchesAnyCondition;

    return {
      ani,
      included,
      protectedByEffectiveContact,
      hasEffectiveContact: evidence.hasEffectiveContact,
      reasons,
    };
  });

  const includedAnis = decisions
    .filter((decision) => decision.included)
    .map((decision) => decision.ani);
  const excludedAnis = decisions
    .filter((decision) => !decision.included)
    .map((decision) => decision.ani);

  return {
    criteria,
    decisions,
    includedAnis,
    excludedAnis,
    totals: {
      initial: decisions.length,
      included: includedAnis.length,
      excluded: excludedAnis.length,
      protectedByEffectiveContact: decisions.filter(
        (decision) => decision.protectedByEffectiveContact,
      ).length,
    },
  };
}

function incrementEvidenceCondition(
  target: Record<string, FuzzionEvidenceCondition>,
  condition: { key: string; label: string },
  count: number,
) {
  const current = target[condition.key];
  if (current) {
    current.count += count;
    return;
  }
  target[condition.key] = {
    ...condition,
    count,
  };
}

export function buildFuzzionEvidenceByAni(
  anis: string[],
  gatewayRows: FuzzionGatewayHistoryCount[],
  catalogRows: FuzzionCatalogHistoryCount[],
  effectiveContactAnis: string[] = [],
) {
  const evidenceByAni = new Map<string, FuzzionAniEvidence>();
  const ensureEvidence = (rawAni: string) => {
    const ani = String(rawAni ?? "").replace(/\D/g, "").trim();
    if (!ani) return null;
    const existing = evidenceByAni.get(ani);
    if (existing) return existing;
    const evidence: FuzzionAniEvidence = {
      ani,
      catalogs: {},
      gateways: {},
      hasEffectiveContact: false,
    };
    evidenceByAni.set(ani, evidence);
    return evidence;
  };

  for (const ani of anis) ensureEvidence(ani);

  for (const row of gatewayRows) {
    const evidence = ensureEvidence(row.ani);
    if (!evidence) continue;
    const condition = classifyGatewayCondition(row.estado, row.subestado);
    if (condition) {
      incrementEvidenceCondition(
        evidence.gateways,
        condition,
        Math.max(0, Number(row.count) || 0),
      );
    }
  }

  for (const row of catalogRows) {
    const evidence = ensureEvidence(row.ani);
    if (!evidence) continue;
    const condition = normalizeCatalogCondition(
      row.resultado,
      row.subresultado,
    );
    if (condition) {
      incrementEvidenceCondition(
        evidence.catalogs,
        condition,
        Math.max(0, Number(row.count) || 0),
      );
    }
  }

  for (const ani of effectiveContactAnis) {
    const evidence = ensureEvidence(ani);
    if (evidence) evidence.hasEffectiveContact = true;
  }

  return evidenceByAni;
}

export function buildFuzzionConditionMatrix(
  evidenceByAni: ReadonlyMap<string, FuzzionAniEvidence>,
): FuzzionMatrixCell[] {
  const cells = new Map<string, FuzzionMatrixCell>();

  for (const evidence of Array.from(evidenceByAni.values())) {
    const catalogs = Array.from(
      new Map(
        Object.values(evidence.catalogs).map((condition) => [
          condition.key,
          condition,
        ]),
      ).values(),
    );
    const gateways = Array.from(
      new Map(
        Object.values(evidence.gateways).map((condition) => [
          condition.key,
          condition,
        ]),
      ).values(),
    );

    for (const catalog of catalogs) {
      for (const gateway of gateways) {
        const cellKey = `${catalog.key}\u001f${gateway.key}`;
        const current = cells.get(cellKey);
        if (current) {
          current.uniqueAnis += 1;
        } else {
          cells.set(cellKey, {
            catalogKey: catalog.key,
            catalogLabel: catalog.label,
            gatewayKey: gateway.key,
            gatewayLabel: gateway.label,
            uniqueAnis: 1,
          });
        }
      }
    }
  }

  return Array.from(cells.values()).sort(
    (a, b) =>
      b.uniqueAnis - a.uniqueAnis ||
      a.catalogLabel.localeCompare(b.catalogLabel) ||
      a.gatewayLabel.localeCompare(b.gatewayLabel),
  );
}
