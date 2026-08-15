import { getStroke } from "perfect-freehand";
import { effectiveStrokeSize, type Stroke } from "../model/stroke";
import { shapePath } from "./shapes";

const PEN_OPTIONS = { thinning: 0.75, smoothing: 0.5, streamline: 0.5 };
const HIGHLIGHTER_OPTIONS = { thinning: 0.35, smoothing: 0.6, streamline: 0.5 };
export const HIGHLIGHTER_ALPHA = 0.35;

export function getOutlinePoints(stroke: Stroke, complete = true): number[][] {
  const base = stroke.pen === "highlighter" ? HIGHLIGHTER_OPTIONS : PEN_OPTIONS;
  return getStroke(stroke.points, {
    ...base,
    size: effectiveStrokeSize(stroke),
    simulatePressure: stroke.simulatePressure,
    last: complete,
  });
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, complete = true): void {
  if (stroke.shape) {
    const path = shapePath(stroke);
    if (!path) return;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(path);
    ctx.restore();
    return;
  }
  const outline = getOutlinePoints(stroke, complete);
  if (outline.length === 0) return;
  const path = new Path2D();
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    path.lineTo(outline[i][0], outline[i][1]);
  }
  path.closePath();
  ctx.save();
  if (stroke.pen === "highlighter") ctx.globalAlpha = HIGHLIGHTER_ALPHA;
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
  ctx.restore();
}
