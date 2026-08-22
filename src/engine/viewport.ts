import { boardWidth, contentHeight, type Page, pageIndexAtY } from "../model/page";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const FIT_MARGIN = 12;
const MAX_ZOOM = 20;

export function fitScale(screenWidth: number, board: number): number {
  return screenWidth / (board + FIT_MARGIN * 2);
}

export function createViewport(screen: ScreenSize, pages: Page[]): Viewport {
  return clampViewport(
    { x: 0, y: 0, scale: fitScale(screen.width, boardWidth(pages)) },
    screen,
    pages,
  );
}

export function clampScale(scale: number, screenWidth: number, board: number): number {
  const fit = fitScale(screenWidth, board);
  return Math.min(fit * MAX_ZOOM, Math.max(fit, scale));
}

export function clampViewport(vp: Viewport, screen: ScreenSize, pages: Page[]): Viewport {
  const board = boardWidth(pages);
  const worldScreenW = screen.width / vp.scale;
  const x =
    worldScreenW >= board ? (board - worldScreenW) / 2 : clamp(vp.x, 0, board - worldScreenW);
  const height = contentHeight(pages);
  const worldScreenH = screen.height / vp.scale;
  const y =
    worldScreenH >= height ? (height - worldScreenH) / 2 : clamp(vp.y, 0, height - worldScreenH);
  return { ...vp, x, y };
}

export function panBy(
  vp: Viewport,
  dxScreen: number,
  dyScreen: number,
  screen: ScreenSize,
  pages: Page[],
): Viewport {
  return clampViewport(
    { ...vp, x: vp.x - dxScreen / vp.scale, y: vp.y - dyScreen / vp.scale },
    screen,
    pages,
  );
}

export function zoomAt(
  vp: Viewport,
  focal: Point,
  nextScale: number,
  screen: ScreenSize,
  pages: Page[],
): Viewport {
  const scale = clampScale(nextScale, screen.width, boardWidth(pages));
  const worldFx = vp.x + focal.x / vp.scale;
  const worldFy = vp.y + focal.y / vp.scale;
  return clampViewport(
    { scale, x: worldFx - focal.x / scale, y: worldFy - focal.y / scale },
    screen,
    pages,
  );
}

export function presentationViewport(
  screen: ScreenSize,
  page: Page,
  pageLeft: number,
  pageTop: number,
): Viewport {
  const scale = Math.min(screen.width / page.width, screen.height / page.height);
  return {
    scale,
    x: pageLeft + page.width / 2 - screen.width / scale / 2,
    y: pageTop + page.height / 2 - screen.height / scale / 2,
  };
}

export function screenToWorld(vp: Viewport, screenX: number, screenY: number): Point {
  return { x: vp.x + screenX / vp.scale, y: vp.y + screenY / vp.scale };
}

export function visiblePageRange(
  vp: Viewport,
  screen: ScreenSize,
  pages: Page[],
): { first: number; last: number } {
  const first = pageIndexAtY(pages, vp.y);
  const last = pageIndexAtY(pages, vp.y + screen.height / vp.scale);
  return { first, last: Math.max(first, last) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
