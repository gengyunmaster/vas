import { describe, expect, it } from "vitest";
import { hashBlob } from "./hash";

describe("hashBlob", () => {
  it("is deterministic for identical bytes", async () => {
    const a = await hashBlob(new Blob(["hello world"]));
    const b = await hashBlob(new Blob(["hello world"]));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different bytes regardless of file name", async () => {
    const a = await hashBlob(new Blob(["cat"], { type: "image/png" }));
    const b = await hashBlob(new Blob(["dog"], { type: "image/png" }));
    expect(a).not.toBe(b);
  });

  it("ignores the blob mime type", async () => {
    const a = await hashBlob(new Blob(["same"], { type: "image/png" }));
    const b = await hashBlob(new Blob(["same"], { type: "image/jpeg" }));
    expect(a).toBe(b);
  });
});
