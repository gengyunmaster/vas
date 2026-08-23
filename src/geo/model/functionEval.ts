import type { BoxedExpression, ComputeEngine } from "@cortex-js/compute-engine";
import type { GeoDocument } from "./document";

let engine: ComputeEngine | null = null;
let loading: Promise<ComputeEngine> | null = null;
const parseCache = new Map<string, BoxedExpression | null>();

export function ensureComputeEngine(): Promise<ComputeEngine> {
  if (engine) return Promise.resolve(engine);
  loading ??= import("@cortex-js/compute-engine")
    .then(({ ComputeEngine }) => {
      engine = new ComputeEngine();
      return engine;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function evaluateLatex(latex: string, variables: Record<string, number>): number | null {
  if (!engine) return null;
  try {
    let parsed = parseCache.get(latex);
    if (parsed === undefined) {
      if (parseCache.size >= 500) parseCache.clear();
      parsed = engine.parse(latex);
      parseCache.set(latex, parsed);
    }
    if (!parsed) return null;
    const value = parsed.subs(variables).N().valueOf();
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function variableScope(document: GeoDocument): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const object of Object.values(document.objects)) {
    if (object.kind !== "variable" || !object.name) continue;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(object.name)) continue;
    scope[object.name] = object.value;
  }
  return scope;
}

const VALIDITY_PROBES = [
  ...Array.from({ length: 20 }, (_, i) => i - 9.5),
  -20.5,
  20.5,
  -100.5,
  100.5,
  -1000.5,
  1000.5,
];

export function isLatexValid(latex: string, scope: Record<string, number> = {}): boolean {
  for (const probe of VALIDITY_PROBES) {
    if (evaluateLatex(latex, { ...scope, x: probe, t: probe }) !== null) return true;
  }
  return false;
}

const SYMBOL_CONSTANTS: Record<string, string> = {
  pi: "pi",
  exponentiale: "e",
};

function symbolToIdentifier(symbol: string): string | null {
  if (symbol === "Nothing") return null;
  const constant = SYMBOL_CONSTANTS[symbol.toLowerCase()];
  if (constant) return constant;
  const indexed = /^v_(\d+)$/i.exec(symbol);
  if (indexed) return `v${indexed[1]}`;
  if (/^[\p{L}][\p{L}\p{N}_]*$/u.test(symbol)) return symbol;
  return null;
}

function mathJsonToExpression(node: unknown): string | null {
  if (typeof node === "number") return Number.isFinite(node) ? String(node) : null;
  if (typeof node === "string") return symbolToIdentifier(node);
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const raw = (node as { num?: unknown }).num;
    if (typeof raw === "string" && Number.isFinite(Number(raw))) return String(Number(raw));
    return null;
  }
  if (!Array.isArray(node) || node.length === 0 || typeof node[0] !== "string") return null;
  const head = node[0];
  const args = node.slice(1);
  if (head === "Subscript" && args.length === 2 && typeof args[0] === "string") {
    const index = args[1];
    if (typeof index === "number" && Number.isInteger(index) && index >= 0) {
      return symbolToIdentifier(`${args[0]}_${index}`);
    }
    return null;
  }
  const operands = args.map(mathJsonToExpression);
  if (operands.some((operand) => operand === null)) return null;
  const parts = operands as string[];
  const unary = (name: string) => (parts.length === 1 ? `${name}(${parts[0]})` : null);
  switch (head) {
    case "Add":
      return `(${parts.join("+")})`;
    case "Subtract":
      return parts.length === 2 ? `(${parts[0]}-${parts[1]})` : null;
    case "Negate":
      return parts.length === 1 ? `(-${parts[0]})` : null;
    case "Multiply":
      return `(${parts.join("*")})`;
    case "Divide":
    case "Rational":
      return parts.length === 2 ? `(${parts[0]}/${parts[1]})` : null;
    case "Power":
      return parts.length === 2 ? `(${parts[0]}^${parts[1]})` : null;
    case "Root":
      return parts.length === 2 ? `((${parts[0]})^(1/(${parts[1]})))` : null;
    case "Log":
      if (parts.length === 1) return `log(${parts[0]})`;
      if (parts.length === 2) return `(log(${parts[0]})/log(${parts[1]}))`;
      return null;
    case "Sqrt":
      return unary("sqrt");
    case "Ln":
      return unary("ln");
    case "Exp":
      return unary("exp");
    case "Sin":
      return unary("sin");
    case "Cos":
      return unary("cos");
    case "Tan":
      return unary("tan");
    case "Arcsin":
      return unary("arcsin");
    case "Arccos":
      return unary("arccos");
    case "Arctan":
      return unary("arctan");
    case "Abs":
      return unary("abs");
    case "Ceil":
      return unary("ceil");
    case "Floor":
      return unary("floor");
    case "Round":
      return unary("round");
    case "Sign":
      return unary("sign");
    case "Min":
      return parts.length === 2 ? `min(${parts[0]},${parts[1]})` : null;
    case "Max":
      return parts.length === 2 ? `max(${parts[0]},${parts[1]})` : null;
    default:
      return null;
  }
}

export function latexToExpression(latex: string): string | null {
  if (!engine || !latex.trim()) return null;
  try {
    const parsed = engine.parse(latex);
    if (!parsed) return null;
    return mathJsonToExpression(parsed.json);
  } catch {
    return null;
  }
}
