import { describe, expect, it } from "vitest";
import {
  addObject,
  addObjects,
  calculationAt,
  computeValue,
  createDocument,
  freePoint,
  objectNameError,
  renameObject,
  variableAt,
} from "../model";

const buildNamedDoc = () => {
  let document = createDocument();
  const v1 = variableAt(3, [0, 0]);
  const v2 = variableAt(4, [0, 0]);
  document = addObjects(document, [v1, v2]);
  document = renameObject(document, v1.id, "alpha");
  const calc = calculationAt("alpha+v2*2", [0, 0]);
  document = addObject(document, calc);
  return { document, v1, v2, calc };
};

describe("named references in expressions", () => {
  it("resolves custom names and v-indices together", () => {
    const { document, calc } = buildNamedDoc();
    expect(computeValue(document, calc.id)).toBe(11);
  });

  it("matches names case-insensitively", () => {
    let { document, v1 } = buildNamedDoc();
    document = addObject(document, calculationAt("ALPHA*2", [0, 0]));
    const calc = Object.values(document.objects).find(
      (object) => object.kind === "calculation" && object.expression === "ALPHA*2",
    );
    if (!calc) throw new Error("expected the calculation object");
    expect(computeValue(document, calc.id)).toBe(6);
    expect(computeValue(document, v1.id)).toBe(3);
  });

  it("does not resolve a calculation against itself", () => {
    let document = createDocument();
    const calc = calculationAt("self+1", [0, 0]);
    document = addObject(document, calc);
    document = renameObject(document, calc.id, "self");
    expect(computeValue(document, calc.id)).toBeNull();
  });
});

describe("naming constraints", () => {
  it("rejects duplicate names among value objects", () => {
    const { document, v1, v2 } = buildNamedDoc();
    expect(objectNameError(document, v2.id, "alpha")).toContain("already used");
    expect(objectNameError(document, v2.id, "beta")).toBeNull();
    expect(objectNameError(document, v1.id, "alpha")).toBeNull();
  });

  it("rejects vN format", () => {
    const { document, v2 } = buildNamedDoc();
    expect(objectNameError(document, v2.id, "v3")).toContain("reserved");
    expect(objectNameError(document, v2.id, "V12")).toContain("reserved");
  });

  it("rejects reserved keywords", () => {
    const { document, v2 } = buildNamedDoc();
    expect(objectNameError(document, v2.id, "sin")).toContain("reserved");
    expect(objectNameError(document, v2.id, "PI")).toContain("reserved");
    expect(objectNameError(document, v2.id, "max")).toContain("reserved");
  });

  it("reserves plot parameter names for value objects only", () => {
    const { document, v2, calc } = buildNamedDoc();
    expect(objectNameError(document, v2.id, "x")).toContain("reserved");
    expect(objectNameError(document, v2.id, "T")).toContain("reserved");
    expect(objectNameError(document, calc.id, "t")).toContain("reserved");
    const point = freePoint(1, 1);
    const withPoint = addObject(document, point);
    expect(objectNameError(withPoint, point.id, "x")).toBeNull();
    expect(objectNameError(withPoint, point.id, "t")).toBeNull();
  });

  it("rejects invalid identifier patterns", () => {
    const { document, v2 } = buildNamedDoc();
    expect(objectNameError(document, v2.id, "1abc")).toContain("letter");
    expect(objectNameError(document, v2.id, "a+b")).toContain("letter");
    expect(objectNameError(document, v2.id, "a b")).toContain("letter");
    expect(objectNameError(document, v2.id, "beta_1")).toBeNull();
    expect(objectNameError(document, v2.id, "角度")).toContain("letter");
  });

  it("still resolves unicode names from hand-edited files in expressions", () => {
    let document = createDocument();
    const v = variableAt(5, [0, 0]);
    document = addObject(document, v);
    document = renameObject(document, v.id, "角度");
    const calc = calculationAt("角度+1", [0, 0]);
    document = addObject(document, calc);
    expect(computeValue(document, calc.id)).toBe(6);
  });
});
