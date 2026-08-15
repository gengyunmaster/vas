import { PAGE_HEIGHT, PAGE_WIDTH, type PagePattern } from "./page";

export const PATTERN_MARGIN = 48;
export const PATTERN_SPACING = 56;
export const RICE_CELL = 96;
export const PATTERN_DASH = [6, 4] as const;

export interface PatternLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
}

export interface PatternDot {
  x: number;
  y: number;
}

export interface PatternLayout {
  lines: PatternLine[];
  dots: PatternDot[];
}

export function patternLayout(pattern: PagePattern): PatternLayout {
  switch (pattern) {
    case "blank":
      return { lines: [], dots: [] };
    case "lined":
      return { lines: linedLines(), dots: [] };
    case "grid":
      return { lines: gridLines(), dots: [] };
    case "dots":
      return { lines: [], dots: dotLattice() };
    case "rice":
      return { lines: riceLines(), dots: [] };
  }
}

function centeredSpan(total: number, spacing: number): { start: number; cells: number } {
  const usable = total - 2 * PATTERN_MARGIN;
  const cells = Math.max(1, Math.floor(usable / spacing));
  return { start: (total - cells * spacing) / 2, cells };
}

function linedLines(): PatternLine[] {
  const lines: PatternLine[] = [];
  for (
    let y = PATTERN_MARGIN + PATTERN_SPACING;
    y <= PAGE_HEIGHT - PATTERN_MARGIN;
    y += PATTERN_SPACING
  ) {
    lines.push({
      x1: PATTERN_MARGIN,
      y1: y,
      x2: PAGE_WIDTH - PATTERN_MARGIN,
      y2: y,
      dashed: false,
    });
  }
  return lines;
}

function gridLines(): PatternLine[] {
  const { start: startX, cells: cols } = centeredSpan(PAGE_WIDTH, PATTERN_SPACING);
  const { start: startY, cells: rows } = centeredSpan(PAGE_HEIGHT, PATTERN_SPACING);
  const endX = startX + cols * PATTERN_SPACING;
  const endY = startY + rows * PATTERN_SPACING;
  const lines: PatternLine[] = [];
  for (let k = 0; k <= cols; k++) {
    const x = startX + k * PATTERN_SPACING;
    lines.push({ x1: x, y1: startY, x2: x, y2: endY, dashed: false });
  }
  for (let k = 0; k <= rows; k++) {
    const y = startY + k * PATTERN_SPACING;
    lines.push({ x1: startX, y1: y, x2: endX, y2: y, dashed: false });
  }
  return lines;
}

function dotLattice(): PatternDot[] {
  const { start: startX, cells: cols } = centeredSpan(PAGE_WIDTH, PATTERN_SPACING);
  const { start: startY, cells: rows } = centeredSpan(PAGE_HEIGHT, PATTERN_SPACING);
  const dots: PatternDot[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      dots.push({
        x: startX + col * PATTERN_SPACING,
        y: startY + row * PATTERN_SPACING,
      });
    }
  }
  return dots;
}

function riceLines(): PatternLine[] {
  const { start: startX, cells: cols } = centeredSpan(PAGE_WIDTH, RICE_CELL);
  const { start: startY, cells: rows } = centeredSpan(PAGE_HEIGHT, RICE_CELL);
  const endX = startX + cols * RICE_CELL;
  const endY = startY + rows * RICE_CELL;
  const lines: PatternLine[] = [];

  for (let k = 0; k <= cols; k++) {
    const x = startX + k * RICE_CELL;
    lines.push({ x1: x, y1: startY, x2: x, y2: endY, dashed: false });
  }
  for (let k = 0; k <= rows; k++) {
    const y = startY + k * RICE_CELL;
    lines.push({ x1: startX, y1: y, x2: endX, y2: y, dashed: false });
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = startX + col * RICE_CELL;
      const y = startY + row * RICE_CELL;
      const midX = x + RICE_CELL / 2;
      const midY = y + RICE_CELL / 2;
      lines.push({ x1: x, y1: midY, x2: x + RICE_CELL, y2: midY, dashed: true });
      lines.push({ x1: midX, y1: y, x2: midX, y2: y + RICE_CELL, dashed: true });
      lines.push({ x1: x, y1: y, x2: x + RICE_CELL, y2: y + RICE_CELL, dashed: true });
      lines.push({ x1: x, y1: y + RICE_CELL, x2: x + RICE_CELL, y2: y, dashed: true });
    }
  }
  return lines;
}
