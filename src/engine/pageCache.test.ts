import { describe, expect, it } from "vitest";
import { createPage, type Page } from "../model/page";
import type { Stroke } from "../model/stroke";
import { canAppendToCache } from "./pageCache";

function stroke(id: string): Stroke {
  return {
    id,
    pen: "pen",
    color: "#1a1a1a",
    size: 2,
    simulatePressure: false,
    points: [{ x: 1, y: 1, pressure: 0.5 }],
  };
}

function pageWith(strokes: Stroke[], images: Page["images"] = []): Page {
  return { ...createPage("#ffffff"), strokes, images };
}

describe("canAppendToCache", () => {
  it("allows appending new strokes to an unchanged prefix", () => {
    const s1 = stroke("s1");
    const cached = { page: pageWith([s1]), renderedCount: 1 };
    expect(canAppendToCache(cached, pageWith([s1, stroke("s2")]))).toBe(true);
  });

  it("rejects when strokes were removed or replaced", () => {
    const s1 = stroke("s1");
    const s2 = stroke("s2");
    const cached = { page: pageWith([s1, s2]), renderedCount: 2 };
    expect(canAppendToCache(cached, pageWith([s1]))).toBe(false);
    expect(canAppendToCache(cached, pageWith([s1, stroke("s3")]))).toBe(false);
  });

  it("rejects when images changed even if strokes are identical", () => {
    const s1 = stroke("s1");
    const cached = { page: pageWith([s1]), renderedCount: 1 };
    const withImage = pageWith(
      [s1],
      [{ id: "i1", imageId: "blob", x: 0, y: 0, width: 10, height: 10 }],
    );
    expect(canAppendToCache(cached, withImage)).toBe(false);
    expect(canAppendToCache({ page: withImage, renderedCount: 1 }, pageWith([s1]))).toBe(false);
  });

  it("accepts identical image references", () => {
    const s1 = stroke("s1");
    const s2 = stroke("s2");
    const images = [{ id: "i1", imageId: "blob", x: 0, y: 0, width: 10, height: 10 }];
    const cached = { page: pageWith([s1], images), renderedCount: 1 };
    expect(canAppendToCache(cached, pageWith([s1, s2], images))).toBe(true);
  });

  it("rejects when an image item was replaced by a new object", () => {
    const cached = {
      page: pageWith([], [{ id: "i1", imageId: "blob", x: 0, y: 0, width: 10, height: 10 }]),
      renderedCount: 0,
    };
    const moved = pageWith([], [{ id: "i1", imageId: "blob", x: 5, y: 5, width: 10, height: 10 }]);
    expect(canAppendToCache(cached, moved)).toBe(false);
  });
});
