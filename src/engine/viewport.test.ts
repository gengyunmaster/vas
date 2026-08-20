import { describe, expect, it } from "vitest";
import { contentHeight, PAGE_GAP, PAGE_HEIGHT, PAGE_WIDTH, pageTopY } from "../model/page";
import {
  clampScale,
  createViewport,
  fitScale,
  panBy,
  presentationViewport,
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

  it("fills a landscape screen height and centers horizontally", () => {
    const landscape: ScreenSize = { width: 1920, height: 1080 };
    const vp = presentationViewport(landscape, 0);
    expect(vp.scale).toBeCloseTo(landscape.height / PAGE_HEIGHT);
    expect((PAGE_WIDTH - vp.x) * vp.scale).toBeCloseTo(
      (PAGE_WIDTH * vp.scale + landscape.width) / 2,
    );
    expect(vp.y).toBeCloseTo(pageTopY(0));
  });

  it("fills a portrait screen width and centers vertically", () => {
    const portrait: ScreenSize = { width: 390, height: 844 };
    const vp = presentationViewport(portrait, 0);
    expect(vp.scale).toBeCloseTo(portrait.width / PAGE_WIDTH);
    expect(vp.x).toBeCloseTo(0);
    const pageTopOnScreen = (pageTopY(0) - vp.y) * vp.scale;
    const pageBottomOnScreen = pageTopOnScreen + PAGE_HEIGHT * vp.scale;
    expect(pageTopOnScreen).toBeCloseTo(portrait.height - pageBottomOnScreen);
  });

  it("steps one page per index", () => {
    const vp0 = presentationViewport(screen, 0);
    const vp2 = presentationViewport(screen, 2);
    expect(vp2.scale).toBeCloseTo(vp0.scale);
    expect(vp2.x).toBeCloseTo(vp0.x);
    expect(vp2.y - vp0.y).toBeCloseTo(2 * (PAGE_HEIGHT + PAGE_GAP));
  });
});
