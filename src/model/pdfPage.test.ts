import { describe, expect, it } from "vitest";
import { PAGE_GAP, PAGE_HEIGHT, PAGE_TOP_MARGIN, pageTopY } from "./page";
import { buildPdfPages, pdfInsertIndex } from "./pdfPage";

const rasters = [
  { imageId: "img-a", naturalWidth: 800, naturalHeight: 600 },
  { imageId: "img-b", naturalWidth: 600, naturalHeight: 900 },
];

describe("buildPdfPages", () => {
  it("builds locked full-page images inheriting paper and pattern", () => {
    const pages = buildPdfPages(rasters, "#003423", "grid", "doc-1");
    expect(pages).toHaveLength(2);
    for (const [index, page] of pages.entries()) {
      expect(page.paperColor).toBe("#003423");
      expect(page.pattern).toBe("grid");
      expect(page.strokes).toEqual([]);
      expect(page.images).toHaveLength(1);
      expect(page.images[0].locked).toBe(true);
      expect(page.images[0].imageId).toBe(rasters[index].imageId);
      expect(page.pdfSource).toEqual({ docId: "doc-1", pageIndex: index });
    }
  });

  it("centers each image within the page bounds", () => {
    const pages = buildPdfPages(rasters, "#ffffff", "blank");
    for (const page of pages) {
      const image = page.images[0];
      expect(image.x).toBeGreaterThanOrEqual(0);
      expect(image.y).toBeGreaterThanOrEqual(0);
      expect(image.x + image.width).toBeLessThanOrEqual(794);
      expect(image.y + image.height).toBeLessThanOrEqual(1123);
    }
    expect(pages[0].pdfSource).toBeUndefined();
  });

  it("gives every page and image a unique id", () => {
    const pages = buildPdfPages(rasters, "#ffffff", "blank", "doc-1");
    const ids = new Set([...pages.map((p) => p.id), ...pages.map((p) => p.images[0].id)]);
    expect(ids.size).toBe(4);
  });
});

describe("pdfInsertIndex", () => {
  const pageCount = 5;

  it("appends at the end when no view state is saved", () => {
    expect(pdfInsertIndex(undefined, pageCount)).toBe(pageCount);
  });

  it("inserts after the page containing the saved viewport top", () => {
    expect(pdfInsertIndex({ x: 0, y: pageTopY(2) + 100, zoom: 1 }, pageCount)).toBe(3);
    expect(pdfInsertIndex({ x: 0, y: pageTopY(0), zoom: 1 }, pageCount)).toBe(1);
  });

  it("clamps positions beyond the last page to an append", () => {
    const beyond = PAGE_TOP_MARGIN + pageCount * (PAGE_HEIGHT + PAGE_GAP);
    expect(pdfInsertIndex({ x: 0, y: beyond, zoom: 1 }, pageCount)).toBe(pageCount);
  });

  it("falls back to append for invalid view state", () => {
    expect(pdfInsertIndex({ x: 0, y: Number.NaN, zoom: 1 }, pageCount)).toBe(pageCount);
  });
});
