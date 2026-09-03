import { describe, expect, it } from "vitest";
import { formatBytes, storageLevel } from "./storageHealth";

describe("formatBytes", () => {
  it("formats common magnitudes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(12.3 * 1024 * 1024)).toBe("12.3 MB");
    expect(formatBytes(4.5 * 1024 ** 3)).toBe("4.5 GB");
    expect(formatBytes(120 * 1024 ** 2)).toBe("120 MB");
  });

  it("handles invalid input", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });
});

describe("storageLevel", () => {
  const at = (usage: number, quota: number) => storageLevel({ usage, quota, persisted: false });

  it("is quiet below 80%", () => {
    expect(at(0, 100)).toBeNull();
    expect(at(79, 100)).toBeNull();
  });

  it("warns at 80%", () => {
    expect(at(80, 100)).toBe("warn");
    expect(at(94, 100)).toBe("warn");
  });

  it("reports full at 95%", () => {
    expect(at(95, 100)).toBe("full");
    expect(at(100, 100)).toBe("full");
  });

  it("ignores zero or negative quota", () => {
    expect(at(50, 0)).toBeNull();
    expect(at(50, -1)).toBeNull();
  });
});
