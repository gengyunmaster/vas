import { isDarkColor } from "../model/color";
import type { PagePattern } from "../model/page";
import { PATTERN_DASH, patternLayout } from "../model/patternLayout";

export function drawPagePattern(
  ctx: CanvasRenderingContext2D,
  pattern: PagePattern,
  paperColor: string,
): void {
  if (pattern === "blank") return;
  const { lines, dots } = patternLayout(pattern);
  const dark = isDarkColor(paperColor);
  const color = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.16)";
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (const line of lines) {
    if (line.dashed) continue;
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
  }
  ctx.stroke();

  ctx.setLineDash([...PATTERN_DASH]);
  ctx.beginPath();
  for (const line of lines) {
    if (!line.dashed) continue;
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const dot of dots) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
