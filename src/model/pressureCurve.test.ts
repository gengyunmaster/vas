import { describe, expect, it } from "vitest";
import { applyPressureCurve } from "./pressureCurve";

describe("applyPressureCurve", () => {
  it("standard passes pressure through", () => {
    expect(applyPressureCurve(0.4, "standard")).toBeCloseTo(0.4);
  });

  it("soft boosts light touches", () => {
    expect(applyPressureCurve(0.3, "soft")).toBeGreaterThan(0.3);
  });

  it("firm dampens light touches", () => {
    expect(applyPressureCurve(0.3, "firm")).toBeLessThan(0.3);
  });

  it("all curves agree at the extremes", () => {
    for (const curve of ["standard", "soft", "firm"] as const) {
      expect(applyPressureCurve(0, curve)).toBe(0);
      expect(applyPressureCurve(1, curve)).toBe(1);
    }
  });

  it("clamps out-of-range input", () => {
    expect(applyPressureCurve(1.4, "standard")).toBe(1);
    expect(applyPressureCurve(-0.2, "soft")).toBe(0);
  });
});
