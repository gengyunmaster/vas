import { beforeAll, describe, expect, it } from "vitest";
import { ensureComputeEngine, evaluateExpression, latexToExpression } from "../model";

const noVars = () => null;

describe("evaluateExpression", () => {
  it("evaluates arithmetic with precedence and power", () => {
    expect(evaluateExpression("1+2*3", noVars)).toBe(7);
    expect(evaluateExpression("(1+2)*3", noVars)).toBe(9);
    expect(evaluateExpression("2^3^2", noVars)).toBe(512);
    expect(evaluateExpression("-2^2", noVars)).toBe(-4);
    expect(evaluateExpression("10/4", noVars)).toBe(2.5);
  });

  it("evaluates functions and constants", () => {
    expect(evaluateExpression("sqrt(2)*sin(pi/4)", noVars)).toBeCloseTo(1);
    expect(evaluateExpression("ln(e^2)", noVars)).toBeCloseTo(2);
    expect(evaluateExpression("abs(-3)+floor(2.7)", noVars)).toBe(5);
    expect(evaluateExpression("max(1,9)+min(2,3)", noVars)).toBe(11);
  });

  it("resolves v-indexed variables", () => {
    const vars = (index: number) => (index === 1 ? 3 : index === 2 ? 4 : null);
    expect(evaluateExpression("(v1+v2/2)^2", vars)).toBe(25);
    expect(evaluateExpression("v9+1", vars)).toBeNull();
  });

  it("rejects invalid input", () => {
    expect(evaluateExpression("", noVars)).toBeNull();
    expect(evaluateExpression("1+", noVars)).toBeNull();
    expect(evaluateExpression("v1 v2", noVars)).toBeNull();
    expect(evaluateExpression("foo(1)", noVars)).toBeNull();
    expect(evaluateExpression("1;alert(1)", noVars)).toBeNull();
  });

  it("rejects non-finite results", () => {
    expect(evaluateExpression("sqrt(-1)", noVars)).toBeNull();
    expect(evaluateExpression("1/0", noVars)).toBeNull();
    expect(evaluateExpression("log(-5)", noVars)).toBeNull();
    expect(evaluateExpression("min(1)", noVars)).toBeNull();
  });
});

describe("latexToExpression", () => {
  beforeAll(async () => {
    await ensureComputeEngine();
  });

  const evaluate = (
    latex: string,
    vars: (index: number) => number | null = noVars,
    names?: (name: string) => number | null,
  ) => {
    const expression = latexToExpression(latex);
    return expression === null ? null : evaluateExpression(expression, vars, names);
  };

  it("maps subscripted value references", () => {
    expect(latexToExpression("v_{12}")).toBe("v12");
    const vars = (index: number) => (index === 1 ? 3 : index === 2 ? 4 : null);
    expect(evaluate("v_1+2v_2", vars)).toBe(11);
  });

  it("maps fractions, roots, logs and powers", () => {
    const vars = (index: number) => (index === 1 ? 16 : index === 2 ? 2 : null);
    expect(evaluate("\\frac{v_1}{2}+3", vars)).toBe(11);
    expect(evaluate("\\sqrt{v_1}", vars)).toBe(4);
    expect(evaluate("\\sqrt[3]{v_1}", vars)).toBeCloseTo(Math.cbrt(16));
    expect(evaluate("\\log_{v_2} 8", vars)).toBe(3);
    expect(evaluate("\\log 100")).toBe(2);
    expect(evaluate("e^{v_1}", (index) => (index === 1 ? 0 : null))).toBe(1);
  });

  it("maps functions, constants and signs", () => {
    expect(evaluate("\\sin\\left(\\frac{\\pi}{2}\\right)")).toBeCloseTo(1);
    expect(evaluate("\\left|v_1\\right|", (index) => (index === 1 ? -5 : null))).toBe(5);
    expect(
      evaluate("\\min(v_1,v_2)+\\ln e", (index) => (index === 1 ? 7 : index === 2 ? 9 : null)),
    ).toBe(8);
    expect(evaluate("-v_1+3", (index) => (index === 1 ? 5 : null))).toBe(-2);
  });

  it("keeps named references, including subscripted names", () => {
    const names = (name: string) => (name === "a" ? 3 : name === "a_1" ? 5 : null);
    expect(evaluate("2\\pi a", noVars, names)).toBeCloseTo(6 * Math.PI);
    expect(evaluate("a_1^2", noVars, names)).toBe(25);
  });

  it("rejects unsupported constructs", () => {
    expect(latexToExpression("\\int_0^1 x\\,dx")).toBeNull();
    expect(latexToExpression("\\sum_{i=1}^{n} i")).toBeNull();
    expect(latexToExpression("")).toBeNull();
  });
});
