import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import Database from "better-sqlite3";
import * as XLSX from "xlsx";

import type {
  FuzzionAvailableCondition,
  FuzzionFilterCriteria,
  FuzzionHistoryRangeDays,
} from "../shared/fuzzionFilters.ts";

const baseUrl = process.env.FUZZION_V2_TEST_URL || "http://127.0.0.1:5101";
const size = Math.max(10, Number(process.env.FUZZION_OPERATIONAL_SIZE) || 250);
const format = String(process.env.FUZZION_OPERATIONAL_FORMAT || "csv").toLowerCase();
const profile = String(process.env.FUZZION_OPERATIONAL_PROFILE || "small");
const ranges = String(process.env.FUZZION_OPERATIONAL_RANGES || "7,30,60,90,0")
  .split(",")
  .map(Number) as FuzzionHistoryRangeDays[];
const runFilters = process.env.FUZZION_OPERATIONAL_FILTERS === "1";
const runConfigs = process.env.FUZZION_OPERATIONAL_CONFIGS === "1";
const timeoutMs = Math.max(10_000, Number(process.env.FUZZION_OPERATIONAL_TIMEOUT_MS) || 90_000);
const db = new Database("./data/depurador-bases.sqlite", { readonly: true });

const neotelHeaders = [
  "LINEA",
  "RAZON SOCIAL",
  "DOCUMENTO",
  "DIRECCION del CLIENTE",
  "FECHA DE NACIMIENTO",
  "MERCADO ACTUAL",
  "PLAN ACTUAL",
  "PLAN SUGERIDO",
  "PRECIO",
  "FUENTE DE SOLICITUD",
  "LOCALIDAD",
  "CP",
];

type JsonRecord = Record<string, any>;

function criteria(overrides: Partial<FuzzionFilterCriteria> = {}): FuzzionFilterCriteria {
  return {
    downloadType: "DEPURADO",
    rangeDays: 0,
    catalogConditions: [],
    gatewayConditions: [],
    protectEffectiveContact: true,
    ...overrides,
  };
}

function timeoutSignal() {
  return AbortSignal.timeout(timeoutMs);
}

async function operationalFetch(path: string, init: RequestInit, operation: string) {
  try {
    return await fetch(`${baseUrl}${path}`, init);
  } catch (error) {
    const cause = error instanceof Error && "cause" in error
      ? `; cause=${String(error.cause)}`
      : "";
    throw new Error(`${operation} (${path}) fallo: ${String(error)}${cause}`, { cause: error });
  }
}

async function timedJson(path: string, body?: unknown, method = "POST") {
  const startedAt = performance.now();
  const response = await operationalFetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeoutSignal(),
  }, `${method} JSON`);
  const payload = await response.json().catch(() => null);
  return {
    status: response.status,
    payload,
    clientMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}

function getOperationalAnis(limit: number) {
  return (db.prepare(`
    SELECT ani
    FROM ani_history_summary
    WHERE LENGTH(TRIM(ani)) >= 7
    ORDER BY intentos_totales DESC, ani ASC
    LIMIT ?
  `).all(limit) as Array<{ ani: string }>).map((row) => row.ani);
}

function buildRows(anis: string[]) {
  const rows = anis.map((ani, index) => ({
    LINEA: ani,
    "RAZON SOCIAL": `CLIENTE OPERATIVO ${index + 1}`,
    DOCUMENTO: String(30_000_000 + index),
    "DIRECCION del CLIENTE": `CALLE ${index + 1}`,
    "FECHA DE NACIMIENTO": "",
    "MERCADO ACTUAL": index % 2 ? "MOVIL" : "PORTABILIDAD",
    "PLAN ACTUAL": "PLAN CONTROLADO",
    "PLAN SUGERIDO": "PLAN NEOTEL",
    PRECIO: "",
    "FUENTE DE SOLICITUD": "VALIDACION FASE 5A",
    LOCALIDAD: index % 2 ? "CABA" : "GBA",
    CP: index % 2 ? "1000" : "1704",
  }));
  if (profile === "small") {
    rows.push({ ...rows[0] }, { ...rows[1] });
    rows.push({
      ...rows[0],
      LINEA: "ABC",
      "RAZON SOCIAL": "ANI INVALIDO",
    });
    rows.push({
      ...rows[0],
      LINEA: "",
      "RAZON SOCIAL": "ANI VACIO",
    });
  }
  return rows;
}

function buildInput(rows: ReturnType<typeof buildRows>) {
  const extension = format === "xlsx" ? "xlsx" : format === "xls" ? "xls" : "csv";
  if (extension === "csv") {
    const sheet = XLSX.utils.json_to_sheet(rows, { header: neotelHeaders });
    return {
      name: `fase5a_${profile}_${size}.csv`,
      type: "text/csv",
      buffer: Buffer.from(XLSX.utils.sheet_to_csv(sheet), "utf8"),
    };
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows, { header: neotelHeaders }),
    "Lote Neotel",
  );
  return {
    name: `fase5a_${profile}_${size}.${extension}`,
    type: "application/octet-stream",
    buffer: XLSX.write(workbook, { type: "buffer", bookType: extension }),
  };
}

async function upload(input: ReturnType<typeof buildInput>) {
  const form = new FormData();
  form.append("file", new Blob([input.buffer], { type: input.type }), input.name);
  const startedAt = performance.now();
  const response = await operationalFetch("/api/fuzzion/preview", {
    method: "POST",
    body: form,
    signal: timeoutSignal(),
  }, "carga de lote");
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return {
    payload,
    clientMs: Math.round((performance.now() - startedAt) * 100) / 100,
    inputBytes: input.buffer.length,
  };
}

async function exportAndInspect(sessionId: string, value: FuzzionFilterCriteria) {
  const startedAt = performance.now();
  const exportPath = `/api/fuzzion/${sessionId}/export-v2`;
  const response = await operationalFetch(exportPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criteria: value }),
    signal: timeoutSignal(),
  }, "exportacion V2");
  if (!response.ok) {
    return {
      status: response.status,
      payload: await response.json().catch(() => null),
      clientMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: false });
  const headers = rows[0] ?? [];
  const lines = rows.slice(1).map((row) => String(row[0] ?? ""));
  return {
    status: response.status,
    clientMs: Math.round((performance.now() - startedAt) * 100) / 100,
    headerExportedCount: Number(response.headers.get("X-Exported-Count")),
    rows: lines.length,
    uniqueLines: new Set(lines).size,
    headers,
    bytes: buffer.length,
    server: {
      historyQueryMs: Number(response.headers.get("X-History-Query-Ms")),
      evaluationMs: Number(response.headers.get("X-Evaluation-Ms")),
      fileCreationMs: Number(response.headers.get("X-File-Creation-Ms")),
      totalMs: Number(response.headers.get("X-Total-Ms")),
    },
  };
}

function condition(option: FuzzionAvailableCondition, minimumCount = 1) {
  return { key: option.key, label: option.label, minimumCount };
}

async function evaluateCase(
  sessionId: string,
  caseName: string,
  value: FuzzionFilterCriteria,
) {
  const count = await timedJson(`/api/fuzzion/${sessionId}/count-v2`, { criteria: value });
  const stats = await timedJson(`/api/fuzzion/${sessionId}/stats-v2`, { criteria: value });
  assert.equal(count.status, 200, `${caseName}: ${JSON.stringify(count.payload)}`);
  assert.equal(stats.status, 200, `${caseName}: ${JSON.stringify(stats.payload)}`);
  assert.equal(count.payload.exportableLines, stats.payload.exportableLines);
  const exported = await exportAndInspect(sessionId, value);
  assert.equal(exported.status, 200, `${caseName}: ${JSON.stringify(exported)}`);
  assert.equal(exported.headerExportedCount, count.payload.exportableLines);
  assert.equal(exported.rows, count.payload.exportableLines);
  assert.equal(exported.uniqueLines, exported.rows);
  assert.deepEqual(exported.headers, neotelHeaders);
  return {
    case: caseName,
    exportable: count.payload.exportableLines,
    countMs: count.clientMs,
    statsMs: stats.clientMs,
    exportMs: exported.clientMs,
    bytes: exported.bytes,
    protected: count.payload.totals.protectedByEffectiveContact,
  };
}

function assertIndexedPlans(anis: string[], snapshot: JsonRecord) {
  const sample = anis.slice(0, 3);
  const placeholders = sample.map(() => "?").join(",");
  const callPlan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT ani, estado, subestado, COUNT(*)
    FROM call_records INDEXED BY idx_call_records_ani
    WHERE ani IN (${placeholders}) AND id <= ? AND fecha <= ?
    GROUP BY ani, estado, subestado
  `).all(...sample, snapshot.maxCallRecordId, snapshot.historyAsOf) as JsonRecord[];
  const gestionPlan = db.prepare(`
    EXPLAIN QUERY PLAN
    SELECT ani, resultado, subresultado, COUNT(*)
    FROM gestion_records INDEXED BY idx_gestion_records_ani
    WHERE ani IN (${placeholders}) AND id <= ? AND ts <= ?
    GROUP BY ani, resultado, subresultado
  `).all(...sample, snapshot.maxGestionRecordId, snapshot.historyAsOf) as JsonRecord[];
  const callDetail = callPlan.map((row) => String(row.detail)).join(" | ");
  const gestionDetail = gestionPlan.map((row) => String(row.detail)).join(" | ");
  assert.match(callDetail, /SEARCH call_records USING INDEX idx_call_records_ani/i);
  assert.match(gestionDetail, /SEARCH gestion_records USING INDEX idx_gestion_records_ani/i);
  assert.doesNotMatch(callDetail, /SCAN call_records/i);
  assert.doesNotMatch(gestionDetail, /SCAN gestion_records/i);
  return { callDetail, gestionDetail };
}

async function validateConfigs(sessionId: string, options: JsonRecord) {
  const suffix = `${profile}_${size}_${Date.now()}`;
  const configName = `FASE5A_${suffix}`;
  const initialList = await timedJson("/api/fuzzion/filter-configs-v2", undefined, "GET");
  assert.equal(initialList.status, 200);
  const initialDefaultId = (initialList.payload.configs as JsonRecord[])
    .find((item) => item.isDefault)?.id as string | undefined;
  const catalog = options.catalogOptions[0] as FuzzionAvailableCondition | undefined;
  const gateway = options.gatewayOptions[0] as FuzzionAvailableCondition | undefined;
  assert.ok(catalog || gateway);
  const value = criteria({
    rangeDays: 30,
    catalogConditions: catalog ? [condition(catalog, 2)] : [],
    gatewayConditions: gateway ? [condition(gateway, 3)] : [],
  });
  let configId = "";
  try {
    const created = await timedJson("/api/fuzzion/filter-configs-v2", { name: configName, criteria: value });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    configId = created.payload.config.id;
    const applied = await timedJson(`/api/fuzzion/${sessionId}/count-v2`, { criteria: created.payload.config.criteria });
    assert.equal(applied.status, 200);
    const editedCriteria = {
      ...created.payload.config.criteria,
      rangeDays: 60,
      catalogConditions: created.payload.config.criteria.catalogConditions.map((item: JsonRecord) => ({ ...item, minimumCount: 4 })),
    };
    const edited = await timedJson(`/api/fuzzion/filter-configs-v2/${configId}`, { name: `${configName}_EDITADA`, criteria: editedCriteria }, "PUT");
    assert.equal(edited.status, 200, JSON.stringify(edited.payload));
    const marked = await timedJson(`/api/fuzzion/filter-configs-v2/${configId}/default`, {});
    assert.equal(marked.status, 200);
    const otherSession = await timedJson("/api/fuzzion/filter-configs-v2", undefined, "GET");
    assert.equal(otherSession.status, 200);
    assert.ok(otherSession.payload.configs.some((item: JsonRecord) => item.id === configId && item.isDefault));

    const missingName = `${configName}_SIN_COINCIDENCIAS`;
    const missing = await timedJson("/api/fuzzion/filter-configs-v2", {
      name: missingName,
      criteria: criteria({
        downloadType: "SEGMENTO",
        rangeDays: 30,
        gatewayConditions: [{ key: "SIN_COINCIDENCIAS_FASE5A", label: "SIN COINCIDENCIAS FASE 5A", minimumCount: 2 }],
      }),
    });
    assert.equal(missing.status, 201);
    const missingId = missing.payload.config.id;
    const missingEvaluation = await timedJson(`/api/fuzzion/${sessionId}/count-v2`, { criteria: missing.payload.config.criteria });
    assert.equal(missingEvaluation.status, 200);
    assert.equal(missingEvaluation.payload.exportableLines, 0);
    const deleteMissing = await timedJson(`/api/fuzzion/filter-configs-v2/${missingId}`, undefined, "DELETE");
    assert.equal(deleteMissing.status, 200);

    const deleted = await timedJson(`/api/fuzzion/filter-configs-v2/${configId}`, undefined, "DELETE");
    assert.equal(deleted.status, 200);
    configId = "";
    const finalList = await timedJson("/api/fuzzion/filter-configs-v2", undefined, "GET");
    assert.equal(finalList.payload.configs.some((item: JsonRecord) => item.isDefault), false);
    return {
      created: true,
      appliedExportable: applied.payload.exportableLines,
      recoveredFromOtherSession: true,
      missingConditionExportable: missingEvaluation.payload.exportableLines,
      noDefaultAfterDelete: true,
    };
  } finally {
    if (configId) await timedJson(`/api/fuzzion/filter-configs-v2/${configId}`, undefined, "DELETE").catch(() => null);
    const cleanupList = await timedJson("/api/fuzzion/filter-configs-v2", undefined, "GET").catch(() => null);
    for (const item of cleanupList?.payload?.configs ?? []) {
      if (String(item.name).startsWith(`FASE5A_${suffix}`)) {
        await timedJson(`/api/fuzzion/filter-configs-v2/${item.id}`, undefined, "DELETE").catch(() => null);
      }
    }
    if (initialDefaultId) {
      await timedJson(`/api/fuzzion/filter-configs-v2/${initialDefaultId}/default`, {}).catch(() => null);
    }
  }
}

async function main() {
  assert.ok(["csv", "xls", "xlsx"].includes(format));
  const anis = getOperationalAnis(size);
  assert.equal(anis.length, size, `SQLite no tiene ${size} ANI validos para la prueba.`);
  const rows = buildRows(anis);
  const input = buildInput(rows);
  const uploaded = await upload(input);
  assert.equal(uploaded.payload.uniqueAnis, size);
  if (profile === "small") {
    assert.equal(uploaded.payload.duplicateRows, 2);
    assert.equal(uploaded.payload.invalidRows, 2);
  }

  const rangeResults: JsonRecord[] = [];
  let firstOptions: JsonRecord | null = null;
  const optionsByRange = new Map<number, JsonRecord>();
  let plans: JsonRecord | null = null;
  for (const rangeDays of ranges) {
    const configReadStartedAt = performance.now();
    const optionsPromise = timedJson(`/api/fuzzion/${uploaded.payload.id}/options-v2`, { rangeDays });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const concurrentConfigRead = await timedJson("/api/fuzzion/filter-configs-v2", undefined, "GET")
      .catch((error) => ({
        status: 0,
        payload: null,
        clientMs: null,
        error: error instanceof Error ? error.message : String(error),
      }));
    const concurrentConfigReadMs = Math.round((performance.now() - configReadStartedAt) * 100) / 100;
    const options = await optionsPromise;
    assert.equal(options.status, 200, JSON.stringify(options.payload));
    firstOptions ??= options.payload;
    optionsByRange.set(rangeDays, options.payload);
    plans ??= assertIndexedPlans(anis, options.payload.snapshot);
    const value = criteria({ rangeDays });
    const count = await timedJson(`/api/fuzzion/${uploaded.payload.id}/count-v2`, { criteria: value });
    const stats = await timedJson(`/api/fuzzion/${uploaded.payload.id}/stats-v2`, { criteria: value });
    assert.equal(count.status, 200);
    assert.equal(stats.status, 200);
    assert.equal(count.payload.exportableLines, stats.payload.exportableLines);
    const searched = await timedJson(`/api/fuzzion/${uploaded.payload.id}/count-v2`, { criteria: value, search: "NO DEBE CAMBIAR" });
    assert.equal(searched.payload.exportableLines, count.payload.exportableLines);
    const exported = await exportAndInspect(uploaded.payload.id, value);
    assert.equal(exported.status, 200);
    assert.equal(exported.headerExportedCount, count.payload.exportableLines);
    assert.equal(exported.rows, count.payload.exportableLines);
    assert.equal(exported.uniqueLines, exported.rows);
    assert.deepEqual(exported.headers, neotelHeaders);
    rangeResults.push({
      rangeDays,
      uniqueAnis: uploaded.payload.uniqueAnis,
      optionsMs: options.clientMs,
      optionsServerMs: options.payload.metrics.totalMs,
      countMs: count.clientMs,
      statsMs: stats.clientMs,
      exportMs: exported.clientMs,
      exportServerMs: exported.server.totalMs,
      exportable: count.payload.exportableLines,
      fileBytes: exported.bytes,
      concurrentConfigReadMs,
      concurrentConfigReadStatus: concurrentConfigRead.status,
      concurrentConfigReadError: "error" in concurrentConfigRead
        ? concurrentConfigRead.error
        : null,
    });
    console.error(`[fase5a] ${profile}/${format}: rango ${rangeDays || "historial"} validado`);
  }

  const filterResults: JsonRecord[] = [];
  const filterOptions = optionsByRange.get(0) ?? firstOptions;
  if (runFilters && filterOptions) {
    const catalogs = filterOptions.catalogOptions as FuzzionAvailableCondition[];
    const gateways = filterOptions.gatewayOptions as FuzzionAvailableCondition[];
    assert.ok(catalogs.length >= 1 && gateways.length >= 1);
    const catalogOne = condition(catalogs[0]);
    const catalogHigh = condition(catalogs[0], 2);
    const gatewayOne = condition(gateways[0]);
    const gatewayHigh = condition(gateways[0], 2);
    const secondGateway = condition(gateways[1] ?? gateways[0]);
    const answer = gateways.find((item) => item.key === "ANSWER");
    const cases: Array<[string, FuzzionFilterCriteria]> = [
      ["depurado-sin-filtros", criteria()],
      ["depurado-catalogacion", criteria({ catalogConditions: [catalogOne] })],
      ["depurado-varios-or", criteria({ catalogConditions: [catalogOne], gatewayConditions: [gatewayOne, secondGateway] })],
      ["gateway-minimo-1", criteria({ gatewayConditions: [gatewayOne] })],
      ["gateway-minimo-superior", criteria({ gatewayConditions: [gatewayHigh] })],
      ["catalogacion-minimo-superior", criteria({ catalogConditions: [catalogHigh] })],
      ["catalogacion-gateway", criteria({ catalogConditions: [catalogHigh], gatewayConditions: [gatewayHigh] })],
      ["proteccion-activada", criteria({ gatewayConditions: [condition(answer ?? gateways[0])], protectEffectiveContact: true })],
      ["proteccion-desactivada", criteria({ gatewayConditions: [condition(answer ?? gateways[0])], protectEffectiveContact: false })],
      ["grupo-catalogacion", criteria({ downloadType: "SEGMENTO", catalogConditions: [catalogOne] })],
      ["grupo-gateway", criteria({ downloadType: "SEGMENTO", gatewayConditions: [gatewayOne] })],
      ["grupo-combinado", criteria({ downloadType: "SEGMENTO", catalogConditions: [catalogOne], gatewayConditions: [gatewayOne] })],
    ];
    for (const [caseName, value] of cases) {
      filterResults.push(await evaluateCase(uploaded.payload.id, caseName, value));
    }
    const blocked = await timedJson(`/api/fuzzion/${uploaded.payload.id}/count-v2`, {
      criteria: criteria({ downloadType: "SEGMENTO" }),
    });
    assert.equal(blocked.status, 400);
    filterResults.push({ case: "grupo-sin-filtros", status: 400 });
  }

  const configResult = runConfigs && filterOptions
    ? await validateConfigs(uploaded.payload.id, filterOptions)
    : null;

  console.log(JSON.stringify({
    ok: true,
    lot: {
      profile,
      requestedUniqueAnis: size,
      format,
      source: "ANI reales de ani_history_summary; archivo controlado en memoria",
      inputRows: rows.length,
      inputBytes: uploaded.inputBytes,
      uploadMs: uploaded.clientMs,
      uniqueAnis: uploaded.payload.uniqueAnis,
      duplicateRows: uploaded.payload.duplicateRows,
      invalidRows: uploaded.payload.invalidRows,
    },
    ranges: rangeResults,
    filters: filterResults,
    configs: configResult,
    queryPlans: plans,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(() => db.close());
