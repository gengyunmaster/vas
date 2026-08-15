import { arrowHead } from "../model/shapeGeometry";
import type { Stroke } from "../model/stroke";

export function shapePath(stroke: Stroke): Path2D | null {
  const [a, b] = stroke.points;
  if (!stroke.shape || !a || !b) return null;
  const path = new Path2D();
  switch (stroke.shape) {
    case "line":
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
      break;
    case "arrow": {
      const [left, right] = arrowHead(a, b, stroke.size);
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
      path.moveTo(left.x, left.y);
      path.lineTo(b.x, b.y);
      path.lineTo(right.x, right.y);
      break;
    }
    case "rect":
      path.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      break;
    case "ellipse":
      path.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
      break;
  }
  return path;
}
