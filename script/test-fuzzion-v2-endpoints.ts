import assert from "node:assert/strict";

import Database from "better-sqlite3";
import * as XLSX from "xlsx";

import {
  classifyGatewayCondition,
  normalizeCatalogCondition,
} from "../server/fuzzionFilterEngine.ts";
import type { FuzzionFilterCriteria } from "../shared/fuzzionFilters.ts";

const baseUrl = process.env.FUZZION_V2_TEST_URL || "http://127.0.0.1:5101";
const db = new Database("./data/depurador-bases.sqlite", { readonly: true });
const expectedNeotelHeaders = [
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
type TestResult = {
  case: string;
  ok: boolean;
  detail: string;
  metrics?: JsonRecord;
};

const results: TestResult[] = [];

function record(caseName: string, detail: string, metrics?: JsonRecord) {
  results.push({ case: caseName, ok: true, detail, metrics });
}

function criteria(
  overrides: Partial<FuzzionFilterCriteria> = {},
): FuzzionFilterCriteria {
  return {
    downloadType: "DEPURADO",
    rangeDays: 0,
    catalogConditions: [],
    gatewayConditions: [],
    protectEffectiveContact: true,
    ...overrides,
  };
}

async function uploadCsv(anis: string[], fileName: string) {
  const csv = [
    "LINEA,RAZON SOCIAL,DOCUMENTO",
    ...anis.map((ani, index) => `${ani},PRUEBA ${index + 1},${30000000 + index}`),
  ].join("\n");
  const formData = new FormData();
  formData.append("file", new Blob([csv], { type: "text/csv" }), fileName);
  const response = await fetch(`${baseUrl}/api/fuzzion/preview`, {
    method: "POST",
    body: formData,
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.ok(payload.id);
  return payload as JsonRecord;
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function evaluate(sessionId: string, value: FuzzionFilterCriteria) {
  const { response, payload } = await postJson(
    `/api/fuzzion/${sessionId}/count-v2`,
    { criteria: value },
  );
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload as JsonRecord;
}

async function exportV2(sessionId: string, value: FuzzionFilterCriteria) {
  const response = await fetch(`${baseUrl}/api/fuzzion/${sessionId}/export-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ criteria: value }),
  });
  if (!response.ok) {
    throw new Error(JSON.stringify(await response.json().catch(() => null)));
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  return {
    response,
    dataRows: Math.max(0, rows.length - 1),
    headers: rows[0] ?? [],
  };
}

function findProbeData() {
  const busy = db.prepare(`
    SELECT ani, intentos_busy AS count
    FROM ani_history_summary
    WHERE intentos_busy >= 3
    ORDER BY intentos_busy DESC
    LIMIT 1
  `).get() as { ani: string; count: number };
  const multi = db.prepare(`
    SELECT ani, intentos_busy AS busy, intentos_no_answer AS noAnswer
    FROM ani_history_summary
    WHERE intentos_busy > 0 AND intentos_no_answer > 0
    ORDER BY intentos_busy + intentos_no_answer DESC
    LIMIT 1
  `).get() as { ani: string; busy: number; noAnswer: number };
  const machine = db.prepare(`
    SELECT ani, intentos_answering_machine AS count
    FROM ani_history_summary
    WHERE intentos_answering_machine > 0
      AND intentos_answer_agent = 0
    ORDER BY intentos_answering_machine DESC
    LIMIT 1
  `).get() as { ani: string; count: number };
  const contactCandidates = db.prepare(`
    SELECT ani
    FROM ani_history_summary
    WHERE intentos_answer_agent > 0
    ORDER BY ultimo_registro DESC, ani
    LIMIT 5000
  `).all() as Array<{ ani: string }>;
  const contactAnis = contactCandidates.map((item) => item.ani);
  const placeholders = contactAnis.map(() => "?").join(",");
  const snapshotMax = Number(
    (db.prepare("SELECT COALESCE(MAX(id), 0) AS value FROM call_records").get() as { value: number }).value,
  );
  const asOf = new Date().toISOString();
  let contactRangeDays = 0;
  let contactCutoff = "";
  let recentContact: { ani: string } | undefined;
  let outsideContact: { ani: string } | undefined;
  for (const rangeDays of [7, 30, 60, 90]) {
    const cutoff = new Date(Date.now() - rangeDays * 86400000).toISOString();
    const recentCandidate = db.prepare(`
      SELECT ani
      FROM call_records INDEXED BY idx_call_records_ani
      WHERE ani IN (${placeholders})
        AND id <= ?
        AND fecha >= ?
        AND fecha <= ?
        AND is_contacto_efectivo = 1
      GROUP BY ani
      LIMIT 1
    `).get(...contactAnis, snapshotMax, cutoff, asOf) as { ani: string } | undefined;
    const outsideCandidate = db.prepare(`
      SELECT candidate.ani
      FROM (
        SELECT ani
        FROM ani_history_summary
        WHERE intentos_answer_agent > 0
        ORDER BY ultimo_registro DESC, ani
        LIMIT 5000
      ) AS candidate
      WHERE NOT EXISTS (
        SELECT 1
        FROM call_records INDEXED BY idx_call_records_ani
        WHERE call_records.ani = candidate.ani
          AND call_records.id <= ?
          AND call_records.fecha >= ?
          AND call_records.fecha <= ?
          AND call_records.is_contacto_efectivo = 1
      )
        AND EXISTS (
          SELECT 1
          FROM call_records INDEXED BY idx_call_records_ani
          WHERE call_records.ani = candidate.ani
            AND call_records.id <= ?
            AND call_records.fecha >= ?
            AND call_records.fecha <= ?
        )
      LIMIT 1
    `).get(snapshotMax, cutoff, asOf, snapshotMax, cutoff, asOf) as { ani: string } | undefined;
    if (recentCandidate && outsideCandidate) {
      contactRangeDays = rangeDays;
      contactCutoff = cutoff;
      recentContact = recentCandidate;
      outsideContact = outsideCandidate;
      break;
    }
  }
  assert.ok(recentContact, "No hay un contacto efectivo dentro de los rangos finitos probados.");
  assert.ok(outsideContact, "No hay un contacto historico fuera del mismo rango con actividad reciente.");
  const outsideGatewayRaw = db.prepare(`
    SELECT estado, COALESCE(subestado, '') AS subestado, COUNT(*) AS count
    FROM call_records INDEXED BY idx_call_records_ani
    WHERE ani = ?
      AND id <= ?
      AND fecha >= ?
      AND fecha <= ?
    GROUP BY estado, COALESCE(subestado, '')
    ORDER BY count DESC
    LIMIT 1
  `).get(outsideContact.ani, snapshotMax, contactCutoff, asOf) as {
    estado: string;
    subestado: string;
    count: number;
  };
  const outsideGateway = classifyGatewayCondition(
    outsideGatewayRaw.estado,
    outsideGatewayRaw.subestado,
  );
  assert.ok(outsideGateway);

  const catalogRaw = db.prepare(`
    SELECT ani, resultado, subresultado
    FROM gestion_records
    WHERE TRIM(COALESCE(resultado, '')) <> ''
       OR TRIM(COALESCE(subresultado, '')) <> ''
    ORDER BY id DESC
    LIMIT 1
  `).get() as { ani: string; resultado: string; subresultado: string };
  const catalog = normalizeCatalogCondition(
    catalogRaw.resultado,
    catalogRaw.subresultado,
  );
  assert.ok(catalog);

  return {
    busy,
    multi,
    machine,
    recentContact,
    outsideContact,
    contactRangeDays,
    outsideGateway: { ...outsideGateway, count: outsideGatewayRaw.count },
    catalog: { ani: catalogRaw.ani, ...catalog },
  };
}

async function main() {
  const probes = findProbeData();
  const smallAnis = Array.from(new Set([
    probes.busy.ani,
    probes.multi.ani,
    probes.machine.ani,
    probes.recentContact.ani,
    probes.outsideContact.ani,
    probes.catalog.ani,
    "7000000001",
  ]));
  const preview = await uploadCsv(smallAnis, "fuzzion_v2_controlado.csv");
  const sessionId = String(preview.id);

  const allOptionsResponse = await postJson(
    `/api/fuzzion/${sessionId}/options-v2`,
    { rangeDays: 0 },
  );
  assert.equal(allOptionsResponse.response.status, 200, JSON.stringify(allOptionsResponse.payload));
  assert.equal(allOptionsResponse.payload.rangeDays, 0);
  assert.ok(Array.isArray(allOptionsResponse.payload.catalogOptions));
  assert.ok(Array.isArray(allOptionsResponse.payload.gatewayOptions));
  assert.ok(Array.isArray(allOptionsResponse.payload.matrix));
  for (const option of allOptionsResponse.payload.gatewayOptions) {
    assert.ok(option.key);
    assert.ok(option.label);
    assert.ok(option.occurrences >= option.uniqueAnis);
    assert.equal(option.label.includes("|"), false);
  }
  for (const option of allOptionsResponse.payload.catalogOptions) {
    assert.ok(option.key);
    assert.ok(option.label);
    assert.ok(option.occurrences >= option.uniqueAnis);
  }
  for (const cell of allOptionsResponse.payload.matrix) {
    assert.ok(cell.uniqueAnis >= 1);
    assert.ok(cell.uniqueAnis <= smallAnis.length);
  }
  record(
    "0a. Opciones V2 desde backend",
    `${allOptionsResponse.payload.catalogOptions.length} catalogaciones y ${allOptionsResponse.payload.gatewayOptions.length} Gateway`,
    allOptionsResponse.payload.metrics,
  );

  const rangeOptionsResponse = await postJson(
    `/api/fuzzion/${sessionId}/options-v2`,
    { rangeDays: 7 },
  );
  assert.equal(rangeOptionsResponse.response.status, 200, JSON.stringify(rangeOptionsResponse.payload));
  assert.equal(rangeOptionsResponse.payload.rangeDays, 7);
  record(
    "0b. Opciones V2 por rango",
    `Respuesta recalculada para 7 dias`,
    rangeOptionsResponse.payload.metrics,
  );

  const invalidOptionsResponse = await postJson(
    `/api/fuzzion/${sessionId}/options-v2`,
    { rangeDays: 14 },
  );
  assert.equal(invalidOptionsResponse.response.status, 400);
  record("0c. Rango V2 invalido", "Bloqueado con HTTP 400");

  const multipleCatalogOptions = allOptionsResponse.payload.catalogOptions.slice(0, 2);
  assert.equal(multipleCatalogOptions.length, 2);
  const multipleCatalogResult = await evaluate(sessionId, criteria({
    downloadType: "SEGMENTO",
    catalogConditions: multipleCatalogOptions.map((option: JsonRecord) => ({
      key: option.key,
      label: option.label,
      minimumCount: 1,
    })),
  }));
  assert.equal(multipleCatalogResult.breakdown.length, 2);
  record("0d. Seleccion multiple de catalogaciones", `${multipleCatalogResult.exportableLines} ANI incluidos por OR`);

  const multipleGatewayOptions = allOptionsResponse.payload.gatewayOptions.slice(0, 2);
  assert.equal(multipleGatewayOptions.length, 2);
  const multipleGatewayResult = await evaluate(sessionId, criteria({
    downloadType: "SEGMENTO",
    gatewayConditions: multipleGatewayOptions.map((option: JsonRecord) => ({
      key: option.key,
      label: option.label,
      minimumCount: 1,
    })),
  }));
  assert.equal(multipleGatewayResult.breakdown.length, 2);
  record("0e. Seleccion multiple de Gateway", `${multipleGatewayResult.exportableLines} ANI incluidos por OR`);

  const noConditions = criteria();
  const noConditionResult = await evaluate(sessionId, noConditions);
  assert.equal(noConditionResult.exportableLines, smallAnis.length);
  record(
    "1. Lote depurado sin condiciones",
    `${noConditionResult.exportableLines}/${smallAnis.length} ANI disponibles`,
    noConditionResult.metrics,
  );

  const catalogCondition = {
    key: probes.catalog.key,
    label: probes.catalog.label,
    minimumCount: 1,
  };
  const depuradoCatalog = await evaluate(sessionId, criteria({
    protectEffectiveContact: false,
    catalogConditions: [catalogCondition],
  }));
  assert.ok(depuradoCatalog.totals.excluded >= 1);
  record(
    "2. Lote depurado con una catalogacion",
    `${depuradoCatalog.totals.excluded} ANI excluidos`,
    depuradoCatalog.metrics,
  );

  const busyCondition = {
    key: "BUSY",
    label: "BUSY",
    minimumCount: 3,
  };
  const orResult = await evaluate(sessionId, criteria({
    protectEffectiveContact: false,
    catalogConditions: [catalogCondition],
    gatewayConditions: [busyCondition],
  }));
  assert.ok(orResult.totals.excluded >= depuradoCatalog.totals.excluded);
  record(
    "3. Lote depurado con varios filtros OR",
    `${orResult.totals.excluded} ANI excluidos sin duplicar`,
    orResult.metrics,
  );

  const catalogGroup = await evaluate(sessionId, criteria({
    downloadType: "SEGMENTO",
    catalogConditions: [catalogCondition],
  }));
  assert.ok(catalogGroup.totals.included >= 1);
  record("4. Grupo puntual con catalogacion", `${catalogGroup.totals.included} ANI incluidos`, catalogGroup.metrics);

  const gatewayGroup = await evaluate(sessionId, criteria({
    downloadType: "SEGMENTO",
    gatewayConditions: [busyCondition],
  }));
  assert.ok(gatewayGroup.totals.included >= 1);
  record("5. Grupo puntual con Gateway", `${gatewayGroup.totals.included} ANI incluidos`, gatewayGroup.metrics);

  const mixedGroup = await evaluate(sessionId, criteria({
    downloadType: "SEGMENTO",
    catalogConditions: [catalogCondition],
    gatewayConditions: [busyCondition],
  }));
  assert.ok(mixedGroup.totals.included >= Math.max(catalogGroup.totals.included, gatewayGroup.totals.included));
  record("6. Grupo puntual con catalogacion y Gateway", `${mixedGroup.totals.included} ANI incluidos por OR`, mixedGroup.metrics);

  const emptyGroup = await postJson(`/api/fuzzion/${sessionId}/count-v2`, {
    criteria: criteria({ downloadType: "SEGMENTO" }),
  });
  assert.equal(emptyGroup.response.status, 400);
  record("7. Grupo puntual sin condiciones", "Bloqueado con HTTP 400");

  const answerCondition = { key: "ANSWER", label: "ANSWER", minimumCount: 1 };
  const protectedResult = await evaluate(sessionId, criteria({
    rangeDays: probes.contactRangeDays,
    gatewayConditions: [answerCondition],
    protectEffectiveContact: true,
  }));
  const protectedDecision = protectedResult.preview.find(
    (item: JsonRecord) => item.ani === probes.recentContact.ani,
  );
  assert.equal(protectedDecision?.included, true);
  assert.equal(protectedDecision?.protectedByEffectiveContact, true);
  record("8. Proteccion activada", `El contacto dentro de ${probes.contactRangeDays} dias fue conservado`, protectedResult.metrics);

  const unprotectedResult = await evaluate(sessionId, criteria({
    rangeDays: probes.contactRangeDays,
    gatewayConditions: [answerCondition],
    protectEffectiveContact: false,
  }));
  const unprotectedDecision = unprotectedResult.preview.find(
    (item: JsonRecord) => item.ani === probes.recentContact.ani,
  );
  assert.equal(unprotectedDecision?.included, false);
  record("9. Proteccion desactivada", "El mismo ANI fue excluido", unprotectedResult.metrics);
  record("10. Contacto dentro del rango", `Detectado mediante is_contacto_efectivo dentro de ${probes.contactRangeDays} dias`);

  const outsideResult = await evaluate(sessionId, criteria({
    rangeDays: probes.contactRangeDays,
    gatewayConditions: [{
      key: probes.outsideGateway.key,
      label: probes.outsideGateway.label,
      minimumCount: 1,
    }],
    protectEffectiveContact: true,
  }));
  const outsideDecision = outsideResult.preview.find(
    (item: JsonRecord) => item.ani === probes.outsideContact.ani,
  );
  assert.equal(outsideDecision?.hasEffectiveContact, false);
  assert.equal(outsideDecision?.included, false);
  record("11. Contacto fuera del rango", `No activo la proteccion de los ultimos ${probes.contactRangeDays} dias`, outsideResult.metrics);

  const reachesMinimum = await evaluate(sessionId, criteria({
    protectEffectiveContact: false,
    gatewayConditions: [{
      key: "BUSY",
      label: "BUSY",
      minimumCount: probes.busy.count,
    }],
  }));
  const reachesDecision = reachesMinimum.preview.find(
    (item: JsonRecord) => item.ani === probes.busy.ani,
  );
  assert.equal(reachesDecision?.included, false);
  record("12. Condicion que alcanza el minimo", `BUSY ${probes.busy.count}/${probes.busy.count}`, reachesMinimum.metrics);

  const missesMinimum = await evaluate(sessionId, criteria({
    protectEffectiveContact: false,
    gatewayConditions: [{
      key: "BUSY",
      label: "BUSY",
      minimumCount: probes.busy.count + 1,
    }],
  }));
  const missesDecision = missesMinimum.preview.find(
    (item: JsonRecord) => item.ani === probes.busy.ani,
  );
  assert.equal(missesDecision?.included, true);
  record("13. Condicion que no alcanza el minimo", `BUSY ${probes.busy.count}/${probes.busy.count + 1}`, missesMinimum.metrics);

  const multipleCriteria = criteria({
    downloadType: "SEGMENTO",
    gatewayConditions: [
      { key: "BUSY", label: "BUSY", minimumCount: 1 },
      { key: "NOANSWER", label: "NOANSWER", minimumCount: 1 },
    ],
  });
  const multipleResult = await evaluate(sessionId, multipleCriteria);
  const multipleDecision = multipleResult.preview.find(
    (item: JsonRecord) => item.ani === probes.multi.ani,
  );
  assert.ok((multipleDecision?.reasons.length ?? 0) >= 2);
  const multipleExport = await exportV2(sessionId, multipleCriteria);
  assert.equal(
    Number(multipleExport.response.headers.get("X-Exported-Count")),
    multipleResult.exportableLines,
  );
  assert.equal(multipleExport.dataRows, multipleResult.exportableLines);
  record("14. ANI con varias condiciones", "Varios motivos y una sola fila exportada", {
    historyQueryMs: Number(multipleExport.response.headers.get("X-History-Query-Ms")),
    evaluationMs: Number(multipleExport.response.headers.get("X-Evaluation-Ms")),
    fileCreationMs: Number(multipleExport.response.headers.get("X-File-Creation-Ms")),
    totalMs: Number(multipleExport.response.headers.get("X-Total-Ms")),
  });

  const machineCriteria = criteria({
    downloadType: "SEGMENTO",
    gatewayConditions: [
      { key: "ANSWERING MACHINE", label: "ANSWERING MACHINE", minimumCount: 1 },
      { key: "ANSWER", label: "ANSWER", minimumCount: 1 },
    ],
  });
  const machineResult = await evaluate(sessionId, machineCriteria);
  const machineDecision = machineResult.preview.find(
    (item: JsonRecord) => item.ani === probes.machine.ani,
  );
  assert.equal(machineDecision?.reasons.some((item: JsonRecord) => item.key === "ANSWERINGMACHINE"), true);
  assert.equal(machineDecision?.reasons.some((item: JsonRecord) => item.key === "ANSWER"), false);
  record("15. ANSWERING MACHINE exclusivo", "No se duplico como ANSWER", machineResult.metrics);

  const statsResponse = await postJson(`/api/fuzzion/${sessionId}/stats-v2`, {
    criteria: noConditions,
  });
  assert.equal(statsResponse.response.status, 200);
  assert.equal(statsResponse.payload.exportableLines, noConditionResult.exportableLines);

  const smallExport = await exportV2(sessionId, noConditions);
  assert.equal(smallExport.response.headers.get("X-Export-Format"), "xls");
  assert.equal(smallExport.dataRows, noConditionResult.exportableLines);
  assert.deepEqual(smallExport.headers, expectedNeotelHeaders);
  record("16. Archivo .xls", `${smallExport.dataRows} filas de datos`, {
    historyQueryMs: Number(smallExport.response.headers.get("X-History-Query-Ms")),
    evaluationMs: Number(smallExport.response.headers.get("X-Evaluation-Ms")),
    fileCreationMs: Number(smallExport.response.headers.get("X-File-Creation-Ms")),
    totalMs: Number(smallExport.response.headers.get("X-Total-Ms")),
  });

  const oldRequest = {
    categories: [],
    search: "",
    filterMode: "RECOMENDACION",
    filterValues: [],
    rangeDays: 0,
    exportMode: "DEPURADO",
    rules: {
      unallocatedDescartar: 3,
      rejectedDescartar: 3,
      busyDescartar: 3,
      pausaVentanaDias: 5,
      noAnswerPausa: 5,
      answeringMachinePausa: 5,
    },
  };
  const oldCountResponse = await postJson(`/api/fuzzion/${sessionId}/count`, oldRequest);
  assert.equal(oldCountResponse.response.status, 200);
  const oldStatsResponse = await postJson(`/api/fuzzion/${sessionId}/stats`, {
    rules: oldRequest.rules,
  });
  assert.equal(oldStatsResponse.response.status, 200);
  const oldExportResponse = await fetch(`${baseUrl}/api/fuzzion/${sessionId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(oldRequest),
  });
  assert.equal(oldExportResponse.status, 200);
  assert.equal(
    Number(oldExportResponse.headers.get("X-Exported-Count")),
    oldCountResponse.payload.exportableLines,
  );
  record(
    "16b. Endpoints productivos anteriores",
    "Los contratos /count, /stats y /export continuan operativos",
  );

  const largeAnis = Array.from(
    { length: 65_536 },
    (_, index) => String(7_100_000_000 + index),
  );
  const largePreview = await uploadCsv(largeAnis, "fuzzion_v2_xlsx_controlado.csv");
  const largeCount = await evaluate(String(largePreview.id), noConditions);
  const largeExport = await exportV2(String(largePreview.id), noConditions);
  assert.equal(largeExport.response.headers.get("X-Export-Format"), "xlsx");
  assert.equal(largeExport.dataRows, 65_536);
  assert.deepEqual(largeExport.headers, expectedNeotelHeaders);
  record("17. Archivo .xlsx", `${largeExport.dataRows} filas de datos`, {
    historyQueryMs: Number(largeExport.response.headers.get("X-History-Query-Ms")),
    evaluationMs: Number(largeExport.response.headers.get("X-Evaluation-Ms")),
    fileCreationMs: Number(largeExport.response.headers.get("X-File-Creation-Ms")),
    totalMs: Number(largeExport.response.headers.get("X-Total-Ms")),
  });

  assert.equal(largeCount.exportableLines, Number(largeExport.response.headers.get("X-Exported-Count")));
  assert.equal(largeCount.exportableLines, largeExport.dataRows);
  record("18. Consistencia V2", `simulacion=${largeCount.exportableLines}, cabecera=${largeExport.response.headers.get("X-Exported-Count")}, filas=${largeExport.dataRows}`);

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    controlledLot: {
      uniqueAnis: smallAnis.length,
      currentEngineExportable: oldCountResponse.payload.exportableLines,
      v2WithoutConditionsExportable: noConditionResult.exportableLines,
      differenceClassification:
        oldCountResponse.payload.exportableLines === noConditionResult.exportableLines
          ? "SIN_DIFERENCIA"
          : "ESPERADA_REGLAS_FUNCIONALES_DISTINTAS",
    },
    results,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      results,
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(() => db.close());
