import { describe, expect, it } from "vitest";
import { collectMediaRefs } from "./media";

describe("collectMediaRefs", () => {
  it("collects video ids from images and audio ids from badges", () => {
    const keep = collectMediaRefs([
      {
        images: [{ videoId: "v1" }, { videoId: "v2" }, {}],
        audios: [{ audioId: "a1" }],
      },
    ]);
    expect([...keep].sort()).toEqual(["a1", "v1", "v2"]);
  });

  it("tolerates legacy records without the optional arrays", () => {
    expect(collectMediaRefs([{}]).size).toBe(0);
    expect(collectMediaRefs([]).size).toBe(0);
  });

  it("keeps references from clipboard-shaped pseudo pages", () => {
    const keep = collectMediaRefs([
      { images: [{ videoId: "v-clip" }], audios: [{ audioId: "a-clip" }] },
    ]);
    expect(keep.has("v-clip")).toBe(true);
    expect(keep.has("a-clip")).toBe(true);
  });
});
