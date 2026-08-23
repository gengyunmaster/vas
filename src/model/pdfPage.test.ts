import { describe, expect, it } from "vitest";
import { createPage, PAGE_GAP, PAGE_TOP_MARGIN, type Page, pageTopY } from "./page";
import { buildPdfPages, pdfInsertIndex } from "./pdfPage";

const rasters = [
  { imageId: "img-a", naturalWidth: 800, naturalHeight: 600 },
  { imageId: "img-b", naturalWidth: 600, naturalHeight: 900 },
];

const a4 = () => ({ width: 794, height: 1123 });

describe("buildPdfPages", () => {
  it("builds locked full-page images inheriting paper and pattern", () => {
    const pages = buildPdfPages(rasters, "#003423", "grid", a4, "doc-1");
    expect(pages).toHaveLength(2);
    for (const [index, page] of pages.entries()) {
      expect(page.paperColor).toBe("#003423");
      expect(page.pattern).toBe("grid");
      expect(page.width).toBe(794);
      expect(page.height).toBe(1123);
      expect(page.strokes).toEqual([]);
      expect(page.images).toHaveLength(1);
      expect(page.images[0].locked).toBe(true);
      expect(page.images[0].imageId).toBe(rasters[index].imageId);
      expect(page.pdfSource).toEqual({ docId: "doc-1", pageIndex: index });
    }
  });

  it("centers each image within the page bounds", () => {
    const pages = buildPdfPages(rasters, "#ffffff", "blank", a4);
    for (const page of pages) {
      const image = page.images[0];
      expect(image.x).toBeGreaterThanOrEqual(0);
      expect(image.y).toBeGreaterThanOrEqual(0);
      expect(image.x + image.width).toBeLessThanOrEqual(page.width);
      expect(image.y + image.height).toBeLessThanOrEqual(page.height);
    }
    expect(pages[0].pdfSource).toBeUndefined();
  });

  it("sizes each page via the sizeFor callback", () => {
    const pages = buildPdfPages(
      rasters,
      "#ffffff",
      "blank",
      (pdfPage) => ({ width: pdfPage.naturalWidth, height: pdfPage.naturalHeight }),
      "doc-1",
    );
    expect(pages[0].width).toBe(800);
    expect(pages[0].height).toBe(600);
    expect(pages[1].width).toBe(600);
    expect(pages[1].height).toBe(900);
    expect(pages[0].images[0].x).toBeCloseTo(0);
    expect(pages[0].images[0].y).toBeCloseTo(0);
  });

  it("gives every page and image a unique id", () => {
    const pages = buildPdfPages(rasters, "#ffffff", "blank", a4, "doc-1");
    const ids = new Set([...pages.map((p) => p.id), ...pages.map((p) => p.images[0].id)]);
    expect(ids.size).toBe(4);
  });
});

describe("pdfInsertIndex", () => {
  const pages: Page[] = Array.from({ length: 5 }, () => createPage("#ffffff"));

  it("appends at the end when no view state is saved", () => {
    expect(pdfInsertIndex(undefined, pages)).toBe(pages.length);
  });

  it("inserts after the page containing the saved viewport top", () => {
    expect(pdfInsertIndex({ x: 0, y: pageTopY(pages, 2) + 100, zoom: 1 }, pages)).toBe(3);
    expect(pdfInsertIndex({ x: 0, y: pageTopY(pages, 0), zoom: 1 }, pages)).toBe(1);
  });

  it("clamps positions beyond the last page to an append", () => {
    const beyond = PAGE_TOP_MARGIN + 5 * (1123 + PAGE_GAP);
    expect(pdfInsertIndex({ x: 0, y: beyond, zoom: 1 }, pages)).toBe(pages.length);
  });

  it("falls back to append for invalid view state", () => {
    expect(pdfInsertIndex({ x: 0, y: Number.NaN, zoom: 1 }, pages)).toBe(pages.length);
  });
});
