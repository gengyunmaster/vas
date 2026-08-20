import { strToU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "./exportZip";

describe("buildZip", () => {
  it("packs entries that round-trip by name", () => {
    const bytes = buildZip([
      { name: "notes-page-1.svg", data: strToU8("<svg/>") },
      { name: "notes-page-2.png", data: new Uint8Array([1, 2, 3]) },
    ]);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(["notes-page-1.svg", "notes-page-2.png"]);
    expect(Array.from(entries["notes-page-2.png"] ?? [])).toEqual([1, 2, 3]);
  });

  it("produces a valid empty archive without entries", () => {
    expect(unzipSync(buildZip([]))).toEqual({});
  });
});
