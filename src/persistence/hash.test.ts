import { describe, expect, it } from "vitest";
import { hashBlob, sha256Hex } from "./hash";

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

  it("matches the software fallback used outside secure contexts", async () => {
    const bytes = new TextEncoder().encode("vas content addressing");
    expect(await hashBlob(new Blob([bytes]))).toBe(sha256Hex(bytes));
  });
});

describe("sha256Hex (software fallback)", () => {
  const vectors: [string, string][] = [
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
    [
      "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
      "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
    ],
  ];

  it.each(vectors)("matches the published SHA-256 vector %#", (input, expected) => {
    expect(sha256Hex(new TextEncoder().encode(input))).toBe(expected);
  });

  it("handles binary data and exact block boundaries", () => {
    const bytes = new Uint8Array(128).map((_, index) => index % 251);
    expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    const fiftyFive = new Uint8Array(55).fill(0x61);
    const fiftySix = new Uint8Array(56).fill(0x61);
    expect(sha256Hex(fiftyFive)).not.toBe(sha256Hex(fiftySix));
  });
});
