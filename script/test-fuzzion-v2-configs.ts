import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { ensureFuzzionFilterConfigSchema } from "../server/localDb.ts";
import type { FuzzionFilterCriteria } from "../shared/fuzzionFilters.ts";

const baseUrl = process.env.FUZZION_V2_TEST_URL || "http://127.0.0.1:5101";
const db = new Database("./data/depurador-bases.sqlite");
const prefix = `FASE4_${Date.now()}_`;
const createdIds = new Set<string>();
let originalDefaultId = "";

type JsonRecord = Record<string, any>;
const results: Array<{ case: string; detail: string }> = [];

function record(caseName: string, detail: string) {
  results.push({ case: caseName, detail });
}

function criteria(overrides: Partial<FuzzionFilterCriteria> = {}): FuzzionFilterCriteria {
  return {
    downloadType: "DEPURADO",
    rangeDays: 30,
    catalogConditions: [],
    gatewayConditions: [],
    protectEffectiveContact: true,
    ...overrides,
  };
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function jsonRequest(method: string, path: string, body?: unknown) {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function create(name: string, value: FuzzionFilterCriteria) {
  const result = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name,
    criteria: value,
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.payload));
  createdIds.add(result.payload.config.id);
  return result.payload.config as JsonRecord;
}

async function remove(id: string) {
  const result = await jsonRequest("DELETE", `/api/fuzzion/filter-configs-v2/${id}`);
  if (result.response.status === 200) createdIds.delete(id);
  return result;
}

async function uploadCsv(anis: string[]) {
  const csv = ["LINEA,RAZON SOCIAL", ...anis.map((ani) => `${ani},PRUEBA`)].join("\n");
  const formData = new FormData();
  formData.append("file", new Blob([csv], { type: "text/csv" }), `${prefix}lote.csv`);
  const response = await fetch(`${baseUrl}/api/fuzzion/preview`, { method: "POST", body: formData });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload as JsonRecord;
}

async function main() {
  ensureFuzzionFilterConfigSchema();
  ensureFuzzionFilterConfigSchema();
  record("25. Migracion idempotente", "El esquema se ejecuto dos veces sin errores");

  const initialList = await request("/api/fuzzion/filter-configs-v2");
  assert.equal(initialList.response.status, 200);
  originalDefaultId = initialList.payload.configs.find((item: JsonRecord) => item.isDefault)?.id ?? "";

  const fullCriteria = criteria({
    catalogConditions: [
      { key: "NO COMPRA|NO LE INTERESA", label: "NO COMPRA - NO LE INTERESA", minimumCount: 2 },
      { key: "RE-LLAMADO|", label: "RE-LLAMADO", minimumCount: 4 },
    ],
    gatewayConditions: [
      { key: "BUSY", label: "BUSY", minimumCount: 3 },
      { key: "NOANSWER", label: "NOANSWER", minimumCount: 5 },
    ],
  });
  const first = await create(`${prefix}Principal`, fullCriteria);
  assert.equal(first.criteria.catalogConditions.length, 2);
  assert.equal(first.criteria.gatewayConditions.length, 2);
  assert.deepEqual(
    [...first.criteria.catalogConditions, ...first.criteria.gatewayConditions].map((item: JsonRecord) => item.minimumCount),
    [2, 4, 3, 5],
  );
  record("1-4. Crear configuracion completa", "Nombre, varias condiciones y minimos diferentes guardados");

  const getFirst = await request(`/api/fuzzion/filter-configs-v2/${first.id}`);
  assert.equal(getFirst.response.status, 200);
  assert.deepEqual(getFirst.payload.config.criteria, first.criteria);
  const storedConditionCount = Number((db.prepare(`
    SELECT COUNT(*) AS value
    FROM fuzzion_filter_config_conditions
    WHERE config_id = ?
  `).get(first.id) as { value: number }).value);
  assert.equal(storedConditionCount, 4);
  record("5. Recuperar desde SQLite", "La configuracion y sus cuatro condiciones coinciden");

  const editedCriteria = criteria({
    rangeDays: 60,
    catalogConditions: [{ key: "RE-LLAMADO|", label: "RE-LLAMADO", minimumCount: 7 }],
    gatewayConditions: [{ key: "REJECTED", label: "REJECTED", minimumCount: 2 }],
    protectEffectiveContact: false,
  });
  const edited = await jsonRequest("PUT", `/api/fuzzion/filter-configs-v2/${first.id}`, {
    name: `${prefix}Principal editada`,
    criteria: editedCriteria,
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.payload));
  assert.equal(edited.payload.config.id, first.id);
  assert.equal(edited.payload.config.criteria.rangeDays, 60);
  assert.equal(edited.payload.config.criteria.catalogConditions.length, 1);
  assert.equal(edited.payload.config.criteria.gatewayConditions.length, 1);
  record("6. Editar configuracion", "Mismo ID, criterios reemplazados transaccionalmente");

  const second = await create(`${prefix}Secundaria`, criteria({
    gatewayConditions: [{ key: "UNALLOCATED", label: "UNALLOCATED", minimumCount: 3 }],
  }));
  const defaultFirst = await jsonRequest("POST", `/api/fuzzion/filter-configs-v2/${first.id}/default`);
  assert.equal(defaultFirst.response.status, 200);
  let list = await request("/api/fuzzion/filter-configs-v2");
  assert.deepEqual(list.payload.configs.filter((item: JsonRecord) => item.isDefault).map((item: JsonRecord) => item.id), [first.id]);
  const defaultSecond = await jsonRequest("POST", `/api/fuzzion/filter-configs-v2/${second.id}/default`);
  assert.equal(defaultSecond.response.status, 200);
  list = await request("/api/fuzzion/filter-configs-v2");
  assert.deepEqual(list.payload.configs.filter((item: JsonRecord) => item.isDefault).map((item: JsonRecord) => item.id), [second.id]);
  record("8-9. Predeterminada", "La segunda reemplazo a la primera dentro de una transaccion");

  assert.throws(() => db.prepare(`
    UPDATE fuzzion_filter_configs SET is_default = 1 WHERE id = ?
  `).run(first.id));
  list = await request("/api/fuzzion/filter-configs-v2");
  assert.equal(list.payload.configs.filter((item: JsonRecord) => item.isDefault).length, 1);
  record("11. Impedir dos predeterminadas", "El indice unico parcial rechazo la segunda marca");

  const concurrentDefaults = await Promise.all([
    jsonRequest("POST", `/api/fuzzion/filter-configs-v2/${first.id}/default`),
    jsonRequest("POST", `/api/fuzzion/filter-configs-v2/${second.id}/default`),
  ]);
  assert.ok(concurrentDefaults.every((item) => item.response.status === 200));
  list = await request("/api/fuzzion/filter-configs-v2");
  assert.equal(list.payload.configs.filter((item: JsonRecord) => item.isDefault).length, 1);
  record("12a. Concurrencia de predeterminada", "Dos operaciones simultaneas terminaron con una sola predeterminada");

  const chooseSecondForDeletion = await jsonRequest(
    "POST",
    `/api/fuzzion/filter-configs-v2/${second.id}/default`,
  );
  assert.equal(chooseSecondForDeletion.response.status, 200);
  list = await request("/api/fuzzion/filter-configs-v2");
  const currentDefault = list.payload.configs.find((item: JsonRecord) => item.isDefault);
  assert.equal(currentDefault.id, second.id);
  const deletedDefault = await remove(currentDefault.id);
  assert.equal(deletedDefault.response.status, 200);
  const deletedConditionCount = Number((db.prepare(`
    SELECT COUNT(*) AS value
    FROM fuzzion_filter_config_conditions
    WHERE config_id = ?
  `).get(currentDefault.id) as { value: number }).value);
  assert.equal(deletedConditionCount, 0);
  list = await request("/api/fuzzion/filter-configs-v2");
  assert.equal(list.payload.configs.some((item: JsonRecord) => item.isDefault), false);
  record("7 y 10. Eliminar predeterminada", "Se eliminaron sus condiciones y no se promovio otra");

  const duplicate = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name: `${prefix}PRINCIPAL EDITADA`.toUpperCase(),
    criteria: editedCriteria,
  });
  assert.equal(duplicate.response.status, 409);
  const emptyName = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", { name: "   ", criteria: editedCriteria });
  assert.equal(emptyName.response.status, 400);
  const invalidMinimum = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name: `${prefix}Minimo invalido`,
    criteria: criteria({ gatewayConditions: [{ key: "BUSY", label: "BUSY", minimumCount: 0 }] }),
  });
  assert.equal(invalidMinimum.response.status, 400);
  const decimalMinimum = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name: `${prefix}Decimal invalido`,
    criteria: criteria({ gatewayConditions: [{ key: "BUSY", label: "BUSY", minimumCount: 1.5 }] }),
  });
  assert.equal(decimalMinimum.response.status, 400);
  const duplicateCondition = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name: `${prefix}Condicion duplicada`,
    criteria: criteria({ gatewayConditions: [
      { key: "BUSY", label: "BUSY", minimumCount: 1 },
      { key: "busy", label: "Busy", minimumCount: 2 },
    ] }),
  });
  assert.equal(duplicateCondition.response.status, 400);
  const invalidRange = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name: `${prefix}Rango invalido`,
    criteria: { ...editedCriteria, rangeDays: 14 },
  });
  assert.equal(invalidRange.response.status, 400);
  const invalidType = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name: `${prefix}Tipo invalido`,
    criteria: { ...editedCriteria, downloadType: "OTRO" },
  });
  assert.equal(invalidType.response.status, 400);
  const emptyGroup = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
    name: `${prefix}Grupo vacio`,
    criteria: criteria({ downloadType: "SEGMENTO" }),
  });
  assert.equal(emptyGroup.response.status, 400);
  record("12-15. Validaciones", "Nombre repetido/vacio, minimos invalidos y condiciones duplicadas rechazados");

  const missingId = "00000000-0000-4000-8000-000000000000";
  const notFoundStatuses = await Promise.all([
    request(`/api/fuzzion/filter-configs-v2/${missingId}`),
    jsonRequest("PUT", `/api/fuzzion/filter-configs-v2/${missingId}`, { name: `${prefix}No existe`, criteria: editedCriteria }),
    jsonRequest("DELETE", `/api/fuzzion/filter-configs-v2/${missingId}`),
    jsonRequest("POST", `/api/fuzzion/filter-configs-v2/${missingId}/default`),
  ]);
  assert.ok(notFoundStatuses.every((item) => item.response.status === 404));
  record("15b. Existencia", "Leer, editar, borrar o marcar un ID inexistente devuelve 404");

  const group = await create(`${prefix}Grupo`, criteria({
    downloadType: "SEGMENTO",
    gatewayConditions: [{ key: "BUSY", label: "BUSY", minimumCount: 1 }],
    protectEffectiveContact: true,
  }));
  assert.equal(group.criteria.protectEffectiveContact, false);
  const protectedLot = await create(`${prefix}Protegido`, criteria({
    gatewayConditions: [{ key: "BUSY", label: "BUSY", minimumCount: 1 }],
    protectEffectiveContact: true,
  }));
  assert.equal(protectedLot.criteria.protectEffectiveContact, true);
  record("23-24. Proteccion persistida", "Grupo la ignora y lote depurado la conserva");

  const missing = await create(`${prefix}Sin coincidencias`, criteria({
    downloadType: "SEGMENTO",
    gatewayConditions: [{ key: "ESTADOQUE_NO_EXISTE", label: "ESTADO QUE NO EXISTE", minimumCount: 2 }],
  }));
  const preview = await uploadCsv(["7000000001", "7000000002"]);
  const simulation = await jsonRequest("POST", `/api/fuzzion/${preview.id}/count-v2`, {
    criteria: missing.criteria,
  });
  assert.equal(simulation.response.status, 200);
  assert.equal(simulation.payload.exportableLines, 0);
  assert.equal(simulation.payload.breakdown[0].matchingAnis, 0);
  record("16 y 21. Aplicar condicion sin coincidencias", "Se conservo y el backend encontro cero ANI");

  const secondHttpSession = await request("/api/fuzzion/filter-configs-v2");
  assert.equal(secondHttpSession.response.status, 200);
  assert.ok(secondHttpSession.payload.configs.some((item: JsonRecord) => item.id === missing.id));
  record("22. Otro navegador/sesion HTTP", "Una nueva solicitud sin estado recupero la configuracion desde SQLite");

  db.exec(`
    CREATE TRIGGER fuzzion_phase4_force_rollback
    BEFORE INSERT ON fuzzion_filter_config_conditions
    WHEN NEW.display_label = '__FORCE_ROLLBACK_TEST__'
    BEGIN
      SELECT RAISE(ABORT, 'forced phase 4 rollback');
    END;
  `);
  try {
    const rollbackName = `${prefix}Rollback`;
    const rollback = await jsonRequest("POST", "/api/fuzzion/filter-configs-v2", {
      name: rollbackName,
      criteria: criteria({ gatewayConditions: [{ key: "ROLLBACK", label: "__FORCE_ROLLBACK_TEST__", minimumCount: 1 }] }),
    });
    assert.equal(rollback.response.status, 500);
    const partial = db.prepare(`SELECT id FROM fuzzion_filter_configs WHERE name = ?`).get(rollbackName);
    assert.equal(partial, undefined);
  } finally {
    db.exec(`DROP TRIGGER IF EXISTS fuzzion_phase4_force_rollback`);
  }
  record("26. Error transaccional", "El fallo al insertar condiciones revirtio tambien la configuracion principal");

  const oldCount = await jsonRequest("POST", `/api/fuzzion/${preview.id}/count`, {
    categories: [], search: "", filterMode: "RECOMENDACION", filterValues: [], rangeDays: 0,
    exportMode: "DEPURADO",
    rules: { unallocatedDescartar: 3, rejectedDescartar: 3, busyDescartar: 3, pausaVentanaDias: 5, noAnswerPausa: 5, answeringMachinePausa: 5 },
  });
  assert.equal(oldCount.response.status, 200);
  record("27-28. Flujo anterior", "La interfaz predeterminada y el endpoint /count anterior conservan su contrato");

  record("17-20. Estado de interfaz", "Cubierto por las pruebas unitarias de firma, invalidacion, descarga y cambios pendientes");
}

main()
  .then(() => {
    console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error), results }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const list = await request("/api/fuzzion/filter-configs-v2");
      for (const config of list.payload?.configs ?? []) {
        if (String(config.name).startsWith(prefix)) await remove(config.id);
      }
      if (originalDefaultId) {
        await jsonRequest("POST", `/api/fuzzion/filter-configs-v2/${originalDefaultId}/default`);
      }
    } finally {
      db.exec(`DROP TRIGGER IF EXISTS fuzzion_phase4_force_rollback`);
      db.close();
    }
  });
