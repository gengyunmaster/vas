export interface Point {
  x: number;
  y: number;
}

export const ELLIPSE_OUTLINE_SEGMENTS = 32;

export function arrowHead(a: Point, b: Point, size: number): [Point, Point] {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const length = Math.max(10, size * 4);
  const spread = Math.PI / 7;
  return [
    { x: b.x - length * Math.cos(angle - spread), y: b.y - length * Math.sin(angle - spread) },
    { x: b.x - length * Math.cos(angle + spread), y: b.y - length * Math.sin(angle + spread) },
  ];
}

export function ellipseOutline(a: Point, b: Point, segments = ELLIPSE_OUTLINE_SEGMENTS): Point[] {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}
