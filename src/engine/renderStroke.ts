import { getStroke } from "perfect-freehand";
import {
  effectiveStrokeSize,
  type Stroke,
  strokeDashArray,
  tiltBoostedPressure,
} from "../model/stroke";
import { shapePath } from "./shapes";

const PEN_OPTIONS = { thinning: 0.75, smoothing: 0.5, streamline: 0.5 };
const HIGHLIGHTER_OPTIONS = { thinning: 0.35, smoothing: 0.6, streamline: 0.5 };
export const HIGHLIGHTER_ALPHA = 0.35;

export function getOutlinePoints(stroke: Stroke, complete = true): number[][] {
  const base = stroke.pen === "highlighter" ? HIGHLIGHTER_OPTIONS : PEN_OPTIONS;
  const points =
    stroke.pen === "highlighter" && stroke.points.some((p) => p.tilt)
      ? stroke.points.map((p) => ({ ...p, pressure: tiltBoostedPressure(p) }))
      : stroke.points;
  return getStroke(points, {
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
    if (stroke.dash) ctx.setLineDash(strokeDashArray(stroke));
    ctx.stroke(path);
    ctx.restore();
    return;
  }
  if (stroke.dash && stroke.pen === "pen") {
    drawDashedCenterline(ctx, stroke);
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

function drawDashedCenterline(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const [first] = stroke.points;
  if (!first) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  const width = effectiveStrokeSize(stroke);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (stroke.points.length < 2) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.setLineDash(strokeDashArray(stroke));
  const path = new Path2D();
  path.moveTo(first.x, first.y);
  for (let i = 1; i < stroke.points.length; i++) {
    path.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke(path);
  ctx.restore();
}
