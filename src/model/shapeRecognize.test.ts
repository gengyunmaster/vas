import { describe, expect, it } from "vitest";
import { recognizeShape } from "./shapeRecognize";
import type { Point } from "./shapeGeometry";

function jitter(value: number, amount: number, seed: number): number {
  // Deterministic pseudo-noise so tests are stable.
  const n = Math.sin(seed * 127.1 + value * 311.7) * 43758.5453;
  return value + (n - Math.floor(n) - 0.5) * 2 * amount;
}

function tracedLine(x1: number, y1: number, x2: number, y2: number, wobble = 1.5): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    points.push({ x: jitter(x, wobble, i), y: jitter(y, wobble, i * 7) });
  }
  return points;
}

function tracedRect(x: number, y: number, w: number, h: number, wobble = 3): Point[] {
  const points: Point[] = [];
  const edges: [Point, Point][] = [
    [{ x, y }, { x: x + w, y }],
    [{ x: x + w, y }, { x: x + w, y: y + h }],
    [{ x: x + w, y: y + h }, { x, y: y + h }],
    [{ x, y: y + h }, { x, y }],
  ];
  let seed = 0;
  for (const [a, b] of edges) {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      points.push({
        x: jitter(a.x + (b.x - a.x) * t, wobble, seed),
        y: jitter(a.y + (b.y - a.y) * t, wobble, seed * 3),
      });
      seed++;
    }
  }
  return points;
}

function tracedEllipse(cx: number, cy: number, rx: number, ry: number, wobble = 3): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= 80; i++) {
    const angle = (i / 80) * Math.PI * 2;
    points.push({
      x: jitter(cx + Math.cos(angle) * rx, wobble, i),
      y: jitter(cy + Math.sin(angle) * ry, wobble, i * 13),
    });
  }
  return points;
}

describe("recognizeShape", () => {
  it("recognizes a wobbly line", () => {
    const hit = recognizeShape(tracedLine(100, 100, 400, 160));
    expect(hit?.kind).toBe("line");
    expect(Math.abs((hit?.start.x ?? 0) - 100)).toBeLessThan(2);
    expect(Math.abs((hit?.end.x ?? 0) - 400)).toBeLessThan(2);
  });

  it("recognizes a wobbly rectangle as its bounding box", () => {
    const hit = recognizeShape(tracedRect(100, 100, 300, 200));
    expect(hit?.kind).toBe("rect");
    expect(Math.abs((hit?.start.x ?? 0) - 100)).toBeLessThan(4);
    expect(Math.abs((hit?.start.y ?? 0) - 100)).toBeLessThan(4);
    expect(Math.abs((hit?.end.x ?? 0) - 400)).toBeLessThan(4);
    expect(Math.abs((hit?.end.y ?? 0) - 300)).toBeLessThan(4);
  });

  it("recognizes a wobbly ellipse", () => {
    const hit = recognizeShape(tracedEllipse(250, 200, 150, 100));
    expect(hit?.kind).toBe("ellipse");
  });

  it("recognizes a circle as an ellipse", () => {
    expect(recognizeShape(tracedEllipse(200, 200, 120, 120))?.kind).toBe("ellipse");
  });

  it("rejects open curves", () => {
    expect(recognizeShape(tracedEllipse(250, 200, 150, 100).slice(0, 40))).toBeNull();
  });

  it("rejects scribbles", () => {
    const points: Point[] = [];
    for (let i = 0; i < 60; i++) {
      points.push({ x: 100 + i * 5, y: 200 + Math.sin(i * 0.9) * 40 });
    }
    expect(recognizeShape(points)).toBeNull();
  });

  it("rejects tiny gestures", () => {
    expect(recognizeShape(tracedLine(0, 0, 20, 4))).toBeNull();
    expect(recognizeShape(tracedEllipse(20, 20, 10, 8))).toBeNull();
  });

  it("rejects short strokes", () => {
    expect(recognizeShape(tracedLine(0, 0, 300, 0).slice(0, 5))).toBeNull();
  });

  it("lineOnly keeps lines but rejects ellipses", () => {
    expect(recognizeShape(tracedLine(100, 100, 400, 160), { lineOnly: true })?.kind).toBe("line");
    expect(recognizeShape(tracedEllipse(250, 200, 150, 100), { lineOnly: true })).toBeNull();
  });
});
