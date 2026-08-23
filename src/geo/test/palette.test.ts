import { afterEach, describe, expect, it } from "vitest";
import { applyBoardTheme, applyPaperPalette, boardPalette } from "../board/palette";

afterEach(() => applyBoardTheme("light"));

describe("board palette", () => {
  it("follows the paper color and switches to light strokes on dark paper", () => {
    applyPaperPalette("#003423", true);
    expect(boardPalette.boardBackground).toBe("#003423");
    expect(boardPalette.shapeStroke).not.toBe("#24292f");
    expect(boardPalette.textStroke).not.toBe("#24292f");
  });

  it("restores the light palette for light paper", () => {
    applyPaperPalette("#003423", true);
    applyPaperPalette("#ffffff", false);
    expect(boardPalette.boardBackground).toBe("#ffffff");
    expect(boardPalette.shapeStroke).toBe("#24292f");
  });
});
