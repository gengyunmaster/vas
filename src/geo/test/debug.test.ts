// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

describe("debug log", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.resetModules();
  });

  it("clears buffered entries and notifies subscribers", async () => {
    window.history.replaceState(null, "", "/?debug=1");
    const { clearDebug, debugLog, subscribeDebug } = await import("../debug");
    const seen: string[][] = [];
    const unsubscribe = subscribeDebug((entries) => seen.push(entries.map((entry) => entry.text)));
    debugLog("hello");
    expect(seen.at(-1)).toEqual(["hello"]);
    clearDebug();
    expect(seen.at(-1)).toEqual([]);
    debugLog("again");
    expect(seen.at(-1)).toEqual(["again"]);
    unsubscribe();
  });
});
