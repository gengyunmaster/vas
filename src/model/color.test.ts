import { describe, expect, it } from "vitest";
import { hexToRgb, isDarkColor, normalizeHex } from "./color";

describe("normalizeHex", () => {
  it("accepts a six-digit hex with hash", () => {
    expect(normalizeHex("#2f6fdd")).toBe("#2f6fdd");
  });

  it("accepts a six-digit hex without hash and lowercases it", () => {
    expect(normalizeHex("D64541")).toBe("#d64541");
  });

  it("expands a three-digit hex", () => {
    expect(normalizeHex("#f2b")).toBe("#ff22bb");
    expect(normalizeHex("abc")).toBe("#aabbcc");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHex("  #1a1a1a  ")).toBe("#1a1a1a");
  });

  it("rejects invalid input", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("#1234567")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#gg0000")).toBeNull();
  });
});

describe("hexToRgb", () => {
  it("parses channels in the 0-1 range", () => {
    expect(hexToRgb("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    const { r, g, b } = hexToRgb("#2f6fdd") ?? { r: 0, g: 0, b: 0 };
    expect(r).toBeCloseTo(47 / 255);
    expect(g).toBeCloseTo(111 / 255);
    expect(b).toBeCloseTo(221 / 255);
  });

  it("returns null for invalid input", () => {
    expect(hexToRgb("nope")).toBeNull();
  });
});

describe("isDarkColor", () => {
  it("treats black and the blackboard green as dark", () => {
    expect(isDarkColor("#1a1a1a")).toBe(true);
    expect(isDarkColor("#003423")).toBe(true);
    expect(isDarkColor("#26262a")).toBe(true);
  });

  it("treats white and light tones as light", () => {
    expect(isDarkColor("#ffffff")).toBe(false);
    expect(isDarkColor("#fbf3db")).toBe(false);
    expect(isDarkColor("#eef1f4")).toBe(false);
  });

  it("defaults to light for invalid input", () => {
    expect(isDarkColor("invalid")).toBe(false);
  });
});
