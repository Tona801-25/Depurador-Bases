import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FuzzionFilterCriteria } from "../shared/fuzzionFilters.ts";
import {
  canSimulateFuzzionCriteria,
  fuzzionConfigSwitchAction,
  fuzzionCriteriaSignature,
  hasUnsavedFuzzionConfigChanges,
  isCurrentFuzzionResponse,
  matchesFuzzionPreviewSearch,
  parsePositiveIntegerInput,
  resolveFuzzionDevelopmentUi,
} from "../shared/fuzzionV2Ui.ts";

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

describe("estado de interfaz Fuzzion V2", () => {
  it("usa V2 por defecto en desarrollo y conserva el rollback legacy explicito", () => {
    assert.equal(resolveFuzzionDevelopmentUi(""), "v2");
    assert.equal(resolveFuzzionDevelopmentUi("?otro=valor"), "v2");
    assert.equal(resolveFuzzionDevelopmentUi("?fuzzion-ui=v2"), "v2");
    assert.equal(resolveFuzzionDevelopmentUi("?fuzzion-ui=legacy"), "legacy");
  });

  it("acepta solamente enteros iguales o mayores que uno", () => {
    assert.equal(parsePositiveIntegerInput("1"), 1);
    assert.equal(parsePositiveIntegerInput("23"), 23);
    for (const invalid of ["0", "-1", "1.5", "texto", "", " 2"]) {
      assert.equal(parsePositiveIntegerInput(invalid), null);
    }
  });

  it("bloquea grupo puntual vacio y permite depurado vacio", () => {
    assert.equal(canSimulateFuzzionCriteria(criteria()), true);
    assert.equal(canSimulateFuzzionCriteria(criteria({ downloadType: "SEGMENTO" })), false);
    assert.equal(canSimulateFuzzionCriteria(criteria({
      downloadType: "SEGMENTO",
      gatewayConditions: [{ key: "BUSY", label: "BUSY", minimumCount: 1 }],
    })), true);
  });

  it("genera una firma estable aunque cambie el orden visual", () => {
    const first = criteria({ gatewayConditions: [
      { key: "BUSY", label: "BUSY", minimumCount: 2 },
      { key: "NOANSWER", label: "NOANSWER", minimumCount: 1 },
    ] });
    const second = criteria({ gatewayConditions: [...first.gatewayConditions].reverse() });
    assert.equal(fuzzionCriteriaSignature(first), fuzzionCriteriaSignature(second));
  });

  it("ignora respuestas anteriores o de otros criterios", () => {
    assert.equal(isCurrentFuzzionResponse(4, 5, "A", "A"), false);
    assert.equal(isCurrentFuzzionResponse(5, 5, "A", "B"), false);
    assert.equal(isCurrentFuzzionResponse(5, 5, "A", "A"), true);
  });

  it("el buscador filtra solamente los valores de la vista previa", () => {
    assert.equal(matchesFuzzionPreviewSearch(["112233", "Empresa Sur"], "sur"), true);
    assert.equal(matchesFuzzionPreviewSearch(["112233", "Empresa Sur"], "norte"), false);
  });

  it("detecta cambios sin guardar en nombre o criterios", () => {
    const loaded = {
      id: "config-1",
      name: "Configuracion diaria",
      criteria: criteria(),
      isDefault: false,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    };
    assert.equal(hasUnsavedFuzzionConfigChanges(loaded, loaded.name, loaded.criteria), false);
    assert.equal(hasUnsavedFuzzionConfigChanges(loaded, "Otro nombre", loaded.criteria), true);
    assert.equal(hasUnsavedFuzzionConfigChanges(
      loaded,
      loaded.name,
      criteria({ rangeDays: 7 }),
    ), true);
  });

  it("exige confirmacion antes de cambiar una configuracion modificada", () => {
    assert.equal(fuzzionConfigSwitchAction(false), "APPLY");
    assert.equal(fuzzionConfigSwitchAction(true), "CONFIRM");
  });
});
