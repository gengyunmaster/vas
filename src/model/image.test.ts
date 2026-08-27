import { describe, expect, it } from "vitest";
import {
  createImageItem,
  imageExtension,
  placeImageCentered,
  placeImageSize,
  rescaledImageRect,
} from "./image";
import { PAGE_HEIGHT, PAGE_WIDTH, PLACEMENT_MARGIN } from "./page";

describe("placeImageSize", () => {
  it("keeps small images at their natural size", () => {
    expect(placeImageSize(200, 100, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({ width: 200, height: 100 });
  });

  it("shrinks oversized images to fit the page keeping aspect ratio", () => {
    const maxWidth = PAGE_WIDTH - PLACEMENT_MARGIN * 2;
    const { width, height } = placeImageSize(maxWidth * 2, 100, PAGE_WIDTH, PAGE_HEIGHT);
    expect(width).toBeCloseTo(maxWidth);
    expect(height).toBeCloseTo(100 / 2);
  });

  it("fits very tall images by height", () => {
    const maxHeight = PAGE_HEIGHT - PLACEMENT_MARGIN * 2;
    const { width, height } = placeImageSize(100, maxHeight * 4, PAGE_WIDTH, PAGE_HEIGHT);
    expect(height).toBeCloseTo(maxHeight);
    expect(width).toBeCloseTo(100 / 4);
  });

  it("shrinks images to fit a smaller page", () => {
    const { width, height } = placeImageSize(440, 200, 300, 300);
    expect(width).toBeCloseTo(300 - PLACEMENT_MARGIN * 2);
    expect(height).toBeCloseTo((300 - PLACEMENT_MARGIN * 2) / 2.2);
  });

  it("falls back to a default size for degenerate input", () => {
    expect(placeImageSize(0, 0, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({ width: 300, height: 150 });
    expect(placeImageSize(Number.NaN, Number.POSITIVE_INFINITY, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({
      width: 300,
      height: 150,
    });
  });
});

describe("createImageItem", () => {
  it("places the image at the top-left placement margin", () => {
    const item = createImageItem("img-1", 200, 100, PAGE_WIDTH, PAGE_HEIGHT);
    expect(item.imageId).toBe("img-1");
    expect(item.id).not.toBe("img-1");
    expect(item.x).toBe(PLACEMENT_MARGIN);
    expect(item.y).toBe(PLACEMENT_MARGIN);
    expect(item.width).toBe(200);
    expect(item.height).toBe(100);
  });
});

describe("placeImageCentered", () => {
  it("fills the page width with a wide image and centers it vertically", () => {
    const placed = placeImageCentered(200, 100, PAGE_WIDTH, PAGE_HEIGHT);
    expect(placed.width).toBeCloseTo(PAGE_WIDTH);
    expect(placed.height).toBeCloseTo((100 * PAGE_WIDTH) / 200);
    expect(placed.x).toBeCloseTo(0);
    expect(placed.y).toBeCloseTo((PAGE_HEIGHT - placed.height) / 2);
  });

  it("fills the page height with a tall image and centers it horizontally", () => {
    const placed = placeImageCentered(100, 200, PAGE_WIDTH, PAGE_HEIGHT);
    expect(placed.height).toBeCloseTo(PAGE_HEIGHT);
    expect(placed.width).toBeCloseTo((100 * PAGE_HEIGHT) / 200);
    expect(placed.y).toBeCloseTo(0);
    expect(placed.x).toBeCloseTo((PAGE_WIDTH - placed.width) / 2);
  });

  it("upscales small images to fill the page", () => {
    const placed = placeImageCentered(50, 50, PAGE_WIDTH, PAGE_HEIGHT);
    expect(placed.width).toBeGreaterThan(50);
    expect(placed.height).toBeGreaterThan(50);
  });

  it("matches the page aspect with at most one blank side", () => {
    for (const [w, h] of [
      [400, 300],
      [300, 400],
      [1000, 100],
    ]) {
      const placed = placeImageCentered(w, h, PAGE_WIDTH, PAGE_HEIGHT);
      const marginX = Math.min(placed.x, PAGE_WIDTH - placed.x - placed.width);
      const marginY = Math.min(placed.y, PAGE_HEIGHT - placed.y - placed.height);
      expect(Math.min(marginX, marginY)).toBeCloseTo(0);
    }
  });

  it("fills a small page the same way", () => {
    const placed = placeImageCentered(200, 100, 400, 300);
    expect(placed.width).toBeCloseTo(400);
    expect(placed.height).toBeCloseTo(200);
    expect(placed.y).toBeCloseTo(50);
  });
});

describe("rescaledImageRect", () => {
  it("keeps the exact rect when the content size is unchanged", () => {
    const item = { x: 100, y: 120, width: 400, height: 300 };
    const rect = rescaledImageRect(
      item,
      { width: 400, height: 300 },
      { width: 400, height: 300 },
      PAGE_WIDTH,
      PAGE_HEIGHT,
    );
    expect(rect).toEqual(item);
  });

  it("preserves the display scale when the content bounds grow", () => {
    const item = { x: 50, y: 60, width: 200, height: 150 };
    const rect = rescaledImageRect(
      item,
      { width: 400, height: 300 },
      { width: 800, height: 600 },
      PAGE_WIDTH,
      PAGE_HEIGHT,
    );
    expect(rect).toEqual({ x: 50, y: 60, width: 400, height: 300 });
  });

  it("preserves a non-uniform stretch applied by the user", () => {
    const item = { x: 40, y: 40, width: 600, height: 150 };
    const rect = rescaledImageRect(
      item,
      { width: 400, height: 300 },
      { width: 400, height: 300 },
      PAGE_WIDTH,
      PAGE_HEIGHT,
    );
    expect(rect).toEqual(item);
  });

  it("shrinks uniformly to the page bounds when the rescaled figure overflows", () => {
    const item = { x: 90, y: 100, width: 700, height: 1000 };
    const rect = rescaledImageRect(
      item,
      { width: 350, height: 500 },
      { width: 700, height: 1000 },
      PAGE_WIDTH,
      PAGE_HEIGHT,
    );
    const fit = PAGE_HEIGHT / 2000;
    expect(rect.height).toBeCloseTo(PAGE_HEIGHT);
    expect(rect.width).toBeCloseTo(1400 * fit);
    expect(rect.y).toBe(0);
    expect(rect.x).toBeCloseTo(PAGE_WIDTH - 1400 * fit);
  });

  it("falls back to the fresh-insert size when the old natural size is unknown", () => {
    const item = { x: 100, y: 100, width: 400, height: 300 };
    const rect = rescaledImageRect(
      item,
      null,
      { width: 2000, height: 1000 },
      PAGE_WIDTH,
      PAGE_HEIGHT,
    );
    expect(rect.width).toBeCloseTo(PAGE_WIDTH - PLACEMENT_MARGIN * 2);
    expect(rect.height).toBeCloseTo((PAGE_WIDTH - PLACEMENT_MARGIN * 2) / 2);
    expect(rect.x).toBeCloseTo(PAGE_WIDTH - rect.width);
    expect(rect.y).toBe(100);
  });

  it("falls back to the default placement size for degenerate input", () => {
    const item = { x: 50, y: 50, width: 400, height: 300 };
    const rect = rescaledImageRect(
      item,
      { width: 400, height: 300 },
      { width: 0, height: Number.NaN },
      PAGE_WIDTH,
      PAGE_HEIGHT,
    );
    expect(rect).toEqual({ x: 50, y: 50, width: 300, height: 150 });
  });
});

describe("imageExtension", () => {
  it("maps known mime types to file extensions", () => {
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/png")).toBe("png");
    expect(imageExtension("image/svg+xml")).toBe("svg");
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("image/gif")).toBe("gif");
  });

  it("falls back to bin for unknown types", () => {
    expect(imageExtension("image/x-unknown")).toBe("bin");
    expect(imageExtension("")).toBe("bin");
  });
});
