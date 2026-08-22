import { describe, expect, it } from "vitest";
import {
  boardWidth,
  contentHeight,
  createPage,
  PAGE_GAP,
  PAGE_HEIGHT,
  PAGE_TOP_MARGIN,
  PAGE_WIDTH,
  type Page,
  pageTopY,
} from "../model/page";
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

function uniformPages(count: number): Page[] {
  return Array.from({ length: count }, () => createPage("#ffffff"));
}

describe("viewport", () => {
  it("fits the board width with margins", () => {
    const scale = fitScale(screen.width, PAGE_WIDTH);
    expect(scale * (PAGE_WIDTH + 24)).toBeCloseTo(screen.width);
  });

  it("fits the widest page when sizes differ", () => {
    const pages = [
      ...uniformPages(1),
      createPage("#ffffff", "blank", { width: 1200, height: 800 }),
    ];
    expect(boardWidth(pages)).toBe(1200);
    expect(fitScale(screen.width, boardWidth(pages)) * (1200 + 24)).toBeCloseTo(screen.width);
  });

  it("centers the board horizontally at fit scale", () => {
    const vp = createViewport(screen, uniformPages(1));
    expect(vp.x).toBeCloseTo((PAGE_WIDTH - screen.width / vp.scale) / 2);
  });

  it("top-aligns content taller than the screen", () => {
    const vp = createViewport(screen, uniformPages(5));
    expect(vp.y).toBe(0);
  });

  it("keeps the focal point stable while zooming", () => {
    const pages = uniformPages(3);
    const vp = createViewport(screen, pages);
    const focal = { x: 400, y: 500 };
    const before = screenToWorld(vp, focal.x, focal.y);
    const zoomed = zoomAt(vp, focal, vp.scale * 2, screen, pages);
    const after = screenToWorld(zoomed, focal.x, focal.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom to the allowed range", () => {
    const fit = fitScale(screen.width, PAGE_WIDTH);
    expect(clampScale(fit * 0.5, screen.width, PAGE_WIDTH)).toBe(fit);
    expect(clampScale(fit * 99, screen.width, PAGE_WIDTH)).toBe(fit * 20);
  });

  it("clamps panning to the content bounds", () => {
    const pages = uniformPages(3);
    const vp = createViewport(screen, pages);
    expect(panBy(vp, 0, 100, screen, pages).y).toBe(0);
    const bottom = panBy(vp, 0, -100000, screen, pages);
    expect(bottom.y).toBeCloseTo(contentHeight(pages) - screen.height / bottom.scale);
  });

  it("reports the visible page range", () => {
    const pages = uniformPages(10);
    const vp: Viewport = { x: 0, y: 0, scale: fitScale(screen.width, PAGE_WIDTH) };
    const range = visiblePageRange(vp, screen, pages);
    expect(range.first).toBe(0);
    expect(range.last).toBeGreaterThanOrEqual(0);
    expect(range.last).toBeLessThan(10);
  });

  it("reports the visible range across pages of different heights", () => {
    const pages = [createPage("#ffffff", "blank", { width: 400, height: 300 }), ...uniformPages(3)];
    const tops = pageTopY(pages, 1);
    const vp: Viewport = {
      x: 0,
      y: tops - 10,
      scale: fitScale(screen.width, PAGE_WIDTH),
    };
    const range = visiblePageRange(vp, screen, pages);
    expect(range.first).toBe(0);
    expect(range.last).toBeGreaterThanOrEqual(1);
  });

  it("fills a landscape screen height and centers horizontally", () => {
    const landscape: ScreenSize = { width: 1920, height: 1080 };
    const page = createPage("#ffffff");
    const vp = presentationViewport(landscape, page, 0, PAGE_TOP_MARGIN);
    expect(vp.scale).toBeCloseTo(landscape.height / PAGE_HEIGHT);
    expect((PAGE_WIDTH / 2 - vp.x) * vp.scale).toBeCloseTo(landscape.width / 2);
    expect(vp.y).toBeCloseTo(PAGE_TOP_MARGIN);
  });

  it("fills a portrait screen width and centers vertically", () => {
    const portrait: ScreenSize = { width: 390, height: 844 };
    const page = createPage("#ffffff");
    const vp = presentationViewport(portrait, page, 0, PAGE_TOP_MARGIN);
    expect(vp.scale).toBeCloseTo(portrait.width / PAGE_WIDTH);
    expect((PAGE_TOP_MARGIN + PAGE_HEIGHT / 2 - vp.y) * vp.scale).toBeCloseTo(portrait.height / 2);
  });

  it("fits each page by its own size in presentation", () => {
    const wide = createPage("#ffffff", "blank", { width: 1600, height: 800 });
    const vp = presentationViewport(screen, wide, 0, PAGE_TOP_MARGIN);
    expect(vp.scale).toBeCloseTo(screen.width / 1600);
    expect((PAGE_TOP_MARGIN + 400 - vp.y) * vp.scale).toBeCloseTo(screen.height / 2);
  });

  it("steps one page per index", () => {
    const pages = uniformPages(3);
    const vp0 = presentationViewport(screen, pages[0], 0, pageTopY(pages, 0));
    const vp2 = presentationViewport(screen, pages[2], 0, pageTopY(pages, 2));
    expect(vp2.scale).toBeCloseTo(vp0.scale);
    expect(vp2.x).toBeCloseTo(vp0.x);
    expect(vp2.y - vp0.y).toBeCloseTo(2 * (PAGE_HEIGHT + PAGE_GAP));
  });
});
