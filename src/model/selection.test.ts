import { describe, expect, it } from "vitest";
import type { Page } from "./page";
import {
  imageInLasso,
  imagesInLasso,
  pickElements,
  pointInPolygon,
  segmentsIntersect,
  strokeInLasso,
  strokesInLasso,
} from "./selection";
import type { Stroke } from "./stroke";

function penStroke(id: string, points: { x: number; y: number }[], size = 4): Stroke {
  return {
    id,
    pen: "pen",
    color: "#1a1a1a",
    size,
    simulatePressure: false,
    points: points.map((p) => ({ ...p, pressure: 0.5 })),
  };
}

function shapeStroke(
  id: string,
  shape: Stroke["shape"],
  a: { x: number; y: number },
  b: { x: number; y: number },
): Stroke {
  return { ...penStroke(id, [a, b]), shape };
}

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("pointInPolygon", () => {
  it("detects points inside and outside a square", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    expect(pointInPolygon({ x: -10, y: 50 }, square)).toBe(false);
  });

  it("returns false for degenerate polygons", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
    expect(pointInPolygon({ x: 5, y: 5 }, square.slice(0, 2))).toBe(false);
  });

  it("handles concave polygons", () => {
    const l = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 20, y: 20 }, l)).toBe(true);
    expect(pointInPolygon({ x: 80, y: 80 }, l)).toBe(false);
  });
});

describe("segmentsIntersect", () => {
  it("detects crossing segments", () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(true);
  });

  it("rejects parallel segments", () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }),
    ).toBe(false);
  });

  it("rejects collinear points off the segment", () => {
    expect(
      segmentsIntersect({ x: 20, y: 0 }, { x: 25, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }),
    ).toBe(false);
  });

  it("detects touching endpoints", () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }),
    ).toBe(true);
  });
});

describe("strokeInLasso", () => {
  it("selects a stroke fully inside the lasso without touching its boundary", () => {
    const stroke = penStroke("s1", [
      { x: 40, y: 40 },
      { x: 60, y: 60 },
    ]);
    expect(strokeInLasso(stroke, square)).toBe(true);
  });

  it("selects a stroke that merely crosses the lasso boundary", () => {
    const stroke = penStroke("s1", [
      { x: -50, y: 50 },
      { x: 50, y: 50 },
    ]);
    expect(strokeInLasso(stroke, square)).toBe(true);
  });

  it("treats an open lasso as closed by linking the last point to the first", () => {
    const openSquare = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const stroke = penStroke("s1", [
      { x: -10, y: -10 },
      { x: 20, y: 5 },
    ]);
    expect(strokeInLasso(stroke, openSquare)).toBe(true);
  });

  it("rejects strokes outside the lasso", () => {
    const stroke = penStroke("s1", [
      { x: 200, y: 200 },
      { x: 300, y: 300 },
    ]);
    expect(strokeInLasso(stroke, square)).toBe(false);
  });

  it("selects a thick stroke when the lasso lies entirely within its ink", () => {
    const stroke = penStroke(
      "s1",
      [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
      30,
    );
    const tiny = [
      { x: 140, y: -5 },
      { x: 160, y: -5 },
      { x: 160, y: 5 },
      { x: 140, y: 5 },
    ];
    expect(strokeInLasso(stroke, tiny)).toBe(true);
  });

  it("selects a single-point dot stroke inside the lasso", () => {
    const stroke = penStroke("s1", [{ x: 50, y: 50 }]);
    expect(strokeInLasso(stroke, square)).toBe(true);
  });

  it("selects shape strokes by their outline geometry", () => {
    const rect = shapeStroke("r", "rect", { x: 20, y: 20 }, { x: 80, y: 80 });
    expect(strokeInLasso(rect, square)).toBe(true);

    const line = shapeStroke("l", "line", { x: -50, y: 50 }, { x: 50, y: 50 });
    expect(strokeInLasso(line, square)).toBe(true);

    const ellipse = shapeStroke("e", "ellipse", { x: 200, y: 200 }, { x: 260, y: 260 });
    expect(strokeInLasso(ellipse, square)).toBe(false);

    const ellipseOverlap = shapeStroke("e2", "ellipse", { x: 80, y: 80 }, { x: 160, y: 160 });
    expect(strokeInLasso(ellipseOverlap, square)).toBe(true);
  });

  it("selects an arrow whose head wing crosses the lasso", () => {
    const arrow = shapeStroke("a", "arrow", { x: 104, y: 10 }, { x: 104, y: 80 });
    expect(strokeInLasso(arrow, square)).toBe(true);
    const outside = shapeStroke("a2", "arrow", { x: 140, y: 10 }, { x: 140, y: 80 });
    expect(strokeInLasso(outside, square)).toBe(false);
  });

  it("returns false for degenerate lassos", () => {
    const stroke = penStroke("s1", [
      { x: 50, y: 50 },
      { x: 60, y: 60 },
    ]);
    expect(strokeInLasso(stroke, [])).toBe(false);
    expect(strokeInLasso(stroke, [{ x: 50, y: 50 }])).toBe(false);
  });
});

describe("strokesInLasso", () => {
  it("filters strokes preserving order", () => {
    const inside = penStroke("in", [
      { x: 40, y: 40 },
      { x: 60, y: 60 },
    ]);
    const outside = penStroke("out", [
      { x: 300, y: 300 },
      { x: 320, y: 320 },
    ]);
    const crossing = penStroke("cross", [
      { x: -10, y: 10 },
      { x: 10, y: 10 },
    ]);
    expect(strokesInLasso([inside, outside, crossing], square).map((s) => s.id)).toEqual([
      "in",
      "cross",
    ]);
  });

  it("returns an empty list for a degenerate lasso", () => {
    const stroke = penStroke("s1", [{ x: 50, y: 50 }]);
    expect(strokesInLasso([stroke], [{ x: 50, y: 50 }])).toEqual([]);
  });
});

describe("imageInLasso", () => {
  const image = { id: "i1", imageId: "blob-1", x: 20, y: 20, width: 60, height: 40 };

  it("selects an image fully inside the lasso", () => {
    expect(imageInLasso(image, square)).toBe(true);
  });

  it("selects an image the lasso merely touches", () => {
    const overlapping = { ...image, x: 90, y: 90 };
    expect(imageInLasso(overlapping, square)).toBe(true);
  });

  it("selects an image that fully contains the lasso", () => {
    const huge = { ...image, x: -50, y: -50, width: 500, height: 500 };
    const tiny = [
      { x: 200, y: 200 },
      { x: 220, y: 200 },
      { x: 220, y: 220 },
      { x: 200, y: 220 },
    ];
    expect(imageInLasso(huge, tiny)).toBe(true);
  });

  it("rejects images outside the lasso", () => {
    const outside = { ...image, id: "i2", x: 200, y: 200 };
    expect(imageInLasso(outside, square)).toBe(false);
    expect(imagesInLasso([image, outside], square).map((i) => i.id)).toEqual(["i1"]);
  });

  it("returns false for a degenerate lasso", () => {
    expect(imageInLasso(image, [])).toBe(false);
    expect(imageInLasso(image, [{ x: 50, y: 50 }])).toBe(false);
  });

  it("skips locked images", () => {
    const locked = { ...image, id: "i3", locked: true };
    expect(imageInLasso(locked, square)).toBe(true);
    expect(imagesInLasso([image, locked], square).map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("pickElements", () => {
  it("returns only the referenced strokes and images, in page order", () => {
    const a = penStroke("a", [{ x: 0, y: 0 }]);
    const b = penStroke("b", [{ x: 10, y: 10 }]);
    const page: Page = {
      id: "p1",
      width: 794,
      height: 1123,
      paperColor: "#ffffff",
      pattern: "blank",
      strokes: [a, b],
      images: [
        { id: "i1", imageId: "m1", x: 0, y: 0, width: 10, height: 10 },
        { id: "i2", imageId: "m2", x: 5, y: 5, width: 10, height: 10 },
      ],
      texts: [],
    };
    const picked = pickElements(page, ["b"], ["i2"]);
    expect(picked.strokes).toEqual([b]);
    expect(picked.images.map((image) => image.id)).toEqual(["i2"]);
  });
});
