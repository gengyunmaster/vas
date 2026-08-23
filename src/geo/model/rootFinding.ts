import { minimizeScalar } from "./geometry";

const SEARCH_RADII = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
const SAMPLES = 64;
const ROOT_TOLERANCE = 1e-6;
const TANGENT_HINT_THRESHOLD = 0.25;

function bisectRoot(f: (x: number) => number | null, lo: number, hi: number): number | null {
  let flo = f(lo);
  for (let iteration = 0; iteration < 50; iteration++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (fmid === null) return null;
    if (fmid === 0) return mid;
    if (flo !== null && flo * fmid < 0) hi = mid;
    else {
      lo = mid;
      flo = fmid;
    }
  }
  const candidate = (lo + hi) / 2;
  const value = f(candidate);
  return value !== null && Math.abs(value) < ROOT_TOLERANCE ? candidate : null;
}

function scanRoots(f: (x: number) => number | null, lo: number, hi: number): number[] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = lo + ((hi - lo) * i) / SAMPLES;
    xs.push(x);
    const y = f(x);
    ys.push(y === null || !Number.isFinite(y) ? Number.NaN : y);
  }
  const roots: number[] = [];
  const push = (root: number) => {
    if (!roots.some((existing) => Math.abs(existing - root) < 1e-7)) roots.push(root);
  };
  for (let i = 0; i < SAMPLES; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (Number.isNaN(y0) || Number.isNaN(y1)) continue;
    if (y0 === 0) push(xs[i]);
    else if (y0 * y1 < 0) {
      const root = bisectRoot(f, xs[i], xs[i + 1]);
      if (root !== null) push(root);
    }
  }
  if (ys[SAMPLES] === 0) push(xs[SAMPLES]);
  for (let i = 1; i < SAMPLES; i++) {
    const y = ys[i];
    if (Number.isNaN(y)) continue;
    const magnitude = Math.abs(y);
    if (
      Number.isNaN(ys[i - 1]) ||
      Number.isNaN(ys[i + 1]) ||
      magnitude > Math.abs(ys[i - 1]) ||
      magnitude > Math.abs(ys[i + 1]) ||
      magnitude > TANGENT_HINT_THRESHOLD
    ) {
      continue;
    }
    const best = minimizeScalar(
      (x) => {
        const value = f(x);
        return value === null ? Number.POSITIVE_INFINITY : Math.abs(value);
      },
      xs[i - 1],
      xs[i + 1],
    );
    const residual = f(best);
    if (residual !== null && Math.abs(residual) < ROOT_TOLERANCE) push(best);
  }
  return roots;
}

export function findRootsInDomain(
  f: (x: number) => number | null,
  lo: number,
  hi: number,
): number[] {
  return lo < hi ? scanRoots(f, lo, hi) : [];
}

export function findGraphRootNear(f: (x: number) => number | null, hint: number): number | null {
  for (const radius of SEARCH_RADII) {
    const roots = scanRoots(f, hint - radius, hint + radius);
    if (roots.length === 0) continue;
    let best = roots[0];
    for (const root of roots) {
      if (Math.abs(root - hint) < Math.abs(best - hint)) best = root;
    }
    return best;
  }
  return null;
}
