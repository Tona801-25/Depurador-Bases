import assert from "node:assert/strict";
import test from "node:test";

import type {
  FuzzionAniEvidence,
  FuzzionFilterCriteria,
} from "../shared/fuzzionFilters.ts";
import {
  buildFuzzionConditionMatrix,
  buildFuzzionEvidenceByAni,
  classifyGatewayCondition,
  evaluateFuzzionLot,
  FuzzionFilterValidationError,
  normalizeCatalogCondition,
} from "./fuzzionFilterEngine.ts";

const DEBT_KEY = "NO COMPRA|TIENE DEUDA";

function makeEvidence(
  ani: string,
  options: {
    catalogs?: Record<string, number>;
    gateways?: Record<string, number>;
    contact?: boolean;
  } = {},
): FuzzionAniEvidence {
  return {
    ani,
    catalogs: Object.fromEntries(
      Object.entries(options.catalogs ?? {}).map(([key, count]) => [
        key,
        { key, label: key.replace("|", " - "), count },
      ]),
    ),
    gateways: Object.fromEntries(
      Object.entries(options.gateways ?? {}).map(([key, count]) => [
        key,
        { key, label: key, count },
      ]),
    ),
    hasEffectiveContact: options.contact ?? false,
  };
}

function criteria(
  overrides: Partial<FuzzionFilterCriteria> = {},
): FuzzionFilterCriteria {
  return {
    downloadType: "DEPURADO",
    rangeDays: 7,
    catalogConditions: [],
    gatewayConditions: [],
    protectEffectiveContact: true,
    ...overrides,
  };
}

test("ANSWERING MACHINE se clasifica una sola vez y no como ANSWER", () => {
  assert.deepEqual(
    classifyGatewayCondition("ANSWER", "Answer Machine"),
    { key: "ANSWERINGMACHINE", label: "ANSWERING MACHINE" },
  );
  assert.deepEqual(
    classifyGatewayCondition("ANSWER", "AGENT"),
    { key: "ANSWER", label: "ANSWER" },
  );
});

test("Gateway conserva las semanticas especiales normalizadas", () => {
  assert.equal(
    classifyGatewayCondition("ANSWER", "Buzon de voz")?.key,
    "ANSWERINGMACHINE",
  );
  assert.equal(
    classifyGatewayCondition("ANSWER", "Voicemail")?.key,
    "ANSWERINGMACHINE",
  );
  assert.equal(
    classifyGatewayCondition("UNKNOWN", "unallocated")?.key,
    "UNALLOCATED",
  );
  assert.equal(
    classifyGatewayCondition("UNKNOWN", "rejected")?.key,
    "REJECTED",
  );
  assert.equal(classifyGatewayCondition("No Answer", "")?.key, "NOANSWER");
});

test("los criterios Gateway con espacios usan la misma clave semantica", () => {
  const ani = "1010101011";
  const result = evaluateFuzzionLot(
    [ani],
    new Map([[ani, makeEvidence(ani, {
      gateways: { ANSWERINGMACHINE: 2 },
    })]]),
    criteria({
      downloadType: "SEGMENTO",
      gatewayConditions: [{
        key: "Answering Machine",
        label: "ANSWERING MACHINE",
        minimumCount: 1,
      }],
    }),
  );

  assert.deepEqual(result.includedAnis, [ani]);
  assert.equal(result.criteria.gatewayConditions[0].key, "ANSWERINGMACHINE");
});

test("catalogaciones equivalentes se normalizan con una clave unica", () => {
  assert.equal(
    normalizeCatalogCondition(" No   compra ", "Tiene deuda")?.key,
    DEBT_KEY,
  );
  assert.equal(
    normalizeCatalogCondition("NO COMPRA", "TIENE DEUDA")?.key,
    DEBT_KEY,
  );
});

test("la evidencia agrega repeticiones normalizadas por ANI", () => {
  const evidence = buildFuzzionEvidenceByAni(
    ["1111111111"],
    [
      {
        ani: "1111111111",
        estado: "ANSWER",
        subestado: "MACHINE",
        count: 2,
      },
      {
        ani: "1111111111",
        estado: "answer",
        subestado: "Buzon",
        count: 1,
      },
      {
        ani: "1111111111",
        estado: "ANSWER",
        subestado: "AGENT",
        count: 1,
      },
    ],
    [
      {
        ani: "1111111111",
        resultado: "No compra",
        subresultado: "Tiene deuda",
        count: 2,
      },
      {
        ani: "1111111111",
        resultado: " NO   COMPRA ",
        subresultado: "TIENE DEUDA",
        count: 2,
      },
    ],
    ["1111111111"],
  ).get("1111111111");

  assert.ok(evidence);
  assert.equal(evidence.gateways.ANSWERINGMACHINE.count, 3);
  assert.equal(evidence.gateways.ANSWER.count, 1);
  assert.equal(evidence.catalogs[DEBT_KEY].count, 4);
  assert.equal(evidence.hasEffectiveContact, true);
});

test("caso 1: excluye por cantidad comercial aunque existan otras catalogaciones", () => {
  const ani = "1111111111";
  const evidence = new Map([
    [ani, makeEvidence(ani, {
      catalogs: {
        [DEBT_KEY]: 4,
        "RE-LLAMADO|": 2,
      },
    })],
  ]);
  const result = evaluateFuzzionLot(
    [ani],
    evidence,
    criteria({
      protectEffectiveContact: false,
      catalogConditions: [{
        key: DEBT_KEY,
        label: "No compra - Tiene deuda",
        minimumCount: 3,
      }],
    }),
  );

  assert.deepEqual(result.excludedAnis, [ani]);
  assert.equal(result.decisions[0].reasons[0].foundCount, 4);
});

test("caso 2: conserva cuando UNALLOCATED no alcanza el minimo", () => {
  const ani = "2222222222";
  const result = evaluateFuzzionLot(
    [ani],
    new Map([[ani, makeEvidence(ani, {
      gateways: { UNALLOCATED: 2 },
    })]]),
    criteria({
      gatewayConditions: [{
        key: "UNALLOCATED",
        label: "UNALLOCATED",
        minimumCount: 3,
      }],
    }),
  );

  assert.deepEqual(result.includedAnis, [ani]);
});

test("caso 3: aplica OR entre catalogaciones y Gateway", () => {
  const ani = "3333333333";
  const result = evaluateFuzzionLot(
    [ani],
    new Map([[ani, makeEvidence(ani, {
      catalogs: { [DEBT_KEY]: 0 },
      gateways: { UNALLOCATED: 3 },
    })]]),
    criteria({
      protectEffectiveContact: false,
      catalogConditions: [{
        key: DEBT_KEY,
        label: "Tiene deuda",
        minimumCount: 3,
      }],
      gatewayConditions: [{
        key: "UNALLOCATED",
        label: "UNALLOCATED",
        minimumCount: 2,
      }],
    }),
  );

  assert.deepEqual(result.excludedAnis, [ani]);
  assert.equal(result.decisions[0].reasons.length, 1);
  assert.equal(result.decisions[0].reasons[0].key, "UNALLOCATED");
});

test("casos 4 y 5: la proteccion conserva el contacto y puede desactivarse", () => {
  const ani = "4444444444";
  const evidence = new Map([[ani, makeEvidence(ani, {
    catalogs: { [DEBT_KEY]: 4 },
    contact: true,
  })]]);
  const selectedCatalog = [{
    key: DEBT_KEY,
    label: "Tiene deuda",
    minimumCount: 3,
  }];

  const protectedResult = evaluateFuzzionLot(
    [ani],
    evidence,
    criteria({ catalogConditions: selectedCatalog }),
  );
  const unprotectedResult = evaluateFuzzionLot(
    [ani],
    evidence,
    criteria({
      catalogConditions: selectedCatalog,
      protectEffectiveContact: false,
    }),
  );

  assert.deepEqual(protectedResult.includedAnis, [ani]);
  assert.equal(protectedResult.totals.protectedByEffectiveContact, 1);
  assert.deepEqual(unprotectedResult.excludedAnis, [ani]);
});

test("caso 6: lote depurado sin condiciones conserva todos los ANI unicos", () => {
  const result = evaluateFuzzionLot(
    ["5555555555", "5555555555", "6666666666"],
    new Map(),
    criteria(),
  );

  assert.deepEqual(result.includedAnis, ["5555555555", "6666666666"]);
  assert.equal(result.totals.excluded, 0);
});

test("casos 7 y 8: grupo puntual incluye coincidencias con o sin contacto", () => {
  const withContact = "7777777777";
  const withoutContact = "8888888888";
  const evidence = new Map([
    [withContact, makeEvidence(withContact, {
      catalogs: { [DEBT_KEY]: 4 },
      contact: true,
    })],
    [withoutContact, makeEvidence(withoutContact, {
      catalogs: { [DEBT_KEY]: 4 },
      contact: false,
    })],
  ]);
  const result = evaluateFuzzionLot(
    [withContact, withoutContact],
    evidence,
    criteria({
      downloadType: "SEGMENTO",
      protectEffectiveContact: true,
      catalogConditions: [{
        key: DEBT_KEY,
        label: "Tiene deuda",
        minimumCount: 3,
      }],
    }),
  );

  assert.deepEqual(result.includedAnis, [withContact, withoutContact]);
  assert.equal(result.criteria.protectEffectiveContact, false);
});

test("caso 9: grupo puntual sin condiciones queda bloqueado", () => {
  assert.throws(
    () => evaluateFuzzionLot(
      ["9999999999"],
      new Map(),
      criteria({ downloadType: "SEGMENTO" }),
    ),
    FuzzionFilterValidationError,
  );
});

test("caso 10: el motor usa solamente la cantidad entregada para el rango", () => {
  const ani = "1010101010";
  const result = evaluateFuzzionLot(
    [ani],
    new Map([[ani, makeEvidence(ani, {
      gateways: { UNALLOCATED: 2 },
    })]]),
    criteria({
      rangeDays: 7,
      gatewayConditions: [{
        key: "UNALLOCATED",
        label: "UNALLOCATED",
        minimumCount: 3,
      }],
    }),
  );

  assert.deepEqual(result.includedAnis, [ani]);
});

test("rechaza cantidades minimas que no sean enteros positivos", () => {
  for (const minimumCount of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => evaluateFuzzionLot(
        ["1111111111"],
        new Map(),
        criteria({
          gatewayConditions: [{
            key: "BUSY",
            label: "BUSY",
            minimumCount,
          }],
        }),
      ),
      FuzzionFilterValidationError,
    );
  }
});

test("la matriz cruza conjuntos y cuenta cada ANI una vez por celda", () => {
  const firstAni = "1212121212";
  const secondAni = "1313131313";
  const evidence = new Map([
    [firstAni, makeEvidence(firstAni, {
      catalogs: {
        [DEBT_KEY]: 4,
        "RE-LLAMADO|": 2,
      },
      gateways: {
        NOANSWER: 5,
        BUSY: 2,
      },
    })],
    [secondAni, makeEvidence(secondAni, {
      catalogs: { [DEBT_KEY]: 1 },
      gateways: { NOANSWER: 3 },
    })],
  ]);
  const matrix = buildFuzzionConditionMatrix(evidence);

  assert.equal(matrix.length, 4);
  assert.equal(
    matrix.find(
      (cell) =>
        cell.catalogKey === DEBT_KEY &&
        cell.gatewayKey === "NOANSWER",
    )?.uniqueAnis,
    2,
  );
  assert.equal(
    matrix.find(
      (cell) =>
        cell.catalogKey === "RE-LLAMADO|" &&
        cell.gatewayKey === "BUSY",
    )?.uniqueAnis,
    1,
  );
});
