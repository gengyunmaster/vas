export type XY = [number, number];

export const distance = (a: XY, b: XY): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const midpoint = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export function distancePointToSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function distancePointToLine(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return distance(p, a);
  return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / length;
}

export function distancePointToRay(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
  if (t <= 0) return distance(p, a);
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function pointInPolygon(p: XY, vertices: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function projectOntoDirectedLine(p: XY, origin: XY, angle: number): XY {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const t = (p[0] - origin[0]) * dx + (p[1] - origin[1]) * dy;
  return [origin[0] + t * dx, origin[1] + t * dy];
}

export const nearestAngleStep = (angle: number, step: number): number =>
  Math.round(angle / step) * step;

export function minimizeScalar(
  evaluate: (value: number) => number,
  lower: number,
  upper: number,
  iterations = 24,
): number {
  let a = lower;
  let b = upper;
  for (let i = 0; i < iterations; i++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (evaluate(m1) < evaluate(m2)) b = m2;
    else a = m1;
  }
  return (a + b) / 2;
}

// Intersection of two curves given as point functions over bounded parameter
// domains: contact sample pairs seed an alternating nearest-parameter
// refinement, accepted only when the curves actually meet.
export function intersectPointFunctions(
  pa: (t: number) => XY | null,
  domainA: readonly [number, number],
  pb: (t: number) => XY | null,
  domainB: readonly [number, number],
  near: XY,
  samples = 120,
): XY | null {
  const pointsA: (XY | null)[] = [];
  const pointsB: (XY | null)[] = [];
  for (let i = 0; i <= samples; i++) {
    pointsA.push(pa(domainA[0] + ((domainA[1] - domainA[0]) * i) / samples));
    pointsB.push(pb(domainB[0] + ((domainB[1] - domainB[0]) * i) / samples));
  }
  const meanSpacing = (points: (XY | null)[]): number => {
    let total = 0;
    let count = 0;
    for (let i = 0; i + 1 < points.length; i++) {
      const current = points[i];
      const next = points[i + 1];
      if (current && next) {
        total += distance(current, next);
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  };
  const contact = 2 * (meanSpacing(pointsA) + meanSpacing(pointsB));
  let seedI = -1;
  let seedJ = -1;
  let seedNear = Infinity;
  let minI = -1;
  let minJ = -1;
  let minGap = Infinity;
  for (let i = 0; i <= samples; i++) {
    const a = pointsA[i];
    if (!a) continue;
    for (let j = 0; j <= samples; j++) {
      const b = pointsB[j];
      if (!b) continue;
      const d = distance(a, b);
      if (d < minGap) {
        minGap = d;
        minI = i;
        minJ = j;
      }
      if (d <= contact) {
        const nearD = distance(midpoint(a, b), near);
        if (nearD < seedNear) {
          seedNear = nearD;
          seedI = i;
          seedJ = j;
        }
      }
    }
  }
  if (seedI < 0) {
    seedI = minI;
    seedJ = minJ;
  }
  if (seedI < 0) return null;
  let sa = domainA[0] + ((domainA[1] - domainA[0]) * seedI) / samples;
  let sb = domainB[0] + ((domainB[1] - domainB[0]) * seedJ) / samples;
  const stepA = (domainA[1] - domainA[0]) / samples;
  const stepB = (domainB[1] - domainB[0]) / samples;
  for (let iteration = 0; iteration < 12; iteration++) {
    const radiusA = stepA * (1 + 4 * 2 ** -iteration);
    const b = pb(sb);
    if (!b) return null;
    sa = minimizeScalar(
      (t) => {
        const point = pa(t);
        return point ? distance(point, b) : Infinity;
      },
      Math.max(domainA[0], sa - radiusA),
      Math.min(domainA[1], sa + radiusA),
      40,
    );
    const a = pa(sa);
    if (!a) return null;
    const radiusB = stepB * (1 + 4 * 2 ** -iteration);
    sb = minimizeScalar(
      (t) => {
        const point = pb(t);
        return point ? distance(point, a) : Infinity;
      },
      Math.max(domainB[0], sb - radiusB),
      Math.min(domainB[1], sb + radiusB),
      40,
    );
  }
  const a = pa(sa);
  const b = pb(sb);
  return a && b && distance(a, b) < 1e-5 ? a : null;
}

export type ResolvedShape =
  | { type: "segment"; a: XY; b: XY }
  | { type: "line"; a: XY; b: XY }
  | { type: "ray"; a: XY; b: XY }
  | { type: "circle"; center: XY; radius: number };

type LinearShape = Extract<ResolvedShape, { type: "segment" | "line" | "ray" }>;

interface LinearSpec {
  origin: XY;
  direction: XY;
  tMin: number;
  tMax: number;
}

const INTERSECTION_EPSILON = 1e-9;

const linearSpec = (shape: LinearShape): LinearSpec => ({
  origin: shape.a,
  direction: [shape.b[0] - shape.a[0], shape.b[1] - shape.a[1]],
  tMin: shape.type === "line" ? -Infinity : 0,
  tMax: shape.type === "segment" ? 1 : Infinity,
});

const withinRange = (t: number, spec: LinearSpec): boolean =>
  t >= spec.tMin - INTERSECTION_EPSILON && t <= spec.tMax + INTERSECTION_EPSILON;

export function intersectShapes(first: ResolvedShape, second: ResolvedShape): XY[] {
  if (first.type === "circle" && second.type === "circle") {
    return intersectCircles(first.center, first.radius, second.center, second.radius);
  }
  if (first.type !== "circle" && second.type !== "circle") {
    return intersectLinearLinear(linearSpec(first), linearSpec(second));
  }
  if (first.type === "circle" && second.type !== "circle") {
    return intersectLinearCircle(linearSpec(second), first.center, first.radius);
  }
  if (first.type !== "circle" && second.type === "circle") {
    return intersectLinearCircle(linearSpec(first), second.center, second.radius);
  }
  return [];
}

export function intersectCircles(c1: XY, r1: number, c2: XY, r2: number): XY[] {
  const d = distance(c1, c2);
  if (d < INTERSECTION_EPSILON) return [];
  if (d > r1 + r2 + INTERSECTION_EPSILON) return [];
  if (d < Math.abs(r1 - r2) - INTERSECTION_EPSILON) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const heightSq = r1 * r1 - a * a;
  const height = Math.sqrt(Math.max(0, heightSq));
  const mx = c1[0] + (a * (c2[0] - c1[0])) / d;
  const my = c1[1] + (a * (c2[1] - c1[1])) / d;
  const ox = (-(c2[1] - c1[1]) / d) * height;
  const oy = ((c2[0] - c1[0]) / d) * height;
  return deduplicatePoints([
    [mx + ox, my + oy],
    [mx - ox, my - oy],
  ]);
}

function intersectLinearLinear(p: LinearSpec, q: LinearSpec): XY[] {
  const [dx1, dy1] = p.direction;
  const [dx2, dy2] = q.direction;
  const denominator = dx1 * dy2 - dy1 * dx2;
  const scale = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2);
  if (scale === 0 || Math.abs(denominator) < INTERSECTION_EPSILON * scale) return [];
  const rx = q.origin[0] - p.origin[0];
  const ry = q.origin[1] - p.origin[1];
  const t = (rx * dy2 - ry * dx2) / denominator;
  const u = (rx * dy1 - ry * dx1) / denominator;
  if (!withinRange(t, p) || !withinRange(u, q)) return [];
  return [[p.origin[0] + t * dx1, p.origin[1] + t * dy1]];
}

function intersectLinearCircle(spec: LinearSpec, center: XY, radius: number): XY[] {
  const [dx, dy] = spec.direction;
  const fx = spec.origin[0] - center[0];
  const fy = spec.origin[1] - center[1];
  const qa = dx * dx + dy * dy;
  if (qa < INTERSECTION_EPSILON) return [];
  const qb = 2 * (fx * dx + fy * dy);
  const qc = fx * fx + fy * fy - radius * radius;
  const discriminant = qb * qb - 4 * qa * qc;
  const magnitude = qb * qb + Math.abs(4 * qa * qc);
  if (discriminant < -INTERSECTION_EPSILON * Math.max(1, magnitude)) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  const results: XY[] = [];
  for (const t of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) {
    if (withinRange(t, spec)) results.push([spec.origin[0] + t * dx, spec.origin[1] + t * dy]);
  }
  return deduplicatePoints(results);
}

function deduplicatePoints(points: XY[]): XY[] {
  const results: XY[] = [];
  for (const point of points) {
    if (!results.some((existing) => distance(existing, point) < 1e-7)) results.push(point);
  }
  return results;
}

export function distanceToShape(p: XY, shape: ResolvedShape): number {
  switch (shape.type) {
    case "segment":
      return distancePointToSegment(p, shape.a, shape.b);
    case "line":
      return distancePointToLine(p, shape.a, shape.b);
    case "ray":
      return distancePointToRay(p, shape.a, shape.b);
    case "circle":
      return Math.abs(distance(p, shape.center) - shape.radius);
  }
}

export function derivedLineThrough(
  variant: "perpendicular" | "parallel",
  through: XY,
  reference: ResolvedShape,
): { a: XY; b: XY } | null {
  if (reference.type === "circle") return null;
  const direction: XY = [reference.b[0] - reference.a[0], reference.b[1] - reference.a[1]];
  if (Math.hypot(direction[0], direction[1]) < 1e-12) return null;
  const rotated = variant === "perpendicular" ? [-direction[1], direction[0]] : direction;
  return { a: through, b: [through[0] + rotated[0], through[1] + rotated[1]] };
}

export function bisectorDirection(a: XY, vertex: XY, b: XY): XY | null {
  const u1 = normalize([a[0] - vertex[0], a[1] - vertex[1]]);
  const u2 = normalize([b[0] - vertex[0], b[1] - vertex[1]]);
  if (!u1 || !u2) return null;
  const sum: XY = [u1[0] + u2[0], u1[1] + u2[1]];
  const length = Math.hypot(sum[0], sum[1]);
  if (length < 1e-9) return [-u1[1], u1[0]];
  return [sum[0] / length, sum[1] / length];
}

export const normalize = (v: XY): XY | null => {
  const length = Math.hypot(v[0], v[1]);
  return length < 1e-12 ? null : [v[0] / length, v[1] / length];
};

export const perpendicular = (v: XY): XY => [-v[1] || 0, v[0]];

export const translatePoint = (p: XY, delta: XY): XY => [p[0] + delta[0], p[1] + delta[1]];

export function rotatePoint(p: XY, center: XY, angleRad: number): XY {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p[0] - center[0];
  const dy = p[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
}

export function scalePoint(p: XY, center: XY, factor: number): XY {
  return [center[0] + (p[0] - center[0]) * factor, center[1] + (p[1] - center[1]) * factor];
}

export function reflectPointAcrossLine(p: XY, a: XY, b: XY): XY | null {
  const direction = normalize([b[0] - a[0], b[1] - a[1]]);
  if (!direction) return null;
  const rel: XY = [p[0] - a[0], p[1] - a[1]];
  const projection = rel[0] * direction[0] + rel[1] * direction[1];
  const foot: XY = [a[0] + projection * direction[0], a[1] + projection * direction[1]];
  return [2 * foot[0] - p[0], 2 * foot[1] - p[1]];
}
