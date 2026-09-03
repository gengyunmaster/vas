import { describe, expect, it } from "vitest";
import { tapAction } from "./tapGesture";

describe("tapAction", () => {
  it("maps two-finger tap to undo and three-finger tap to redo", () => {
    expect(tapAction(2, 120, false)).toBe("undo");
    expect(tapAction(3, 120, false)).toBe("redo");
  });

  it("ignores single finger and four or more fingers", () => {
    expect(tapAction(1, 120, false)).toBeNull();
    expect(tapAction(4, 120, false)).toBeNull();
  });

  it("rejects slow presses", () => {
    expect(tapAction(2, 500, false)).toBeNull();
  });

  it("rejects moved touches (pan/pinch)", () => {
    expect(tapAction(2, 120, true)).toBeNull();
  });
});
