export type ResolvedTheme = "light" | "dark";

export interface BoardPalette {
  boardBackground: string;
  shapeStroke: string;
  fixedPoint: string;
  previewStroke: string;
  axisStroke: string;
  tickLabel: string;
  textStroke: string;
  iterationPoint: string;
  sliderTrack: string;
  sliderHandleFill: string;
}

const LIGHT_PALETTE: BoardPalette = {
  boardBackground: "#ffffff",
  shapeStroke: "#24292f",
  fixedPoint: "#6e7781",
  previewStroke: "#8c959f",
  axisStroke: "#57606a",
  tickLabel: "#57606a",
  textStroke: "#24292f",
  iterationPoint: "#6e7781",
  sliderTrack: "#57606a",
  sliderHandleFill: "#ffffff",
};

const DARK_PALETTE: BoardPalette = {
  boardBackground: "#0d1117",
  shapeStroke: "#c9d1d9",
  fixedPoint: "#8b949e",
  previewStroke: "#6e7681",
  axisStroke: "#8b949e",
  tickLabel: "#8b949e",
  textStroke: "#e6edf3",
  iterationPoint: "#8b949e",
  sliderTrack: "#8b949e",
  sliderHandleFill: "#161b22",
};

// Mutable singleton: geometry attributes are read at create/sync time, so
// mutating the fields re-themes the board on the next controller.sync().
export const boardPalette: BoardPalette = { ...LIGHT_PALETTE };

export function applyBoardTheme(theme: ResolvedTheme): void {
  Object.assign(boardPalette, theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE);
}

// The editor shows the paper it will be embedded on; line defaults follow the
// paper's luminance so strokes stay visible on dark paper (e.g. blackboard green).
export function applyPaperPalette(paperColor: string, isDarkPaper: boolean): void {
  applyBoardTheme(isDarkPaper ? "dark" : "light");
  boardPalette.boardBackground = paperColor;
}
