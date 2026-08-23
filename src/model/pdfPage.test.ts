import { describe, expect, it } from "vitest";
import { createPage, PAGE_GAP, PAGE_TOP_MARGIN, type Page, pageTopY } from "./page";
import { buildPdfPages, normalizePageRange, pdfInsertIndex } from "./pdfPage";

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

  it("keeps explicit source page indices when importing a page range", () => {
    const ranged = rasters.map((raster, index) => ({ ...raster, pageIndex: index + 2 }));
    const pages = buildPdfPages(ranged, "#ffffff", "blank", a4, "doc-1");
    expect(pages[0].pdfSource).toEqual({ docId: "doc-1", pageIndex: 2 });
    expect(pages[1].pdfSource).toEqual({ docId: "doc-1", pageIndex: 3 });
  });
});

describe("normalizePageRange", () => {
  it("accepts a normal ascending range", () => {
    expect(normalizePageRange(3, 7, 100)).toEqual({ from: 3, to: 7 });
  });

  it("sorts a reversed range", () => {
    expect(normalizePageRange(7, 3, 100)).toEqual({ from: 3, to: 7 });
  });

  it("accepts a single page", () => {
    expect(normalizePageRange(3, 3, 100)).toEqual({ from: 3, to: 3 });
  });

  it("accepts the full range", () => {
    expect(normalizePageRange(1, 100, 100)).toEqual({ from: 1, to: 100 });
  });

  it("rejects ranges crossing the last page", () => {
    expect(normalizePageRange(91, 110, 100)).toBeNull();
  });

  it("rejects ranges fully beyond the document", () => {
    expect(normalizePageRange(101, 110, 100)).toBeNull();
  });

  it("rejects zero and negative page numbers", () => {
    expect(normalizePageRange(0, 5, 100)).toBeNull();
    expect(normalizePageRange(-3, 2, 100)).toBeNull();
  });

  it("rejects non-integer and non-finite input", () => {
    expect(normalizePageRange(2.5, 5, 100)).toBeNull();
    expect(normalizePageRange(Number.NaN, 5, 100)).toBeNull();
    expect(normalizePageRange(1, Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  it("rejects empty documents", () => {
    expect(normalizePageRange(1, 1, 0)).toBeNull();
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
