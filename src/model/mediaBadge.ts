import type { AudioItem } from "./audioItem";
import { isDarkColor } from "./color";

// The audio badge is procedural (no bitmap asset) so it stays vector in every
// export format and adapts to the page's paper color.
export interface BadgePalette {
  background: string;
  icon: string;
  onIcon: string;
  track: string;
}

export function badgePalette(paperColor: string): BadgePalette {
  return isDarkColor(paperColor)
    ? {
        background: "rgba(255, 255, 255, 0.16)",
        icon: "#f5f5f5",
        onIcon: "#26262a",
        track: "rgba(255, 255, 255, 0.4)",
      }
    : {
        background: "rgba(0, 0, 0, 0.08)",
        icon: "#1a1a1a",
        onIcon: "#ffffff",
        track: "rgba(0, 0, 0, 0.28)",
      };
}

interface BadgeGeometry {
  radius: number;
  circleX: number;
  circleY: number;
  circleR: number;
  triangle: [number, number][];
  trackX1: number;
  trackX2: number;
  trackY: number;
  trackWidth: number;
  headR: number;
}

function badgeGeometry(item: AudioItem): BadgeGeometry {
  const h = item.height;
  const circleX = item.x + h / 2;
  const circleY = item.y + h / 2;
  const circleR = h * 0.3;
  const t = circleR * 0.95;
  return {
    radius: h / 2,
    circleX,
    circleY,
    circleR,
    triangle: [
      [circleX - t * 0.4, circleY - t * 0.62],
      [circleX - t * 0.4, circleY + t * 0.62],
      [circleX + t * 0.7, circleY],
    ],
    trackX1: item.x + h * 0.95,
    trackX2: item.x + item.width - h * 0.4,
    trackY: circleY,
    trackWidth: Math.max(2, h * 0.07),
    headR: h * 0.1,
  };
}

export function badgeToSvgElements(item: AudioItem, paperColor: string): string[] {
  const palette = badgePalette(paperColor);
  const g = badgeGeometry(item);
  const triangle = g.triangle.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
  return [
    `<rect x="${fmt(item.x)}" y="${fmt(item.y)}" width="${fmt(item.width)}" height="${fmt(item.height)}" rx="${fmt(g.radius)}" fill="${palette.background}"/>`,
    `<circle cx="${fmt(g.circleX)}" cy="${fmt(g.circleY)}" r="${fmt(g.circleR)}" fill="${palette.icon}"/>`,
    `<polygon points="${triangle}" fill="${palette.onIcon}"/>`,
    `<line x1="${fmt(g.trackX1)}" y1="${fmt(g.trackY)}" x2="${fmt(g.trackX2)}" y2="${fmt(g.trackY)}" stroke="${palette.track}" stroke-width="${fmt(g.trackWidth)}" stroke-linecap="round"/>`,
    `<circle cx="${fmt(g.trackX1)}" cy="${fmt(g.trackY)}" r="${fmt(g.headR)}" fill="${palette.icon}"/>`,
  ];
}

export function paintBadge(
  ctx: CanvasRenderingContext2D,
  item: AudioItem,
  paperColor: string,
): void {
  const palette = badgePalette(paperColor);
  const g = badgeGeometry(item);
  ctx.save();
  ctx.fillStyle = palette.background;
  ctx.beginPath();
  ctx.roundRect(item.x, item.y, item.width, item.height, g.radius);
  ctx.fill();
  ctx.fillStyle = palette.icon;
  ctx.beginPath();
  ctx.arc(g.circleX, g.circleY, g.circleR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.onIcon;
  ctx.beginPath();
  ctx.moveTo(g.triangle[0][0], g.triangle[0][1]);
  ctx.lineTo(g.triangle[1][0], g.triangle[1][1]);
  ctx.lineTo(g.triangle[2][0], g.triangle[2][1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.track;
  ctx.lineWidth = g.trackWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(g.trackX1, g.trackY);
  ctx.lineTo(g.trackX2, g.trackY);
  ctx.stroke();
  ctx.fillStyle = palette.icon;
  ctx.beginPath();
  ctx.arc(g.trackX1, g.trackY, g.headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}
