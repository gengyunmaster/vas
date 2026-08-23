import type { GeoDocument, GeoObject, ObjectId } from "./document";
import { dependenciesOf } from "./document";
import { expressionIdentifiers } from "./expression";
import { computeValue, isValueObject, listValueObjects } from "./values";

const MAX_ITERATIONS = 8;
const TOLERANCE = 1e-7;

interface ActiveLock {
  id: ObjectId;
  target: number;
  closure: Set<ObjectId>;
}

function solverRefs(document: GeoDocument, object: GeoObject): ObjectId[] {
  if (object.kind !== "calculation") return dependenciesOf(object);
  const values = listValueObjects(document);
  const refs: ObjectId[] = [];
  for (const identifier of expressionIdentifiers(object.expression)) {
    const indexed = /^v(\d+)$/.exec(identifier);
    if (indexed) {
      const target = values[Number(indexed[1]) - 1];
      if (target && target !== object.id) refs.push(target);
      continue;
    }
    for (const candidate of Object.values(document.objects)) {
      if (
        candidate.id !== object.id &&
        isValueObject(candidate) &&
        candidate.name?.toLowerCase() === identifier
      ) {
        refs.push(candidate.id);
        break;
      }
    }
  }
  return refs;
}

function closureOf(document: GeoDocument, id: ObjectId): Set<ObjectId> {
  const seen = new Set<ObjectId>();
  const stack: ObjectId[] = [id];
  while (stack.length > 0) {
    const current = stack.pop() as ObjectId;
    if (seen.has(current)) continue;
    const object = document.objects[current];
    if (!object) continue;
    seen.add(current);
    for (const dependency of solverRefs(document, object)) stack.push(dependency);
  }
  return seen;
}

function activeLocks(document: GeoDocument, seedId?: ObjectId): ActiveLock[] {
  const locks: ActiveLock[] = [];
  for (const object of Object.values(document.objects)) {
    if (object.kind !== "measurement" && object.kind !== "calculation") continue;
    const target = object.locked;
    if (target === undefined || !Number.isFinite(target)) continue;
    const closure = closureOf(document, object.id);
    if (seedId !== undefined && !closure.has(seedId)) continue;
    if (computeValue(document, object.id) === null) continue;
    locks.push({ id: object.id, target, closure });
  }
  return locks;
}

function freeRootsOf(document: GeoDocument, locks: ActiveLock[], pinnedId?: ObjectId): ObjectId[] {
  const roots: ObjectId[] = [];
  const seen = new Set<ObjectId>();
  for (const lock of locks) {
    for (const id of lock.closure) {
      const object = document.objects[id];
      if (
        object?.kind === "point" &&
        object.role === "free" &&
        !object.locked &&
        id !== pinnedId &&
        !seen.has(id)
      ) {
        seen.add(id);
        roots.push(id);
      }
    }
  }
  return roots;
}

function withRootPositions(
  document: GeoDocument,
  roots: ObjectId[],
  coords: number[],
): GeoDocument {
  const objects = { ...document.objects };
  roots.forEach((id, index) => {
    const object = objects[id];
    if (object?.kind === "point" && object.role === "free" && !object.locked) {
      objects[id] = { ...object, x: coords[index * 2], y: coords[index * 2 + 1] };
    }
  });
  return { ...document, objects };
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const size = rhs.length;
  const augmented = matrix.map((row, i) => [...row, rhs[i]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-15) return null;
    const held = augmented[column];
    augmented[column] = augmented[pivot];
    augmented[pivot] = held;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column] / augmented[column][column];
      for (let k = column; k <= size; k++) augmented[row][k] -= factor * augmented[column][k];
    }
  }
  return augmented.map((row, i) => row[size] / augmented[i][i]);
}

export function enforceLocks(document: GeoDocument, seedId?: ObjectId): GeoDocument {
  const locks = activeLocks(document, seedId);
  if (locks.length === 0) return document;
  let roots = freeRootsOf(document, locks, seedId);
  if (roots.length === 0) roots = freeRootsOf(document, locks);
  if (roots.length === 0) return document;

  const evaluate = (coords: number[]): number[] => {
    const next = withRootPositions(document, roots, coords);
    return locks.map((lock) => computeValue(next, lock.id) ?? Number.NaN);
  };
  const rawResiduals = (values: number[]): number[] =>
    values.map((value, i) => (Number.isFinite(value) ? value - locks[i].target : 0));
  const scaledNorm = (raw: number[]): number =>
    raw.reduce(
      (worst, residual, i) =>
        Math.max(worst, Math.abs(residual) / Math.max(1, Math.abs(locks[i].target))),
      0,
    );

  const coords: number[] = [];
  for (const id of roots) {
    const point = document.objects[id];
    if (point?.kind === "point" && point.role === "free") coords.push(point.x, point.y);
  }
  if (coords.length !== roots.length * 2) return document;

  let raw = rawResiduals(evaluate(coords));
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (scaledNorm(raw) <= TOLERANCE) break;
    const jacobian = locks.map(() => coords.map(() => 0));
    for (let column = 0; column < coords.length; column++) {
      const h = 1e-6 * Math.max(1, Math.abs(coords[column]));
      const bumped = [...coords];
      bumped[column] += h;
      const bumpedRaw = rawResiduals(evaluate(bumped));
      for (let row = 0; row < locks.length; row++) {
        jacobian[row][column] = (bumpedRaw[row] - raw[row]) / h;
      }
    }
    const normal = locks.map((_, i) =>
      locks.map((_, k) => {
        let sum = 0;
        for (let j = 0; j < coords.length; j++) sum += jacobian[i][j] * jacobian[k][j];
        return sum;
      }),
    );
    for (let i = 0; i < locks.length; i++) normal[i][i] += 1e-9 * Math.max(1, normal[i][i]);
    const lambda = solveLinearSystem(normal, raw);
    if (!lambda) break;
    const step = coords.map((_, j) => {
      let sum = 0;
      for (let i = 0; i < locks.length; i++) sum += jacobian[i][j] * lambda[i];
      return sum;
    });
    const currentNorm = scaledNorm(raw);
    let accepted = false;
    for (let halving = 0; halving < 6; halving++) {
      const factor = 1 / 2 ** halving;
      const candidate = coords.map((value, j) => value - factor * step[j]);
      const candidateRaw = rawResiduals(evaluate(candidate));
      if (scaledNorm(candidateRaw) < currentNorm) {
        for (let j = 0; j < coords.length; j++) coords[j] = candidate[j];
        raw = candidateRaw;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }

  const changed = roots.some((id, index) => {
    const point = document.objects[id];
    return (
      point?.kind === "point" &&
      point.role === "free" &&
      (point.x !== coords[index * 2] || point.y !== coords[index * 2 + 1])
    );
  });
  return changed ? withRootPositions(document, roots, coords) : document;
}
