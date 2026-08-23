const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sin: ([x]) => Math.sin(x),
  cos: ([x]) => Math.cos(x),
  tan: ([x]) => Math.tan(x),
  asin: ([x]) => Math.asin(x),
  acos: ([x]) => Math.acos(x),
  atan: ([x]) => Math.atan(x),
  arcsin: ([x]) => Math.asin(x),
  arccos: ([x]) => Math.acos(x),
  arctan: ([x]) => Math.atan(x),
  log: ([x]) => Math.log10(x),
  ln: ([x]) => Math.log(x),
  abs: ([x]) => Math.abs(x),
  ceil: ([x]) => Math.ceil(x),
  floor: ([x]) => Math.floor(x),
  round: ([x]) => Math.round(x),
  sqrt: ([x]) => Math.sqrt(x),
  exp: ([x]) => Math.exp(x),
  sign: ([x]) => Math.sign(x),
  min: ([a, b]) => Math.min(a, b),
  max: ([a, b]) => Math.max(a, b),
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export const FUNCTION_NAMES: ReadonlySet<string> = new Set(Object.keys(FUNCTIONS));
export const CONSTANT_NAMES: ReadonlySet<string> = new Set(Object.keys(CONSTANTS));

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "operator"; symbol: string };

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[\d.]/.test(ch)) {
      const match = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(source.slice(i));
      if (!match) return null;
      tokens.push({ type: "number", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[\p{L}]/u.test(ch)) {
      const match = /^[\p{L}][\p{L}\p{N}_]*/u.exec(source.slice(i));
      if (!match) return null;
      tokens.push({ type: "identifier", name: match[0].toLowerCase() });
      i += match[0].length;
      continue;
    }
    if ("+-*/^(),".includes(ch)) {
      tokens.push({ type: "operator", symbol: ch });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

export function expressionIdentifiers(source: string): string[] {
  const tokens = tokenize(source);
  if (!tokens) return [];
  return tokens
    .filter((token): token is Extract<Token, { type: "identifier" }> => token.type === "identifier")
    .map((token) => token.name);
}

const IDENTIFIER_PATTERN = /[\p{L}][\p{L}\p{N}_]*/gu;
const INDEX_REFERENCE_PATTERN = /^v(\d+)$/i;

export function expressionIndexReferences(source: string): number[] {
  const indices: number[] = [];
  for (const match of source.matchAll(IDENTIFIER_PATTERN)) {
    const reference = INDEX_REFERENCE_PATTERN.exec(match[0]);
    if (reference) indices.push(Number(reference[1]));
  }
  return indices;
}

export function remapIndexReferences(
  source: string,
  remap: (index: number) => number | null,
): string | null {
  let dangling = false;
  const result = source.replace(IDENTIFIER_PATTERN, (word) => {
    const reference = INDEX_REFERENCE_PATTERN.exec(word);
    if (!reference) return word;
    const next = remap(Number(reference[1]));
    if (next === null) {
      dangling = true;
      return word;
    }
    return `v${next}`;
  });
  return dangling ? null : result;
}

export function evaluateExpression(
  source: string,
  resolveVariable: (index: number) => number | null,
  resolveName?: (name: string) => number | null,
): number | null {
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return null;
  let cursor = 0;

  const peek = () => tokens[cursor];
  const takeOperator = (...symbols: string[]) => {
    const token = peek();
    if (token?.type === "operator" && symbols.includes(token.symbol)) {
      cursor++;
      return token.symbol;
    }
    return null;
  };

  const parseExpression = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;
    for (;;) {
      const op = takeOperator("+", "-");
      if (!op) return value;
      const rhs = parseTerm();
      if (rhs === null) return null;
      value = op === "+" ? value + rhs : value - rhs;
    }
  };

  const parseTerm = (): number | null => {
    let value = parseFactor();
    if (value === null) return null;
    for (;;) {
      const op = takeOperator("*", "/");
      if (!op) return value;
      const rhs = parseFactor();
      if (rhs === null) return null;
      value = op === "*" ? value * rhs : value / rhs;
    }
  };

  const parseFactor = (): number | null => {
    let sign = 1;
    if (takeOperator("-")) sign = -1;
    else takeOperator("+");
    const value = parsePower();
    return value === null ? null : sign * value;
  };

  const parsePower = (): number | null => {
    const base = parseAtom();
    if (base === null) return null;
    if (takeOperator("^")) {
      const exponent = parseFactor();
      if (exponent === null) return null;
      return base ** exponent;
    }
    return base;
  };

  const parseAtom = (): number | null => {
    const token = peek();
    if (!token) return null;
    if (token.type === "number") {
      cursor++;
      return token.value;
    }
    if (token.type === "operator" && token.symbol === "(") {
      cursor++;
      const value = parseExpression();
      if (value === null || !takeOperator(")")) return null;
      return value;
    }
    if (token.type === "identifier") {
      cursor++;
      const named = resolveName?.(token.name);
      if (named !== null && named !== undefined) return named;
      const varMatch = /^v(\d+)$/.exec(token.name);
      if (varMatch) return resolveVariable(Number(varMatch[1]));
      if (token.name in CONSTANTS) return CONSTANTS[token.name];
      const fn = FUNCTIONS[token.name];
      if (fn && takeOperator("(")) {
        const args: number[] = [];
        const first = parseExpression();
        if (first === null) return null;
        args.push(first);
        while (takeOperator(",")) {
          const next = parseExpression();
          if (next === null) return null;
          args.push(next);
        }
        if (!takeOperator(")")) return null;
        return fn(args);
      }
      return null;
    }
    return null;
  };

  const result = parseExpression();
  if (result === null || cursor !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}
