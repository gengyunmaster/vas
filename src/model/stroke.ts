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
}

export interface Stroke {
  id: string;
  pen: PenKind;
  color: string;
  size: number;
  simulatePressure: boolean;
  points: StrokePoint[];
  shape?: ShapeKind;
}

export function createStroke(input: Omit<Stroke, "id">): Stroke {
  return { ...input, id: newId() };
}

export function effectiveStrokeSize(stroke: Stroke): number {
  return stroke.pen === "highlighter" ? stroke.size * HIGHLIGHTER_SIZE_FACTOR : stroke.size;
}

let idCounter = 0;

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
