import { beforeAll, describe, expect, it } from "vitest";
import type { Variable } from "../model";
import {
  addObjects,
  axisSystemOf,
  createDocument,
  ensureComputeEngine,
  evaluateLatex,
  findGraphRootNear,
  findRootsInDomain,
  freePoint,
  functionPlotOf,
  intersectionOf,
  isLatexValid,
  line,
  parseDocument,
  pointPosition,
  sampleFunction,
  serializeDocument,
  setVariableRange,
  setVariableValue,
  variableAnimationOf,
  variableAt,
  variableScope,
} from "../model";

beforeAll(async () => {
  await ensureComputeEngine();
});

const namedVariable = (name: string, value: number) => ({ ...variableAt(value, [0, 0]), name });

describe("variable slider range", () => {
  it("sets, clamps, rejects and clears slider ranges", () => {
    let document = addObjects(createDocument(), [variableAt(5, [0, 0])]);
    const id = Object.keys(document.objects)[0];
    document = setVariableRange(document, id, 0, 10);
    let variable = document.objects[id] as Variable;
    expect(variable.min).toBe(0);
    expect(variable.max).toBe(10);
    expect(variable.value).toBe(5);

    document = setVariableRange(document, id, 0, 3);
    variable = document.objects[id] as Variable;
    expect(variable.value).toBe(3);

    document = setVariableRange(document, id, 4, 2);
    variable = document.objects[id] as Variable;
    expect(variable.min).toBe(0);
    expect(variable.max).toBe(3);

    document = setVariableRange(document, id, null, 2);
    variable = document.objects[id] as Variable;
    expect(variable.min).toBeUndefined();
    expect(variable.max).toBe(2);
  });

  it("exposes only named ASCII variables in the plot scope", () => {
    const document = addObjects(createDocument(), [
      namedVariable("a", 2),
      variableAt(3, [1, 0]),
      namedVariable("角度", 4),
    ]);
    expect(variableScope(document)).toEqual({ a: 2 });
  });

  it("serializes variable ranges and variable animations", () => {
    const variable = namedVariable("a", 1);
    let document = addObjects(createDocument(), [variable]);
    document = setVariableRange(document, variable.id, 0, 10);
    document = addObjects(document, [variableAnimationOf(variable.id, [1, 1])]);
    const restored = parseDocument(serializeDocument(document));
    const restoredVariable = restored.objects[variable.id] as Variable;
    expect(restoredVariable.min).toBe(0);
    expect(restoredVariable.max).toBe(10);
    const animation = Object.values(restored.objects).find((object) => object.kind === "animation");
    expect(animation).toMatchObject({ variant: "variable", target: variable.id });
  });
});

describe("variables in plot expressions", () => {
  it("plots a function referencing a variable and follows its changes", () => {
    const variable = namedVariable("a", 2);
    const plot = functionPlotOf("a^x");
    let document = addObjects(createDocument(), [variable, plot]);
    const view = [-1, 5, 3, -5] as const;
    const first = sampleFunction(document, plot.id, view);
    if (!first) throw new Error("expected sampled fragments");
    for (const [x, y] of first[0]) expect(y).toBeCloseTo(2 ** x, 4);

    document = setVariableValue(document, variable.id, 3);
    const second = sampleFunction(document, plot.id, view);
    if (!second) throw new Error("expected sampled fragments");
    for (const [x, y] of second[0]) expect(y).toBeCloseTo(3 ** x, 4);
  });

  it("validates latex against the variable scope", () => {
    expect(isLatexValid("a^x", { a: 2 })).toBe(true);
    expect(isLatexValid("a^x")).toBe(false);
  });

  it("accepts functions defined only far from the origin", () => {
    expect(isLatexValid("\\ln(x-100)")).toBe(true);
    expect(isLatexValid("\\sqrt{x-20}")).toBe(true);
    expect(isLatexValid("\\sqrt{-x-1000}")).toBe(true);
    expect(isLatexValid("\\sqrt{-x^2-1}")).toBe(false);
  });

  it("evaluates logarithms with a custom base", () => {
    expect(evaluateLatex("\\log_{2} 8", {})).toBeCloseTo(3);
    expect(evaluateLatex("\\log_{a} x", { a: 2, x: 8 })).toBeCloseTo(3);
  });
});

describe("graph root finding", () => {
  it("finds simple roots near the hint", () => {
    expect(findGraphRootNear((x) => x * x - 2, 1)).toBeCloseTo(Math.SQRT2, 5);
    expect(findGraphRootNear((x) => x - 10, 0)).toBeCloseTo(10, 5);
    expect(findGraphRootNear((x) => x * x + 1, 0)).toBeNull();
  });

  it("catches tangencies without sign changes", () => {
    expect(findGraphRootNear((x) => (x - 1) ** 2, 0.6)).toBeCloseTo(1, 5);
  });

  it("rejects asymptote sign changes", () => {
    expect(findGraphRootNear((x) => (x === 0 ? null : 1 / x), 0.2)).toBeNull();
  });

  it("finds a root exactly at the right domain endpoint", () => {
    expect(findRootsInDomain((x) => x - 2, 0, 2)).toEqual([2]);
    expect(findRootsInDomain((x) => (x - 2) * (x + 1), -1, 2)).toEqual([-1, 2]);
  });
});

describe("function plot intersections", () => {
  it("resolves intersections between two plots, picking the one near the click", () => {
    const f = functionPlotOf("x^2");
    const g = functionPlotOf("x");
    const nearOne = intersectionOf(f.id, g.id, [1.1, 1.1]);
    const nearZero = intersectionOf(f.id, g.id, [0.1, 0.1]);
    const document = addObjects(createDocument(), [f, g, nearOne, nearZero]);
    const first = pointPosition(document, nearOne.id);
    const second = pointPosition(document, nearZero.id);
    expect(first?.[0]).toBeCloseTo(1, 5);
    expect(first?.[1]).toBeCloseTo(1, 5);
    expect(second?.[0]).toBeCloseTo(0, 5);
    expect(second?.[1]).toBeCloseTo(0, 5);
  });

  it("resolves intersections between plots in a rotated axis frame", () => {
    const angle = Math.PI / 6;
    const origin = freePoint(0, 0);
    const unit = freePoint(Math.cos(angle), Math.sin(angle));
    const axes = axisSystemOf(origin.id, unit.id);
    const f = { ...functionPlotOf("x"), axis: axes.id };
    const g = { ...functionPlotOf("1-x"), axis: axes.id };
    const hit = intersectionOf(f.id, g.id, [0.18, 0.68]);
    const document = addObjects(createDocument(), [origin, unit, axes, f, g, hit]);
    const position = pointPosition(document, hit.id);
    expect(position?.[0]).toBeCloseTo(0.5 * Math.cos(angle) - 0.5 * Math.sin(angle), 5);
    expect(position?.[1]).toBeCloseTo(0.5 * Math.sin(angle) + 0.5 * Math.cos(angle), 5);
  });

  it("resolves tangent contacts between a plot and a line", () => {
    const p = freePoint(0, -1);
    const q = freePoint(1, 1);
    const tangent = line(p.id, q.id);
    const plot = functionPlotOf("x^2");
    const hit = intersectionOf(plot.id, tangent.id, [0.9, 0.9]);
    const document = addObjects(createDocument(), [p, q, tangent, plot, hit]);
    const position = pointPosition(document, hit.id);
    expect(position?.[0]).toBeCloseTo(1, 5);
    expect(position?.[1]).toBeCloseTo(1, 5);
  });

  it("tracks a^x and log_a(x) intersections as the parameter moves", () => {
    const a = namedVariable("a", 1 / 16);
    const f = functionPlotOf("a^x");
    const g = functionPlotOf("\\log_{a} x");
    const hitLeft = intersectionOf(f.id, g.id, [0.25, 0.5]);
    const hitRight = intersectionOf(f.id, g.id, [0.5, 0.25]);
    let document = addObjects(createDocument(), [a, f, g, hitLeft, hitRight]);
    const left = pointPosition(document, hitLeft.id);
    const right = pointPosition(document, hitRight.id);
    expect(left?.[0]).toBeCloseTo(0.25, 4);
    expect(left?.[1]).toBeCloseTo(0.5, 4);
    expect(right?.[0]).toBeCloseTo(0.5, 4);
    expect(right?.[1]).toBeCloseTo(0.25, 4);

    document = setVariableValue(document, a.id, 2);
    expect(pointPosition(document, hitLeft.id)).toBeNull();
    expect(pointPosition(document, hitRight.id)).toBeNull();
  });
});
