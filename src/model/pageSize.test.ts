import { describe, expect, it } from "vitest";
import { createPage, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "./page";
import { pdfPageSize, resizePage } from "./pageSize";

describe("pdfPageSize", () => {
  it("maps A4 points to the default page size", () => {
    expect(pdfPageSize(595.28, 841.89)).toEqual({ width: 794, height: 1123 });
  });

  it("maps Letter points proportionally", () => {
    expect(pdfPageSize(612, 792)).toEqual({ width: 816, height: 1056 });
  });

  it("shrinks oversized pages into the allowed range", () => {
    const size = pdfPageSize(6000, 3000);
    expect(size.width).toBe(MAX_PAGE_SIZE);
    expect(size.height).toBe(2500);
  });

  it("grows undersized pages up to the minimum", () => {
    const size = pdfPageSize(75, 75);
    expect(size.width).toBe(MIN_PAGE_SIZE);
    expect(size.height).toBe(MIN_PAGE_SIZE);
  });
});

describe("resizePage", () => {
  const source = () => {
    const page = createPage("#ffffff", "blank", { width: 400, height: 600 });
    page.strokes.push({
      id: "s1",
      pen: "pen",
      color: "#1a1a1a",
      size: 4,
      simulatePressure: false,
      points: [
        { x: 10, y: 20, pressure: 0.5 },
        { x: 30, y: 40, pressure: 0.8 },
      ],
    });
    page.images.push(
      { id: "i1", imageId: "blob-1", x: 40, y: 60, width: 200, height: 100 },
      { id: "i2", imageId: "blob-2", x: 0, y: 0, width: 400, height: 600, locked: true },
    );
    return page;
  };

  it("returns the same page when the size is unchanged", () => {
    const page = source();
    expect(resizePage(page, { width: 400, height: 600 })).toBe(page);
  });

  it("keeps content untouched when growing", () => {
    const page = source();
    const resized = resizePage(page, { width: 800, height: 1200 });
    expect(resized.width).toBe(800);
    expect(resized.height).toBe(1200);
    expect(resized.strokes).toBe(page.strokes);
    expect(resized.images[0]).toBe(page.images[0]);
  });

  it("scales strokes and unlocked images down proportionally", () => {
    const resized = resizePage(source(), { width: 200, height: 300 });
    expect(resized.strokes[0].points).toEqual([
      { x: 5, y: 10, pressure: 0.5 },
      { x: 15, y: 20, pressure: 0.8 },
    ]);
    expect(resized.strokes[0].size).toBe(2);
    expect(resized.images[0]).toMatchObject({ x: 20, y: 30, width: 100, height: 50 });
  });

  it("shrinks uniformly when only one dimension is smaller", () => {
    const resized = resizePage(source(), { width: 200, height: 600 });
    expect(resized.width).toBe(200);
    expect(resized.height).toBe(600);
    expect(resized.strokes[0].points[1]).toEqual({ x: 15, y: 20, pressure: 0.8 });
    expect(resized.images[0]).toMatchObject({ x: 20, y: 30, width: 100, height: 50 });
  });

  it("re-places locked images instead of scaling them with the content", () => {
    const resized = resizePage(source(), { width: 200, height: 600 });
    const locked = resized.images[1];
    expect(locked.locked).toBe(true);
    expect(locked).toMatchObject({ width: 200, height: 300, x: 0, y: 150 });
  });

  it("clamps the requested size to the allowed range", () => {
    const resized = resizePage(source(), { width: 1, height: 99999 });
    expect(resized.width).toBe(MIN_PAGE_SIZE);
    expect(resized.height).toBe(MAX_PAGE_SIZE);
  });
});
