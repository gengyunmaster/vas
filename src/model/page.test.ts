import { describe, expect, it } from "vitest";
import {
  clampToPage,
  clonePageWithNewIds,
  contentHeight,
  createPage,
  PAGE_GAP,
  PAGE_HEIGHT,
  PAGE_TOP_MARGIN,
  PAGE_WIDTH,
  pageAt,
  pageIndexAtY,
  pageTopY,
  trimTrailingBlankPages,
} from "./page";

describe("page geometry", () => {
  it("computes page top offsets", () => {
    expect(pageTopY(0)).toBe(PAGE_TOP_MARGIN);
    expect(pageTopY(1)).toBe(PAGE_TOP_MARGIN + PAGE_HEIGHT + PAGE_GAP);
  });

  it("computes content height with margins and gaps", () => {
    expect(contentHeight(1)).toBe(PAGE_TOP_MARGIN + PAGE_HEIGHT + PAGE_GAP);
    expect(contentHeight(2)).toBe(PAGE_TOP_MARGIN + 2 * PAGE_HEIGHT + 2 * PAGE_GAP);
  });

  it("hits a point inside the first page", () => {
    const hit = pageAt(100, PAGE_TOP_MARGIN + 50, 3);
    expect(hit).toEqual({ index: 0, x: 100, y: 50 });
  });

  it("hits a point inside a later page", () => {
    const hit = pageAt(10, pageTopY(2) + 20, 3);
    expect(hit).toEqual({ index: 2, x: 10, y: 20 });
  });

  it("misses the gap between pages", () => {
    expect(pageAt(100, PAGE_TOP_MARGIN + PAGE_HEIGHT + 5, 3)).toBeNull();
  });

  it("misses outside the page horizontally", () => {
    expect(pageAt(-1, 100, 3)).toBeNull();
    expect(pageAt(PAGE_WIDTH + 1, 100, 3)).toBeNull();
  });

  it("misses beyond the last page", () => {
    expect(pageAt(100, pageTopY(5), 3)).toBeNull();
  });

  it("maps a world y to the nearest page index", () => {
    expect(pageIndexAtY(pageTopY(1) + 5, 3)).toBe(1);
    expect(pageIndexAtY(-100, 3)).toBe(0);
    expect(pageIndexAtY(99999, 3)).toBe(2);
  });

  it("clamps points to the page bounds", () => {
    expect(clampToPage(-5, 2000)).toEqual({ x: 0, y: PAGE_HEIGHT });
    expect(clampToPage(100, 200)).toEqual({ x: 100, y: 200 });
  });
});

describe("trimTrailingBlankPages", () => {
  const blank = (id: string) => ({
    id,
    strokes: [],
    images: [],
    paperColor: "#ffffff",
    pattern: "blank" as const,
  });
  const written = (id: string) => ({
    ...blank(id),
    strokes: [
      {
        id: `s-${id}`,
        pen: "pen" as const,
        color: "#1a1a1a",
        size: 2,
        simulatePressure: false,
        points: [{ x: 1, y: 1, pressure: 0.5 }],
      },
    ],
  });
  const imaged = (id: string) => ({
    ...blank(id),
    images: [{ id: `i-${id}`, imageId: "blob", x: 0, y: 0, width: 10, height: 10 }],
  });

  it("drops trailing blank pages", () => {
    const pages = [written("a"), blank("b"), blank("c")];
    expect(trimTrailingBlankPages(pages).map((p) => p.id)).toEqual(["a"]);
  });

  it("keeps blank pages in the middle", () => {
    const pages = [written("a"), blank("b"), written("c"), blank("d")];
    expect(trimTrailingBlankPages(pages).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps at least one page", () => {
    const pages = [blank("a"), blank("b")];
    expect(trimTrailingBlankPages(pages).map((p) => p.id)).toEqual(["a"]);
  });

  it("keeps everything when the last page has content", () => {
    const pages = [written("a"), written("b")];
    expect(trimTrailingBlankPages(pages)).toHaveLength(2);
  });

  it("treats a page with only images as content", () => {
    const pages = [written("a"), imaged("b")];
    expect(trimTrailingBlankPages(pages)).toHaveLength(2);
  });
});

describe("clonePageWithNewIds", () => {
  it("clones a page with fresh ids while preserving content and image references", () => {
    const source = {
      id: "page-1",
      paperColor: "#003423",
      pattern: "grid" as const,
      strokes: [
        {
          id: "s1",
          pen: "pen" as const,
          color: "#d64541",
          size: 3,
          simulatePressure: true,
          shape: "arrow" as const,
          points: [
            { x: 1, y: 2, pressure: 0.4 },
            { x: 30, y: 40, pressure: 0.9 },
          ],
        },
      ],
      images: [{ id: "i1", imageId: "blob-1", x: 40, y: 40, width: 100, height: 50, locked: true }],
    };
    const clone = clonePageWithNewIds(source);
    expect(clone.id).not.toBe(source.id);
    expect(clone.strokes[0].id).not.toBe("s1");
    expect(clone.images[0].id).not.toBe("i1");
    expect(clone.images[0].imageId).toBe("blob-1");
    expect(clone.paperColor).toBe("#003423");
    expect(clone.pattern).toBe("grid");
    expect(clone.strokes[0]).toMatchObject({
      pen: "pen",
      color: "#d64541",
      size: 3,
      simulatePressure: true,
      shape: "arrow",
    });
    expect(clone.strokes[0].points).toEqual(source.strokes[0].points);
    expect(clone.strokes[0].points).not.toBe(source.strokes[0].points);
    expect(clone.strokes[0].points[0]).not.toBe(source.strokes[0].points[0]);
    expect(clone.images[0].locked).toBe(true);
    expect(source.strokes[0].id).toBe("s1");
    expect(source.images[0].id).toBe("i1");
  });

  it("keeps the pdf source reference", () => {
    const source = {
      ...createPage("#ffffff"),
      pdfSource: { docId: "pdf-1", pageIndex: 3 },
    };
    const clone = clonePageWithNewIds(source);
    expect(clone.pdfSource).toEqual({ docId: "pdf-1", pageIndex: 3 });
    expect(clonePageWithNewIds(createPage("#ffffff")).pdfSource).toBeUndefined();
  });
});
