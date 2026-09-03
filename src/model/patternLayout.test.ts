import { describe, expect, it } from "vitest";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./page";
import {
  PATTERN_MARGIN,
  PATTERN_SPACING,
  patternLayout,
  RICE_CELL,
  STAFF_GROUP_GAP,
  STAFF_LINE_GAP,
} from "./patternLayout";

describe("patternLayout", () => {
  it("blank has no geometry", () => {
    expect(patternLayout("blank", PAGE_WIDTH, PAGE_HEIGHT)).toEqual({ lines: [], dots: [] });
  });

  it("lined lines stay within margins and keep a larger top gap", () => {
    const { lines, dots } = patternLayout("lined", PAGE_WIDTH, PAGE_HEIGHT);
    expect(dots).toHaveLength(0);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      expect(line.y1).toBe(line.y2);
      expect(line.dashed).toBe(false);
      expect(line.x1).toBe(PATTERN_MARGIN);
      expect(line.x2).toBe(PAGE_WIDTH - PATTERN_MARGIN);
    }
    expect(lines[1].y1 - lines[0].y1).toBe(PATTERN_SPACING);
    const topGap = lines[0].y1;
    const bottomGap = PAGE_HEIGHT - lines[lines.length - 1].y1;
    expect(topGap).toBeGreaterThan(bottomGap);
    expect(topGap).toBe(PATTERN_MARGIN + PATTERN_SPACING);
  });

  it("grid draws only complete cells, centered on the page", () => {
    const { lines } = patternLayout("grid", PAGE_WIDTH, PAGE_HEIGHT);
    const vertical = lines.filter((l) => l.x1 === l.x2);
    const horizontal = lines.filter((l) => l.y1 === l.y2);
    const cols = vertical.length - 1;
    const rows = horizontal.length - 1;
    const minX = Math.min(...vertical.map((l) => l.x1));
    const maxX = Math.max(...vertical.map((l) => l.x1));
    const minY = Math.min(...horizontal.map((l) => l.y1));
    const maxY = Math.max(...horizontal.map((l) => l.y1));
    expect((maxX - minX) % PATTERN_SPACING).toBe(0);
    expect((maxY - minY) % PATTERN_SPACING).toBe(0);
    expect(maxX - minX).toBe(cols * PATTERN_SPACING);
    expect(maxY - minY).toBe(rows * PATTERN_SPACING);
    expect(minX).toBeCloseTo(PAGE_WIDTH - maxX, 5);
    expect(minY).toBeCloseTo(PAGE_HEIGHT - maxY, 5);
    expect(minX).toBeGreaterThanOrEqual(PATTERN_MARGIN);
    expect(minY).toBeGreaterThanOrEqual(PATTERN_MARGIN);
  });

  it("grid keeps the same spacing on a smaller page", () => {
    const { lines } = patternLayout("grid", 400, 300);
    const vertical = lines.filter((l) => l.x1 === l.x2);
    const horizontal = lines.filter((l) => l.y1 === l.y2);
    const minX = Math.min(...vertical.map((l) => l.x1));
    const maxX = Math.max(...vertical.map((l) => l.x1));
    const minY = Math.min(...horizontal.map((l) => l.y1));
    const maxY = Math.max(...horizontal.map((l) => l.y1));
    expect((maxX - minX) % PATTERN_SPACING).toBe(0);
    expect(minX).toBeCloseTo(400 - maxX, 5);
    expect(minY).toBeCloseTo(300 - maxY, 5);
  });

  it("dots form a centered lattice within margins", () => {
    const { lines, dots } = patternLayout("dots", PAGE_WIDTH, PAGE_HEIGHT);
    expect(lines).toHaveLength(0);
    expect(dots.length).toBeGreaterThan(50);
    const minX = Math.min(...dots.map((d) => d.x));
    const maxX = Math.max(...dots.map((d) => d.x));
    const minY = Math.min(...dots.map((d) => d.y));
    const maxY = Math.max(...dots.map((d) => d.y));
    expect(minX).toBeCloseTo(PAGE_WIDTH - maxX, 5);
    expect(minY).toBeCloseTo(PAGE_HEIGHT - maxY, 5);
    expect(minX).toBeGreaterThanOrEqual(PATTERN_MARGIN);
    expect(minY).toBeGreaterThanOrEqual(PATTERN_MARGIN);
    expect(maxX).toBeLessThanOrEqual(PAGE_WIDTH - PATTERN_MARGIN);
    expect(maxY).toBeLessThanOrEqual(PAGE_HEIGHT - PATTERN_MARGIN);
  });

  it("rice produces a solid grid with dashed cell guides", () => {
    const { lines } = patternLayout("rice", PAGE_WIDTH, PAGE_HEIGHT);
    const cols = Math.floor((PAGE_WIDTH - 2 * PATTERN_MARGIN) / RICE_CELL);
    const rows = Math.floor((PAGE_HEIGHT - 2 * PATTERN_MARGIN) / RICE_CELL);
    const solid = lines.filter((l) => !l.dashed);
    const dashed = lines.filter((l) => l.dashed);
    expect(solid).toHaveLength(cols + 1 + rows + 1);
    expect(dashed).toHaveLength(cols * rows * 4);
    const xs = solid.map((l) => l.x1);
    const ys = solid.map((l) => l.y1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(PATTERN_MARGIN);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(PATTERN_MARGIN);
  });

  it("centers the rice grid on the page", () => {
    const { lines } = patternLayout("rice", PAGE_WIDTH, PAGE_HEIGHT);
    const solid = lines.filter((l) => !l.dashed);
    const minX = Math.min(...solid.map((l) => l.x1));
    const maxX = Math.max(...solid.map((l) => l.x2));
    expect(minX - 0).toBeCloseTo(PAGE_WIDTH - maxX, 5);
  });

  it("staff groups lines into five-line staves centered on the page", () => {
    const { lines, dots } = patternLayout("staff", PAGE_WIDTH, PAGE_HEIGHT);
    expect(dots).toHaveLength(0);
    expect(lines.length % 5).toBe(0);
    expect(lines.length).toBeGreaterThanOrEqual(10);
    for (const line of lines) {
      expect(line.y1).toBe(line.y2);
      expect(line.x1).toBe(PATTERN_MARGIN);
      expect(line.x2).toBe(PAGE_WIDTH - PATTERN_MARGIN);
    }
    expect(lines[1].y1 - lines[0].y1).toBe(STAFF_LINE_GAP);
    const staves = lines.length / 5;
    const groupGap = lines[5].y1 - lines[4].y1;
    expect(groupGap).toBe(STAFF_GROUP_GAP);
    const topGap = lines[0].y1;
    const bottomGap = PAGE_HEIGHT - lines[lines.length - 1].y1;
    expect(topGap).toBeCloseTo(bottomGap, 5);
    expect(staves).toBeGreaterThan(5);
  });

  it("staff fits no stave on a page too small", () => {
    expect(patternLayout("staff", PAGE_WIDTH, PATTERN_MARGIN * 2 + 10).lines).toHaveLength(0);
  });

  it("cornell draws ruled lines plus a cue and a summary divider", () => {
    const { lines, dots } = patternLayout("cornell", PAGE_WIDTH, PAGE_HEIGHT);
    expect(dots).toHaveLength(0);
    const strong = lines.filter((l) => l.strong);
    expect(strong).toHaveLength(2);
    const cue = strong.find((l) => l.x1 === l.x2);
    const summary = strong.find((l) => l.y1 === l.y2);
    expect(cue).toBeDefined();
    expect(summary).toBeDefined();
    expect(cue?.x1).toBeCloseTo(PATTERN_MARGIN + 0.3 * (PAGE_WIDTH - 2 * PATTERN_MARGIN), 5);
    expect(summary?.y1).toBeCloseTo(PATTERN_MARGIN + 0.8 * (PAGE_HEIGHT - 2 * PATTERN_MARGIN), 5);
    const ruled = lines.filter((l) => !l.strong);
    expect(ruled.length).toBeGreaterThan(5);
    for (const line of ruled) {
      expect(line.dashed).toBe(false);
      expect(line.y2).toBeLessThan(summary?.y1 ?? 0);
    }
  });
});
