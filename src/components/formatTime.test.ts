import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./formatTime";

const now = new Date("2026-07-23T12:00:00").getTime();

describe("formatRelativeTime", () => {
  it("reports just now for under a minute", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
  });

  it("reports minutes", () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
  });

  it("reports hours", () => {
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3 h ago");
  });

  it("reports days", () => {
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2 d ago");
  });

  it("falls back to a date for older timestamps", () => {
    const result = formatRelativeTime(now - 30 * 86_400_000, now);
    expect(result).not.toContain("ago");
    expect(result.length).toBeGreaterThan(0);
  });

  it("treats future timestamps as just now", () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe("just now");
  });
});
