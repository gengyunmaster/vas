import { describe, expect, it } from "vitest";
import { buildDiagnostics, describeError } from "./diagnostics";

const context = {
  userAgent: "TestBrowser/1.0",
  url: "https://example.com/",
  time: "2026-09-03T00:00:00.000Z",
};

describe("describeError", () => {
  it("extracts fields from Error instances", () => {
    const info = describeError(new TypeError("boom"));
    expect(info.name).toBe("TypeError");
    expect(info.message).toBe("boom");
    expect(info.stack).toContain("TypeError");
  });

  it("stringifies non-Error values", () => {
    expect(describeError("plain")).toEqual({ name: "Error", message: "plain", stack: "" });
    expect(describeError(null).message).toBe("null");
    expect(describeError({ code: 7 }).message).toBe("[object Object]");
  });
});

describe("buildDiagnostics", () => {
  it("includes version, context and stack", () => {
    const text = buildDiagnostics(new Error("ink exploded"), context);
    expect(text).toContain("vas ");
    expect(text).toContain("Time: 2026-09-03T00:00:00.000Z");
    expect(text).toContain("URL: https://example.com/");
    expect(text).toContain("User-Agent: TestBrowser/1.0");
    expect(text).toContain("Error: ink exploded");
  });

  it("appends the component stack when present", () => {
    const text = buildDiagnostics(new Error("x"), context, "\n    at Board\n    at App");
    expect(text).toContain("Component stack:");
    expect(text).toContain("at Board");
  });

  it("omits the component stack section when absent", () => {
    expect(buildDiagnostics(new Error("x"), context)).not.toContain("Component stack:");
  });
});
