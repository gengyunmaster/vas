import { contentHeight, PAGE_GAP, PAGE_HEIGHT, PAGE_TOP_MARGIN, PAGE_WIDTH } from "../model/page";

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

export function fitScale(screenWidth: number): number {
  return screenWidth / (PAGE_WIDTH + FIT_MARGIN * 2);
}

export function createViewport(screen: ScreenSize, pageCount: number): Viewport {
  return clampViewport({ x: 0, y: 0, scale: fitScale(screen.width) }, screen, pageCount);
}

export function clampScale(scale: number, screenWidth: number): number {
  const fit = fitScale(screenWidth);
  return Math.min(fit * MAX_ZOOM, Math.max(fit, scale));
}

export function clampViewport(vp: Viewport, screen: ScreenSize, pageCount: number): Viewport {
  const worldScreenW = screen.width / vp.scale;
  const x =
    worldScreenW >= PAGE_WIDTH
      ? (PAGE_WIDTH - worldScreenW) / 2
      : clamp(vp.x, 0, PAGE_WIDTH - worldScreenW);
  const height = contentHeight(pageCount);
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
  pageCount: number,
): Viewport {
  return clampViewport(
    { ...vp, x: vp.x - dxScreen / vp.scale, y: vp.y - dyScreen / vp.scale },
    screen,
    pageCount,
  );
}

export function zoomAt(
  vp: Viewport,
  focal: Point,
  nextScale: number,
  screen: ScreenSize,
  pageCount: number,
): Viewport {
  const scale = clampScale(nextScale, screen.width);
  const worldFx = vp.x + focal.x / vp.scale;
  const worldFy = vp.y + focal.y / vp.scale;
  return clampViewport(
    { scale, x: worldFx - focal.x / scale, y: worldFy - focal.y / scale },
    screen,
    pageCount,
  );
}

export function screenToWorld(vp: Viewport, screenX: number, screenY: number): Point {
  return { x: vp.x + screenX / vp.scale, y: vp.y + screenY / vp.scale };
}

export function visiblePageRange(
  vp: Viewport,
  screen: ScreenSize,
  pageCount: number,
): { first: number; last: number } {
  const span = PAGE_HEIGHT + PAGE_GAP;
  const first = Math.max(0, Math.floor((vp.y - PAGE_TOP_MARGIN) / span));
  const last = Math.min(
    pageCount - 1,
    Math.floor((vp.y + screen.height / vp.scale - PAGE_TOP_MARGIN) / span),
  );
  return { first, last: Math.max(first, last) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
