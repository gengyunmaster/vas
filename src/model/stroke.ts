export type PenKind = "pen" | "highlighter";

export const HIGHLIGHTER_SIZE_FACTOR = 2.2;

export const SHAPE_KINDS = ["line", "arrow", "rect", "ellipse"] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const TOOL_KINDS = [
  "pen",
  "highlighter",
  "eraser",
  "laser",
  "select",
  "text",
  ...SHAPE_KINDS,
] as const;

export type ToolKind = (typeof TOOL_KINDS)[number];

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  tilt?: number;
}

export interface Stroke {
  id: string;
  pen: PenKind;
  color: string;
  size: number;
  simulatePressure: boolean;
  points: StrokePoint[];
  shape?: ShapeKind;
  dash?: boolean;
}

export function createStroke(input: Omit<Stroke, "id">): Stroke {
  return { ...input, id: newId() };
}

export function effectiveStrokeSize(stroke: Stroke): number {
  return stroke.pen === "highlighter" ? stroke.size * HIGHLIGHTER_SIZE_FACTOR : stroke.size;
}

// Dashed strokes render their centerline instead of a filled outline.
export function strokeDashArray(stroke: Stroke): [number, number] {
  const width = stroke.shape ? stroke.size : effectiveStrokeSize(stroke);
  return [width * 3, width * 2];
}

// Combined stylus tilt as a 0..1 magnitude (0 = perpendicular to the screen).
export function tiltMagnitude(tiltX: number, tiltY: number): number {
  const combined = (Math.abs(tiltX) + Math.abs(tiltY)) / 2;
  return Math.min(1, combined / 60);
}

// A tilted highlighter lays ink with its side nib: widen by boosting the
// effective pressure. perfect-freehand only accepts per-point pressure, so
// tilt travels through it.
export function tiltBoostedPressure(point: StrokePoint): number {
  if (!point.tilt) return point.pressure;
  return Math.min(1, point.pressure * (1 + point.tilt * 0.8));
}

let idCounter = 0;

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
