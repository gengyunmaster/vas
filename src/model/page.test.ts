import { describe, expect, it } from "vitest";
import {
  boardWidth,
  clampPageSize,
  clampToPage,
  clonePageWithNewIds,
  contentHeight,
  createPage,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  PAGE_GAP,
  PAGE_HEIGHT,
  PAGE_TOP_MARGIN,
  PAGE_WIDTH,
  type Page,
  pageAt,
  pageIndexAtY,
  pageLeftX,
  pageTopY,
  trimTrailingBlankPages,
} from "./page";

function uniformPages(count: number): Page[] {
  return Array.from({ length: count }, () => createPage("#ffffff"));
}

describe("page geometry", () => {
  it("computes page top offsets", () => {
    const pages = uniformPages(2);
    expect(pageTopY(pages, 0)).toBe(PAGE_TOP_MARGIN);
    expect(pageTopY(pages, 1)).toBe(PAGE_TOP_MARGIN + PAGE_HEIGHT + PAGE_GAP);
  });

  it("stacks pages by their own heights", () => {
    const pages = [
      createPage("#ffffff", "blank", { width: 400, height: 300 }),
      createPage("#ffffff", "blank", { width: 500, height: 1000 }),
      createPage("#ffffff", "blank", { width: 300, height: 200 }),
    ];
    expect(pageTopY(pages, 1)).toBe(PAGE_TOP_MARGIN + 300 + PAGE_GAP);
    expect(pageTopY(pages, 2)).toBe(PAGE_TOP_MARGIN + 300 + 1000 + 2 * PAGE_GAP);
  });

  it("computes content height with margins and gaps", () => {
    expect(contentHeight(uniformPages(1))).toBe(PAGE_TOP_MARGIN + PAGE_HEIGHT + PAGE_GAP);
    expect(contentHeight(uniformPages(2))).toBe(PAGE_TOP_MARGIN + 2 * PAGE_HEIGHT + 2 * PAGE_GAP);
    expect(contentHeight([])).toBe(PAGE_TOP_MARGIN);
  });

  it("hits a point inside the first page", () => {
    const hit = pageAt(uniformPages(3), 100, PAGE_TOP_MARGIN + 50);
    expect(hit).toEqual({ index: 0, x: 100, y: 50 });
  });

  it("hits a point inside a later page", () => {
    const pages = uniformPages(3);
    const hit = pageAt(pages, 10, pageTopY(pages, 2) + 20);
    expect(hit).toEqual({ index: 2, x: 10, y: 20 });
  });

  it("returns page-local coordinates for a centered narrow page", () => {
    const pages = [
      createPage("#ffffff"),
      createPage("#ffffff", "blank", { width: 400, height: 300 }),
    ];
    const left = pageLeftX(boardWidth(pages), pages[1]);
    const hit = pageAt(pages, left + 10, pageTopY(pages, 1) + 20);
    expect(hit).toEqual({ index: 1, x: 10, y: 20 });
    expect(pageAt(pages, left - 1, pageTopY(pages, 1) + 20)).toBeNull();
  });

  it("misses the gap between pages", () => {
    expect(pageAt(uniformPages(3), 100, PAGE_TOP_MARGIN + PAGE_HEIGHT + 5)).toBeNull();
  });

  it("misses outside the page horizontally", () => {
    const pages = uniformPages(3);
    expect(pageAt(pages, -1, 100)).toBeNull();
    expect(pageAt(pages, PAGE_WIDTH + 1, 100)).toBeNull();
  });

  it("misses beyond the last page", () => {
    const pages = uniformPages(3);
    expect(pageAt(pages, 100, pageTopY(pages, 5))).toBeNull();
  });

  it("maps a world y to the nearest page index", () => {
    const pages = uniformPages(3);
    expect(pageIndexAtY(pages, pageTopY(pages, 1) + 5)).toBe(1);
    expect(pageIndexAtY(pages, -100)).toBe(0);
    expect(pageIndexAtY(pages, 99999)).toBe(2);
  });

  it("maps a world y across pages of different heights", () => {
    const pages = [
      createPage("#ffffff", "blank", { width: 400, height: 300 }),
      createPage("#ffffff", "blank", { width: 400, height: 1000 }),
    ];
    expect(pageIndexAtY(pages, PAGE_TOP_MARGIN + 10)).toBe(0);
    expect(pageIndexAtY(pages, PAGE_TOP_MARGIN + 300 + PAGE_GAP + 10)).toBe(1);
  });

  it("clamps points to the page bounds", () => {
    const page = createPage("#ffffff", "blank", { width: 300, height: 400 });
    expect(clampToPage(page, -5, 2000)).toEqual({ x: 0, y: 400 });
    expect(clampToPage(page, 100, 200)).toEqual({ x: 100, y: 200 });
    expect(clampToPage(page, 999, -1)).toEqual({ x: 300, y: 0 });
  });
});

describe("boardWidth and pageLeftX", () => {
  it("uses the widest page, defaulting to A4", () => {
    expect(boardWidth([])).toBe(PAGE_WIDTH);
    expect(boardWidth(uniformPages(2))).toBe(PAGE_WIDTH);
    const pages = [
      createPage("#ffffff"),
      createPage("#ffffff", "blank", { width: 1200, height: 800 }),
    ];
    expect(boardWidth(pages)).toBe(1200);
    expect(pageLeftX(1200, pages[0])).toBe((1200 - PAGE_WIDTH) / 2);
    expect(pageLeftX(1200, pages[1])).toBe(0);
  });

  it("shrinks to the widest page when all pages are narrower than A4", () => {
    const pages = [
      createPage("#ffffff", "blank", { width: 300, height: 400 }),
      createPage("#ffffff", "blank", { width: 500, height: 400 }),
    ];
    expect(boardWidth(pages)).toBe(500);
    expect(pageLeftX(500, pages[0])).toBe(100);
  });
});

describe("clampPageSize", () => {
  it("rounds and clamps to the allowed range", () => {
    expect(clampPageSize({ width: 794.4, height: 1122.6 })).toEqual({ width: 794, height: 1123 });
    expect(clampPageSize({ width: 10, height: 99999 })).toEqual({
      width: MIN_PAGE_SIZE,
      height: MAX_PAGE_SIZE,
    });
  });
});

describe("trimTrailingBlankPages", () => {
  const blank = (id: string): Page => ({
    id,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    strokes: [],
    images: [],
    paperColor: "#ffffff",
    pattern: "blank" as const,
  });
  const written = (id: string): Page => ({
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
  const imaged = (id: string): Page => ({
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
    const source: Page = {
      id: "page-1",
      width: 500,
      height: 700,
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
    expect(clone.width).toBe(500);
    expect(clone.height).toBe(700);
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
