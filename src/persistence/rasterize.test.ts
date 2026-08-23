import { describe, expect, it } from "vitest";
import { cappedRenderScale } from "./rasterize";

describe("cappedRenderScale", () => {
  it("keeps the requested scale within the pixel budget", () => {
    expect(cappedRenderScale(2, 794, 1123)).toBe(2);
  });

  it("caps the scale when the output would exceed the pixel budget", () => {
    expect(cappedRenderScale(2, 5000, 5000)).toBeCloseTo(Math.sqrt(16_777_216 / 25_000_000));
  });

  it("never drops below the minimum scale", () => {
    expect(cappedRenderScale(3, 50_000, 50_000)).toBe(0.5);
  });
});
