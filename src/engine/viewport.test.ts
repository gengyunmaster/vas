import { describe, expect, it } from "vitest";
import { contentHeight, PAGE_WIDTH } from "../model/page";
import {
  clampScale,
  createViewport,
  fitScale,
  panBy,
  type ScreenSize,
  screenToWorld,
  type Viewport,
  visiblePageRange,
  zoomAt,
} from "./viewport";

const screen: ScreenSize = { width: 818, height: 1000 };

describe("viewport", () => {
  it("fits the page width with margins", () => {
    const scale = fitScale(screen.width);
    expect(scale * (PAGE_WIDTH + 24)).toBeCloseTo(screen.width);
  });

  it("centers the page horizontally at fit scale", () => {
    const vp = createViewport(screen, 1);
    expect(vp.x).toBeCloseTo((PAGE_WIDTH - screen.width / vp.scale) / 2);
  });

  it("top-aligns content taller than the screen", () => {
    const vp = createViewport(screen, 5);
    expect(vp.y).toBe(0);
  });

  it("keeps the focal point stable while zooming", () => {
    const vp = createViewport(screen, 3);
    const focal = { x: 400, y: 500 };
    const before = screenToWorld(vp, focal.x, focal.y);
    const zoomed = zoomAt(vp, focal, vp.scale * 2, screen, 3);
    const after = screenToWorld(zoomed, focal.x, focal.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom to the allowed range", () => {
    const fit = fitScale(screen.width);
    expect(clampScale(fit * 0.5, screen.width)).toBe(fit);
    expect(clampScale(fit * 99, screen.width)).toBe(fit * 20);
  });

  it("clamps panning to the content bounds", () => {
    const vp = createViewport(screen, 3);
    expect(panBy(vp, 0, 100, screen, 3).y).toBe(0);
    const bottom = panBy(vp, 0, -100000, screen, 3);
    expect(bottom.y).toBeCloseTo(contentHeight(3) - screen.height / bottom.scale);
  });

  it("reports the visible page range", () => {
    const vp: Viewport = { x: 0, y: 0, scale: fitScale(screen.width) };
    const range = visiblePageRange(vp, screen, 10);
    expect(range.first).toBe(0);
    expect(range.last).toBeGreaterThanOrEqual(0);
    expect(range.last).toBeLessThan(10);
  });
});
