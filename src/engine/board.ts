import { type Bounds, ERASER_TOLERANCE, hitTestStroke, strokeBounds } from "../model/hitTest";
import type { ImageItem } from "../model/image";
import {
  boardWidth,
  clampToPage,
  type Page,
  pageAt,
  pageIndexAtY,
  pageLeftX,
  pageTops,
  pageTopY,
} from "../model/page";
import { imagesInLasso, strokesInLasso, textsInLasso } from "../model/selection";
import {
  createStroke,
  effectiveStrokeSize,
  type PenKind,
  SHAPE_KINDS,
  type ShapeKind,
  type Stroke,
  type StrokePoint,
  type ToolKind,
} from "../model/stroke";
import type { TextItem } from "../model/textItem";
import {
  clampMoveDelta,
  clampScaleToPage,
  elementsBounds,
  scaleBounds,
  scaleImage,
  scaleStroke,
  scaleTextReflow,
  translateBounds,
  translateImage,
  translateStroke,
  translateText,
} from "../model/transform";
import type { ViewState } from "../model/viewState";
import { publishTextFrame, type SelectionGestureSnapshot } from "../text/textFrameBus";
import { textItemHeight } from "../text/textHeight";
import { get2dContext } from "./canvas";
import { getImageBitmap, onImageLoaded } from "./imageCache";
import { maxCacheRenderScale, PageCache } from "./pageCache";
import { drawPagePattern } from "./patterns";
import { drawStroke } from "./renderStroke";
import {
  clampScale,
  clampViewport,
  createViewport,
  fitScale,
  type Point,
  panBy,
  presentationViewport,
  type ScreenSize,
  screenToWorld,
  type Viewport,
  visiblePageRange,
  zoomAt,
} from "./viewport";

export interface ToolSettings {
  tool: ToolKind;
  color: string;
  size: number;
  exporting: boolean;
}

export interface SelectionSnapshot {
  pageId: string;
  strokeIds: string[];
  imageIds: string[];
  textIds: string[];
}

interface BoardCallbacks {
  getTool: () => ToolSettings;
  onCommitStroke: (pageId: string, stroke: Stroke) => void;
  onEraseStroke: (pageId: string, strokeId: string) => void;
  onViewChange: (pageIndex: number) => void;
  onSelectionChange: (selection: SelectionSnapshot | null) => void;
  onSelectionAnchor: (anchor: Point | null) => void;
  onTransformSelection: (
    before: { strokes: Stroke[]; images: ImageItem[]; texts: TextItem[] },
    after: { strokes: Stroke[]; images: ImageItem[]; texts: TextItem[] },
  ) => void;
  onTextTap: (pageId: string, x: number, y: number) => void;
  onViewportChange: (viewState: ViewState) => void;
}

interface TrackedPointer {
  x: number;
  y: number;
  type: string;
}

interface ActiveStroke {
  pointerId: number;
  button: number;
  pageId: string;
  pen: PenKind;
  color: string;
  size: number;
  shape?: ShapeKind;
  simulatePressure: boolean;
  points: StrokePoint[];
  predicted: StrokePoint[];
}

interface EraseSession {
  pointerId: number;
  pageId: string;
  removed: Set<string>;
}

interface LaserTrail {
  pointerId: number;
  points: { x: number; y: number; t: number }[];
}

type HandleKind = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface SelectionState {
  pageId: string;
  strokes: Stroke[];
  images: ImageItem[];
  texts: TextItem[];
  bounds: Bounds;
}

interface LassoSession {
  pointerId: number;
  pageId: string;
  points: Point[];
}

type SelectGesture =
  | { kind: "move"; pointerId: number; origin: Point; dx: number; dy: number }
  | {
      kind: "resize";
      pointerId: number;
      handle: HandleKind;
      anchor: Point;
      start: Point;
      origBounds: Bounds;
      sx: number;
      sy: number;
    };

const LASER_LIFETIME_MS = 1200;
const ERASER_RING_RADIUS = 8;

const PEN_SEEN_KEY = "vas.penSeen";
const WHEEL_ZOOM_SETTLE_MS = 150;
const PAGE_TURN_MS = 280;
const WHEEL_PAGE_THRESHOLD = 120;
const WHEEL_ACCUM_RESET_MS = 250;
const SWIPE_PAGE_THRESHOLD = 80;
const HANDLE_SIZE = 10;
const HANDLE_HIT_RADIUS = 12;
const MIN_SELECTION_SCALE = 0.05;
const SELECTION_ACCENT = "#2f6fdd";

export class Board {
  private readonly container: HTMLElement;
  private readonly callbacks: BoardCallbacks;
  private readonly baseCanvas: HTMLCanvasElement;
  private readonly activeCanvas: HTMLCanvasElement;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly activeCtx: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private readonly cache = new PageCache();
  private readonly inkCache = new PageCache();
  private readonly derivedBase = new WeakMap<Page, Page>();
  private readonly derivedInk = new WeakMap<Page, Page>();

  private pages: Page[] = [];
  private viewport: Viewport = { x: 0, y: 0, scale: 1 };
  private screen: ScreenSize = { width: 0, height: 0 };
  private fitted = true;
  private penSeen = false;

  private pointers = new Map<number, TrackedPointer>();
  private hover: Point | null = null;
  private stroke: ActiveStroke | null = null;
  private erasing: EraseSession | null = null;
  private laser: LaserTrail | null = null;
  private lasso: LassoSession | null = null;
  private selection: SelectionState | null = null;
  private gesture: SelectGesture | null = null;
  private selectionBase: { source: Page; derived: Page } | null = null;
  private strokeOverlayCache: {
    canvas: HTMLCanvasElement;
    renderScale: number;
    page: Page;
    selection: SelectionState;
  } | null = null;
  private lastDpr = 0;
  private panPointerId: number | null = null;
  private pinching = false;
  private wheelZooming = false;
  private wheelTimer: number | undefined;
  private presenting = false;
  private presentationPage = 0;
  private pageTurn: { from: Viewport; to: Viewport; fromPage: number; start: number } | null = null;
  private wheelAccum = 0;
  private wheelAccumTimer: number | undefined;
  private swipeStartY = 0;
  private swipeUsed = false;
  private rafId = 0;
  private lastReportedPage = -1;
  private lastReportedView: { x: number; y: number; scale: number } | null = null;
  private readonly stopImageListener: () => void;

  constructor(container: HTMLElement, callbacks: BoardCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.baseCanvas = createLayer();
    this.activeCanvas = createLayer("board-layer board-layer-active");
    container.append(this.baseCanvas, this.activeCanvas);
    this.baseCtx = get2dContext(this.baseCanvas);
    this.activeCtx = get2dContext(this.activeCanvas);
    this.penSeen = readPenSeen();

    this.activeCanvas.addEventListener("pointerdown", this.handlePointerDown);
    this.activeCanvas.addEventListener("pointermove", this.handlePointerMove);
    this.activeCanvas.addEventListener("pointerup", this.handlePointerEnd);
    this.activeCanvas.addEventListener("pointercancel", this.handlePointerEnd);
    this.activeCanvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.activeCanvas.addEventListener("contextmenu", preventDefault);
    this.activeCanvas.addEventListener("wheel", this.handleWheel, { passive: false });
    document.addEventListener("gesturestart", preventDefault);
    window.addEventListener("keydown", this.handleKeyDown);

    this.stopImageListener = onImageLoaded((imageId) => this.handleImageLoaded(imageId));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  syncPages(next: Page[]): void {
    const prev = this.pages;
    this.pages = next;
    if (this.stroke && !next.some((p) => p.id === this.stroke?.pageId)) this.stroke = null;
    if (this.erasing && !next.some((p) => p.id === this.erasing?.pageId)) this.erasing = null;
    if (this.lasso && !next.some((p) => p.id === this.lasso?.pageId)) this.lasso = null;
    if (this.selection) {
      const page = next.find((p) => p.id === this.selection?.pageId);
      const strokeIds = new Set(this.selection.strokes.map((s) => s.id));
      const imageIds = new Set(this.selection.images.map((i) => i.id));
      const textIds = new Set(this.selection.texts.map((t) => t.id));
      const strokes = page?.strokes.filter((s) => strokeIds.has(s.id)) ?? [];
      const images = page?.images.filter((i) => imageIds.has(i.id)) ?? [];
      const texts = page?.texts.filter((t) => textIds.has(t.id)) ?? [];
      const bounds = this.selectionBounds(strokes, images, texts);
      if (!page || !bounds) {
        this.selection = null;
        this.gesture = null;
        this.selectionBase = null;
        this.strokeOverlayCache = null;
        this.callbacks.onSelectionChange(null);
      } else {
        // External document change during a drag leaves the gesture anchor stale.
        this.gesture = null;
        this.selection = { pageId: page.id, strokes, images, texts, bounds };
      }
    }
    if (this.presenting) {
      this.pageTurn = null;
      this.lockPresentation();
    } else {
      const board = boardWidth(next);
      const widened =
        board > boardWidth(prev) ||
        next.some((p) => {
          const before = prev.find((q) => q.id === p.id);
          return before !== undefined && p.width > before.width;
        });
      if (widened && this.screen.width > 0 && this.screen.width / this.viewport.scale < board) {
        // A page grew wider than the viewport can show; refit horizontally so the
        // whole board (and both desk margins) stays reachable without horizontal pan.
        this.viewport = clampViewport(
          { ...this.viewport, scale: fitScale(this.screen.width, board) },
          this.screen,
          next,
        );
        this.fitted = true;
      } else {
        // Keep the fitted zoom in sync when the board shrinks (narrowed/removed widest page).
        if (this.fitted && this.screen.width > 0) {
          this.viewport = { ...this.viewport, scale: fitScale(this.screen.width, board) };
        }
        this.viewport = clampViewport(this.viewport, this.screen, next);
      }
    }
    this.scheduleComposite();
  }

  syncSelection(target: SelectionSnapshot | null): void {
    if (!target) {
      if (this.selection) {
        this.selection = null;
        this.selectionBase = null;
        this.strokeOverlayCache = null;
        this.gesture = null;
        this.lasso = null;
        this.scheduleComposite();
      }
      return;
    }
    const page = this.pages.find((p) => p.id === target.pageId);
    if (!page) return;
    const strokeIds = new Set(target.strokeIds);
    const imageIds = new Set(target.imageIds);
    const textIds = new Set(target.textIds);
    const strokes = page.strokes.filter((s) => strokeIds.has(s.id));
    const images = page.images.filter((i) => imageIds.has(i.id));
    const texts = page.texts.filter((t) => textIds.has(t.id));
    const bounds = this.selectionBounds(strokes, images, texts);
    if (!bounds) return;
    if (
      this.selection &&
      this.selection.pageId === target.pageId &&
      this.selection.strokes.length === strokes.length &&
      this.selection.strokes.every((s) => strokeIds.has(s.id)) &&
      this.selection.images.length === images.length &&
      this.selection.images.every((i) => imageIds.has(i.id)) &&
      this.selection.texts.length === texts.length &&
      this.selection.texts.every((t) => textIds.has(t.id))
    ) {
      return;
    }
    this.selection = { pageId: target.pageId, strokes, images, texts, bounds };
    this.selectionBase = null;
    this.strokeOverlayCache = null;
    this.gesture = null;
    this.scheduleComposite();
  }

  private selectionBounds(
    strokes: Stroke[],
    images: ImageItem[],
    texts: TextItem[],
  ): Bounds | null {
    return elementsBounds(
      strokes,
      images,
      texts.map((item) => ({ item, height: textItemHeight(item) })),
    );
  }

  scrollToPage(index: number): void {
    if (this.presenting) {
      this.pageTurn = null;
      this.presentationPage = Math.min(Math.max(0, index), Math.max(0, this.pages.length - 1));
      this.lockPresentation();
      this.scheduleComposite();
      return;
    }
    this.viewport = clampViewport(
      { ...this.viewport, y: pageTopY(this.pages, index) },
      this.screen,
      this.pages,
    );
    this.scheduleComposite();
  }

  restoreViewState(viewState: ViewState): void {
    if (this.screen.width === 0 || this.screen.height === 0) return;
    if (
      !Number.isFinite(viewState.x) ||
      !Number.isFinite(viewState.y) ||
      !Number.isFinite(viewState.zoom) ||
      viewState.zoom <= 0
    ) {
      return;
    }
    const board = boardWidth(this.pages);
    const scale = clampScale(
      viewState.zoom * fitScale(this.screen.width, board),
      this.screen.width,
      board,
    );
    this.viewport = clampViewport(
      { x: viewState.x, y: viewState.y, scale },
      this.screen,
      this.pages,
    );
    this.fitted = false;
    this.scheduleComposite();
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.wheelTimer);
    window.clearTimeout(this.wheelAccumTimer);
    this.observer.disconnect();
    this.stopImageListener();
    this.activeCanvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.activeCanvas.removeEventListener("pointermove", this.handlePointerMove);
    this.activeCanvas.removeEventListener("pointerup", this.handlePointerEnd);
    this.activeCanvas.removeEventListener("pointercancel", this.handlePointerEnd);
    this.activeCanvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.activeCanvas.removeEventListener("contextmenu", preventDefault);
    this.activeCanvas.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("gesturestart", preventDefault);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.baseCanvas.remove();
    this.activeCanvas.remove();
  }

  notifyToolChanged(): void {
    this.scheduleComposite();
  }

  setPresentation(on: boolean): void {
    if (this.presenting === on) return;
    this.presenting = on;
    this.pageTurn = null;
    this.wheelAccum = 0;
    this.panPointerId = null;
    this.lasso = null;
    if (on) {
      const midY = this.viewport.y + this.screen.height / this.viewport.scale / 2;
      this.presentationPage = pageIndexAtY(this.pages, midY);
      this.lockPresentation();
    } else {
      this.viewport = this.browseViewport();
      this.fitted = true;
    }
    this.scheduleComposite();
  }

  private browseViewport(): Viewport {
    return clampViewport(
      {
        x: 0,
        y: pageTopY(this.pages, this.presentationPage),
        scale: fitScale(this.screen.width, boardWidth(this.pages)),
      },
      this.screen,
      this.pages,
    );
  }

  private presentationView(index: number): Viewport {
    const page = this.pages[index];
    const board = boardWidth(this.pages);
    return presentationViewport(
      this.screen,
      page,
      pageLeftX(board, page),
      pageTopY(this.pages, index),
    );
  }

  private lockPresentation(): void {
    if (this.screen.width === 0 || this.screen.height === 0) return;
    if (this.pages.length === 0) return;
    this.presentationPage = Math.min(this.presentationPage, this.pages.length - 1);
    this.viewport = this.presentationView(this.presentationPage);
  }

  private turnPage(delta: number): void {
    if (!this.presenting || this.pageTurn || this.screen.width === 0) return;
    const next = this.presentationPage + delta;
    if (next < 0 || next >= this.pages.length) return;
    this.pageTurn = {
      from: this.viewport,
      to: this.presentationView(next),
      fromPage: this.presentationPage,
      start: performance.now(),
    };
    this.presentationPage = next;
    this.scheduleComposite();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.presenting) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return;
    }
    if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      this.turnPage(1);
    } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      this.turnPage(-1);
    }
  };

  private handleImageLoaded(imageId: string): void {
    let dirty = false;
    for (const page of this.pages) {
      if (page.images.some((image) => image.imageId === imageId)) {
        this.cache.drop(page.id);
        dirty = true;
      }
    }
    if (dirty || this.selection?.images.some((image) => image.imageId === imageId)) {
      this.scheduleComposite();
    }
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.lastDpr = dpr;
    this.pageTurn = null;
    this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
    for (const canvas of [this.baseCanvas, this.activeCanvas]) {
      canvas.width = Math.round(this.screen.width * dpr);
      canvas.height = Math.round(this.screen.height * dpr);
      canvas.style.width = `${this.screen.width}px`;
      canvas.style.height = `${this.screen.height}px`;
    }
    if (this.screen.width === 0 || this.screen.height === 0) return;
    if (this.presenting) {
      this.lockPresentation();
    } else if (this.viewport.scale === 1 && this.pages.length === 0) {
      this.viewport = createViewport(this.screen, this.pages);
    } else {
      if (this.fitted) this.viewport.scale = fitScale(this.screen.width, boardWidth(this.pages));
      this.viewport = clampViewport(this.viewport, this.screen, this.pages);
    }
    this.scheduleComposite();
  }

  private scheduleComposite(): void {
    if (this.rafId !== 0) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.composite();
    });
  }

  private composite(): void {
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== this.lastDpr) {
      this.resize();
      return;
    }
    if (this.pageTurn) {
      const { from, to, start } = this.pageTurn;
      const t = Math.min(1, (performance.now() - start) / PAGE_TURN_MS);
      const k = easeOutCubic(t);
      this.viewport = {
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        scale: from.scale + (to.scale - from.scale) * k,
      };
      if (t >= 1) this.pageTurn = null;
      else this.scheduleComposite();
    }
    const vp = this.viewport;
    const ctx = this.baseCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.screen.width, this.screen.height);

    const live = !this.pinching && !this.wheelZooming && !this.pageTurn;
    const renderScale = dpr * vp.scale;
    const { first, last } = visiblePageRange(vp, this.screen, this.pages);
    const tops = pageTops(this.pages);
    const board = boardWidth(this.pages);
    const keep = new Set<string>();
    for (let i = Math.max(0, first - 1); i <= Math.min(this.pages.length - 1, last + 1); i++) {
      keep.add(this.pages[i].id);
    }
    // A centered page can leave viewport room that would spill onto its neighbors;
    // presentation must draw only the page(s) involved in a turn, the rest stays black.
    let drawFirst = first;
    let drawLast = last;
    if (this.presenting) {
      const partner = this.pageTurn?.fromPage ?? this.presentationPage;
      drawFirst = Math.min(partner, this.presentationPage);
      drawLast = Math.max(partner, this.presentationPage);
    }
    for (let i = drawFirst; i <= drawLast; i++) {
      const page = this.pages[i];
      if (!page) continue;
      const left = pageLeftX(board, page);
      const basePage = this.basePageFor(page);
      if (live && renderScale > maxCacheRenderScale(page)) {
        this.paintPageDirect(ctx, basePage, left, tops[i], dpr);
        // Keep the gesture-time bitmap fresh; capped and incrementally updated internally.
        this.cache.sync(basePage, renderScale);
        continue;
      }
      const bitmap = live
        ? this.cache.sync(basePage, renderScale)
        : (this.cache.peek(page.id) ?? this.cache.sync(basePage, renderScale));
      const sx = (left - vp.x) * vp.scale;
      const sy = (tops[i] - vp.y) * vp.scale;
      const sw = page.width * vp.scale;
      const sh = page.height * vp.scale;
      ctx.drawImage(bitmap, sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    }
    this.cache.prune(keep);
    this.inkCache.prune(keep);
    this.renderActiveStroke(dpr);
    this.renderSelection(dpr);
    this.renderLaserTrail(dpr);
    this.renderEraserRing(dpr);
    this.publishTexts(board, tops);
    this.reportViewPage();
    this.pushSelectionAnchor();
    this.reportViewport();
  }

  private publishTexts(board: number, tops: number[]): void {
    const vp = this.viewport;
    const pages: { pageId: string; x: number; y: number }[] = [];
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      if (page.texts.length === 0) continue;
      pages.push({
        pageId: page.id,
        x: (pageLeftX(board, page) - vp.x) * vp.scale,
        y: (tops[i] - vp.y) * vp.scale,
      });
    }
    const gesture = this.gesture;
    const snapshot: SelectionGestureSnapshot | null = gesture
      ? gesture.kind === "move"
        ? { kind: "move", dx: gesture.dx, dy: gesture.dy, anchor: { x: 0, y: 0 }, sx: 1, sy: 1 }
        : {
            kind: "resize",
            dx: 0,
            dy: 0,
            anchor: gesture.anchor,
            sx: gesture.sx,
            sy: gesture.sy,
          }
      : null;
    publishTextFrame({
      scale: vp.scale,
      pages,
      gesture: snapshot,
      selectedTextIds: this.selection?.texts.map((t) => t.id) ?? [],
    });
  }

  private reportViewport(): void {
    const vp = this.presenting ? this.browseViewport() : this.viewport;
    const last = this.lastReportedView;
    if (last && last.x === vp.x && last.y === vp.y && last.scale === vp.scale) return;
    this.lastReportedView = { x: vp.x, y: vp.y, scale: vp.scale };
    if (this.screen.width === 0) return;
    this.callbacks.onViewportChange({
      x: vp.x,
      y: vp.y,
      zoom: vp.scale / fitScale(this.screen.width, boardWidth(this.pages)),
    });
  }

  private pageForCache(page: Page): Page {
    const sel = this.selection;
    if (!sel || sel.pageId !== page.id) return page;
    if (this.selectionBase?.source === page) return this.selectionBase.derived;
    const strokeIds = new Set(sel.strokes.map((s) => s.id));
    const derived =
      sel.images.length > 0
        ? { ...page, strokes: [], images: [] }
        : { ...page, strokes: page.strokes.filter((s) => !strokeIds.has(s.id)) };
    this.selectionBase = { source: page, derived };
    return derived;
  }

  // Text lives in the DOM overlay between the base and active canvases, so a
  // page with texts keeps its ink out of the base bitmap; the strokes composite
  // separately above the overlay (renderPageInk) to match the export order.
  private basePageFor(page: Page): Page {
    const source = this.pageForCache(page);
    if (source.texts.length === 0) return source;
    let derived = this.derivedBase.get(source);
    if (!derived) {
      derived = { ...source, strokes: [] };
      this.derivedBase.set(source, derived);
    }
    return derived;
  }

  private inkPageFor(page: Page): Page | null {
    const source = this.pageForCache(page);
    if (source.texts.length === 0 || source.strokes.length === 0) return null;
    let derived = this.derivedInk.get(source);
    if (!derived) {
      derived = { ...source, images: [], pattern: "blank", paperColor: "transparent" };
      this.derivedInk.set(source, derived);
    }
    return derived;
  }

  private renderLaserTrail(dpr: number): void {
    const trail = this.laser;
    if (!trail) return;
    const now = performance.now();
    trail.points = trail.points.filter((p) => now - p.t < LASER_LIFETIME_MS * 1.5);
    const ctx = this.activeCtx;
    const vp = this.viewport;
    const s = dpr * vp.scale;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < trail.points.length; i++) {
      const age = (now - trail.points[i].t) / LASER_LIFETIME_MS;
      if (age >= 1) continue;
      ctx.strokeStyle = `rgba(224, 36, 36, ${(1 - age) * 0.9})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(trail.points[i - 1].x, trail.points[i - 1].y);
      ctx.lineTo(trail.points[i].x, trail.points[i].y);
      ctx.stroke();
    }
    if (trail.pointerId !== -1 && trail.points.length > 0) {
      const head = trail.points[trail.points.length - 1];
      ctx.fillStyle = "rgba(224, 36, 36, 0.9)";
      ctx.beginPath();
      ctx.arc(head.x, head.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (trail.points.length === 0 && trail.pointerId === -1) {
      this.laser = null;
      return;
    }
    this.scheduleComposite();
  }

  private handlePointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || !this.hover) return;
    this.hover = null;
    this.scheduleComposite();
  };

  // Two-tone ring: visible on any paper color, chalkboard included.
  private renderEraserRing(dpr: number): void {
    const hover = this.hover;
    if (!hover || this.callbacks.getTool().tool !== "eraser") return;
    const radius = ERASER_RING_RADIUS * this.viewport.scale;
    const ctx = this.activeCtx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(20, 20, 20, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private paintPageDirect(
    ctx: CanvasRenderingContext2D,
    page: Page,
    left: number,
    top: number,
    dpr: number,
  ): void {
    const vp = this.viewport;
    const s = dpr * vp.scale;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
    ctx.fillStyle = page.paperColor;
    ctx.fillRect(left, top, page.width, page.height);
    ctx.beginPath();
    ctx.rect(left, top, page.width, page.height);
    ctx.clip();
    ctx.translate(left, top);
    drawPagePattern(ctx, page.pattern, page.paperColor, page.width, page.height);
    // Direct drawing recomputes every stroke outline per frame; skip what the
    // viewport cannot see (bounds include the ink margin).
    const viewLeft = vp.x - left;
    const viewTop = vp.y - top;
    const viewRight = viewLeft + this.screen.width / vp.scale;
    const viewBottom = viewTop + this.screen.height / vp.scale;
    for (const image of page.images) {
      if (
        image.x > viewRight ||
        image.x + image.width < viewLeft ||
        image.y > viewBottom ||
        image.y + image.height < viewTop
      ) {
        continue;
      }
      const bitmap = getImageBitmap(image.imageId);
      if (bitmap) ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
    }
    for (const stroke of page.strokes) {
      const bounds = strokeBounds(stroke, effectiveStrokeSize(stroke) / 2);
      if (
        bounds.minX > viewRight ||
        bounds.maxX < viewLeft ||
        bounds.minY > viewBottom ||
        bounds.maxY < viewTop
      ) {
        continue;
      }
      drawStroke(ctx, stroke);
    }
    ctx.restore();
    const sx = (left - vp.x) * vp.scale;
    const sy = (top - vp.y) * vp.scale;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, page.width * vp.scale - 1, page.height * vp.scale - 1);
  }

  private renderActiveStroke(dpr: number): void {
    const ctx = this.activeCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.screen.width, this.screen.height);
    this.renderPageInk(dpr);
    const stroke = this.stroke;
    if (!stroke) return;
    const pageIndex = this.pages.findIndex((p) => p.id === stroke.pageId);
    if (pageIndex < 0) return;
    const page = this.pages[pageIndex];
    const left = pageLeftX(boardWidth(this.pages), page);
    const vp = this.viewport;
    const s = dpr * vp.scale;
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
    ctx.translate(left, pageTopY(this.pages, pageIndex));
    const preview = createStroke({
      pen: stroke.pen,
      color: stroke.color,
      size: stroke.size,
      shape: stroke.shape,
      simulatePressure: stroke.simulatePressure,
      points: [...stroke.points, ...stroke.predicted],
    });
    drawStroke(ctx, preview, false);
  }

  private renderPageInk(dpr: number): void {
    const vp = this.viewport;
    const live = !this.pinching && !this.wheelZooming && !this.pageTurn;
    const renderScale = dpr * vp.scale;
    const { first, last } = visiblePageRange(vp, this.screen, this.pages);
    const tops = pageTops(this.pages);
    const board = boardWidth(this.pages);
    let drawFirst = first;
    let drawLast = last;
    if (this.presenting) {
      const partner = this.pageTurn?.fromPage ?? this.presentationPage;
      drawFirst = Math.min(partner, this.presentationPage);
      drawLast = Math.max(partner, this.presentationPage);
    }
    const ctx = this.activeCtx;
    for (let i = drawFirst; i <= drawLast; i++) {
      const page = this.pages[i];
      if (!page) continue;
      const inkPage = this.inkPageFor(page);
      if (!inkPage) continue;
      const left = pageLeftX(board, page);
      const top = tops[i];
      if (live && renderScale > maxCacheRenderScale(page)) {
        this.inkCache.sync(inkPage, renderScale);
        const s = renderScale;
        ctx.save();
        ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
        ctx.beginPath();
        ctx.rect(left, top, page.width, page.height);
        ctx.clip();
        ctx.translate(left, top);
        const viewLeft = vp.x - left;
        const viewTop = vp.y - top;
        const viewRight = viewLeft + this.screen.width / vp.scale;
        const viewBottom = viewTop + this.screen.height / vp.scale;
        for (const stroke of inkPage.strokes) {
          const bounds = strokeBounds(stroke, effectiveStrokeSize(stroke) / 2);
          if (
            bounds.minX > viewRight ||
            bounds.maxX < viewLeft ||
            bounds.minY > viewBottom ||
            bounds.maxY < viewTop
          ) {
            continue;
          }
          drawStroke(ctx, stroke);
        }
        ctx.restore();
        continue;
      }
      const bitmap = live
        ? this.inkCache.sync(inkPage, renderScale)
        : (this.inkCache.peek(page.id) ?? this.inkCache.sync(inkPage, renderScale));
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(
        bitmap,
        (left - vp.x) * vp.scale,
        (top - vp.y) * vp.scale,
        page.width * vp.scale,
        page.height * vp.scale,
      );
      ctx.restore();
    }
  }

  private renderSelection(dpr: number): void {
    const ctx = this.activeCtx;
    const vp = this.viewport;
    const s = dpr * vp.scale;
    const lasso = this.lasso;
    if (lasso && lasso.points.length > 0) {
      const lassoIndex = this.pages.findIndex((p) => p.id === lasso.pageId);
      if (lassoIndex < 0) return;
      const lassoPage = this.pages[lassoIndex];
      ctx.save();
      ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
      ctx.translate(pageLeftX(boardWidth(this.pages), lassoPage), pageTopY(this.pages, lassoIndex));
      ctx.beginPath();
      ctx.moveTo(lasso.points[0].x, lasso.points[0].y);
      for (let i = 1; i < lasso.points.length; i++) {
        ctx.lineTo(lasso.points[i].x, lasso.points[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(47, 111, 221, 0.08)";
      ctx.fill();
      ctx.strokeStyle = SELECTION_ACCENT;
      ctx.lineWidth = 1.5 / vp.scale;
      ctx.stroke();
      ctx.restore();
    }
    const sel = this.selection;
    if (!sel) return;
    const pageIndex = this.pages.findIndex((p) => p.id === sel.pageId);
    if (pageIndex < 0) return;
    const page = this.pages[pageIndex];
    const top = pageTopY(this.pages, pageIndex);
    const left = pageLeftX(boardWidth(this.pages), page);
    ctx.save();
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
    ctx.translate(left, top);
    if (sel.images.length > 0) {
      // Images stay beneath the text overlay even while selected, so they draw
      // onto the base canvas (below the overlay); ink belongs above it.
      const baseCtx = this.baseCtx;
      baseCtx.save();
      baseCtx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
      baseCtx.translate(left, top);
      const selectedImageIds = new Set(sel.images.map((i) => i.id));
      for (const image of page.images) {
        const bitmap = getImageBitmap(image.imageId);
        if (!bitmap) continue;
        if (selectedImageIds.has(image.id)) {
          baseCtx.save();
          this.applyGestureTransform(baseCtx);
          baseCtx.drawImage(bitmap, image.x, image.y, image.width, image.height);
          baseCtx.restore();
        } else {
          baseCtx.drawImage(bitmap, image.x, image.y, image.width, image.height);
        }
      }
      baseCtx.restore();
      const live = !this.pinching && !this.wheelZooming && !this.pageTurn;
      if (live && s > maxCacheRenderScale(page)) {
        const selectedStrokeIds = new Set(sel.strokes.map((st) => st.id));
        for (const stroke of page.strokes) {
          if (!selectedStrokeIds.has(stroke.id)) drawStroke(ctx, stroke);
        }
      } else {
        const overlay = this.strokeOverlay(page, sel, s, live);
        if (overlay) ctx.drawImage(overlay, 0, 0, page.width, page.height);
      }
      ctx.save();
      this.applyGestureTransform(ctx);
      for (const stroke of sel.strokes) drawStroke(ctx, stroke);
      ctx.restore();
    } else {
      this.applyGestureTransform(ctx);
      for (const stroke of sel.strokes) drawStroke(ctx, stroke);
    }
    ctx.restore();
    this.renderSelectionChrome(dpr, pageIndex);
  }

  private applyGestureTransform(ctx: CanvasRenderingContext2D): void {
    const gesture = this.gesture;
    if (gesture?.kind === "move") {
      ctx.translate(gesture.dx, gesture.dy);
    } else if (gesture?.kind === "resize") {
      ctx.translate(gesture.anchor.x, gesture.anchor.y);
      ctx.scale(gesture.sx, gesture.sy);
      ctx.translate(-gesture.anchor.x, -gesture.anchor.y);
    }
  }

  private strokeOverlay(
    page: Page,
    sel: SelectionState,
    renderScale: number,
    live: boolean,
  ): HTMLCanvasElement | null {
    if (sel.strokes.length === page.strokes.length) return null;
    const capped = Math.min(renderScale, maxCacheRenderScale(page));
    const cached = this.strokeOverlayCache;
    if (
      cached &&
      cached.page === page &&
      cached.selection === sel &&
      (cached.renderScale === capped || !live)
    ) {
      return cached.canvas;
    }
    const canvas = cached?.canvas ?? document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(page.width * capped));
    canvas.height = Math.max(1, Math.round(page.height * capped));
    const ctx = get2dContext(canvas);
    ctx.setTransform(capped, 0, 0, capped, 0, 0);
    const selectedIds = new Set(sel.strokes.map((s) => s.id));
    for (const stroke of page.strokes) {
      if (!selectedIds.has(stroke.id)) drawStroke(ctx, stroke);
    }
    this.strokeOverlayCache = { canvas, renderScale: capped, page, selection: sel };
    return canvas;
  }

  private renderSelectionChrome(dpr: number, pageIndex: number): void {
    const rect = this.selectionScreenRect(pageIndex);
    if (!rect) return;
    const ctx = this.activeCtx;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = SELECTION_ACCENT;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
    if (!this.gesture && !this.pinching && !this.wheelZooming) {
      ctx.fillStyle = "#ffffff";
      for (const handle of handlePositions(rect)) {
        ctx.beginPath();
        ctx.rect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private previewBounds(): Bounds | null {
    const sel = this.selection;
    if (!sel) return null;
    const gesture = this.gesture;
    if (gesture?.kind === "move") return translateBounds(sel.bounds, gesture.dx, gesture.dy);
    if (gesture?.kind === "resize") {
      return scaleBounds(gesture.origBounds, gesture.anchor, gesture.sx, gesture.sy);
    }
    return sel.bounds;
  }

  private selectionScreenRect(
    pageIndex: number,
  ): { x: number; y: number; w: number; h: number } | null {
    const bounds = this.previewBounds();
    if (!bounds) return null;
    const page = this.pages[pageIndex];
    if (!page) return null;
    const vp = this.viewport;
    const left = pageLeftX(boardWidth(this.pages), page);
    const x = (left + bounds.minX - vp.x) * vp.scale;
    const y = (pageTopY(this.pages, pageIndex) + bounds.minY - vp.y) * vp.scale;
    return {
      x,
      y,
      w: (bounds.maxX - bounds.minX) * vp.scale,
      h: (bounds.maxY - bounds.minY) * vp.scale,
    };
  }

  private pushSelectionAnchor(): void {
    const sel = this.selection;
    const pageIndex = sel ? this.pages.findIndex((p) => p.id === sel.pageId) : -1;
    const rect =
      pageIndex >= 0 && !this.gesture && !this.lasso && !this.pinching && !this.wheelZooming
        ? this.selectionScreenRect(pageIndex)
        : null;
    this.callbacks.onSelectionAnchor(rect ? { x: rect.x + rect.w / 2, y: rect.y - 10 } : null);
  }

  private reportViewPage(): void {
    const midY = this.viewport.y + this.screen.height / this.viewport.scale / 2;
    const index = pageIndexAtY(this.pages, midY);
    if (index !== this.lastReportedPage) {
      this.lastReportedPage = index;
      this.callbacks.onViewChange(index);
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button === 2) return;
    if (this.callbacks.getTool().exporting) return;
    this.activeCanvas.setPointerCapture(event.pointerId);
    const pos = this.eventPos(event);
    this.pointers.set(event.pointerId, { ...pos, type: event.pointerType });
    if (event.pointerType === "pen") this.markPenSeen();

    if (this.touchCount() === 2) {
      if (this.stroke && this.pointerTypeOf(this.stroke.pointerId) === "touch") this.cancelStroke();
      this.erasing = null;
      if (this.laser) this.laser.pointerId = -1;
      this.lasso = null;
      this.gesture = null;
      this.pinching = true;
      this.panPointerId = null;
      if (this.presenting) {
        const touches = [...this.pointers.values()].filter((p) => p.type === "touch");
        this.swipeStartY = (touches[0].y + touches[1].y) / 2;
        this.swipeUsed = false;
      }
      return;
    }

    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const hit = pageAt(this.pages, world.x, world.y);

    const toolKind = this.callbacks.getTool().tool;
    if (toolKind === "eraser") {
      if (this.canDraw(event) && hit && !this.erasing) {
        this.erasing = {
          pointerId: event.pointerId,
          pageId: this.pages[hit.index].id,
          removed: new Set(),
        };
        this.eraseAt(pos);
        return;
      }
      if (!this.presenting && this.panPointerId === null) this.panPointerId = event.pointerId;
      return;
    }

    if (toolKind === "laser") {
      if (this.canDraw(event)) {
        this.laser = { pointerId: event.pointerId, points: [this.toWorldPoint(event)] };
        this.scheduleComposite();
        return;
      }
      if (!this.presenting && this.panPointerId === null) this.panPointerId = event.pointerId;
      return;
    }

    if (toolKind === "select") {
      if (this.canDraw(event) && !this.lasso && !this.gesture) {
        this.beginSelect(event, world);
      } else if (!this.presenting && this.panPointerId === null) {
        this.panPointerId = event.pointerId;
      }
      return;
    }

    if (toolKind === "text") {
      if (this.canDraw(event) && hit) {
        this.callbacks.onTextTap(this.pages[hit.index].id, hit.x, hit.y);
        return;
      }
      if (!this.presenting && this.panPointerId === null) this.panPointerId = event.pointerId;
      return;
    }

    if (this.canDraw(event) && !this.stroke) {
      if (hit) {
        this.beginStroke(event, hit.index, hit.x, hit.y);
        return;
      }
    }
    if (!this.presenting && this.panPointerId === null) this.panPointerId = event.pointerId;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const pos = this.eventPos(event);
    if (event.pointerType !== "touch") {
      this.hover = pos;
      if (this.callbacks.getTool().tool === "eraser") this.scheduleComposite();
    }
    const prev = this.pointers.get(event.pointerId);
    if (!prev) return;
    this.pointers.set(event.pointerId, { ...pos, type: event.pointerType });

    if (this.pinching && event.pointerType === "touch") {
      if (this.presenting) this.applySwipe(event.pointerId, pos);
      else this.applyPinch(event.pointerId, prev, pos);
    } else if (this.panPointerId === event.pointerId) {
      this.viewport = panBy(this.viewport, pos.x - prev.x, pos.y - prev.y, this.screen, this.pages);
      this.scheduleComposite();
    }

    const stroke = this.stroke;
    if (stroke && stroke.pointerId === event.pointerId) {
      if (event.buttons === 0) {
        this.commitStroke();
      } else {
        const pageIndex = this.pages.findIndex((p) => p.id === stroke.pageId);
        if (pageIndex >= 0) {
          if (stroke.shape) {
            stroke.points[1] = this.toPagePoint(event, pageIndex);
          } else {
            for (const e of coalesced(event)) {
              stroke.points.push(this.toPagePoint(e, pageIndex));
            }
            stroke.predicted = predicted(event).map((e) => this.toPagePoint(e, pageIndex));
          }
        }
      }
      this.scheduleComposite();
    }

    if (this.erasing?.pointerId === event.pointerId) {
      if (event.buttons === 0) this.erasing = null;
      else for (const e of coalesced(event)) this.eraseAt(this.eventPos(e));
    }

    if (this.laser?.pointerId === event.pointerId) {
      if (event.buttons === 0) {
        this.laser.pointerId = -1;
      } else {
        for (const e of coalesced(event)) this.laser.points.push(this.toWorldPoint(e));
      }
      this.scheduleComposite();
    }

    if (this.lasso?.pointerId === event.pointerId) {
      if (event.buttons === 0) {
        this.finishLasso();
      } else {
        const lasso = this.lasso;
        const lassoIndex = this.pages.findIndex((p) => p.id === lasso.pageId);
        if (lassoIndex < 0) {
          this.lasso = null;
        } else {
          for (const e of coalesced(event)) {
            const point = this.toPagePoint(e, lassoIndex);
            lasso.points.push({ x: point.x, y: point.y });
          }
        }
      }
      this.scheduleComposite();
    }

    if (this.gesture?.pointerId === event.pointerId) {
      if (event.buttons === 0) {
        this.commitGesture();
      } else {
        this.updateGesture(event);
      }
      this.scheduleComposite();
    }
  };

  private handlePointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (
      this.stroke?.pointerId === event.pointerId &&
      (event.type === "pointercancel" || event.button === this.stroke.button)
    ) {
      this.commitStroke();
    }
    if (this.erasing?.pointerId === event.pointerId) this.erasing = null;
    if (this.laser?.pointerId === event.pointerId) this.laser.pointerId = -1;
    if (this.lasso?.pointerId === event.pointerId) {
      if (event.type === "pointercancel") this.lasso = null;
      else this.finishLasso();
    }
    if (this.gesture?.pointerId === event.pointerId) {
      if (event.type === "pointercancel") this.gesture = null;
      else this.commitGesture();
    }
    if (this.panPointerId === event.pointerId) this.panPointerId = null;
    if (this.pinching && this.touchCount() < 2) {
      this.pinching = false;
      if (!this.presenting) {
        const remaining = [...this.pointers.entries()].find(([, p]) => p.type === "touch");
        this.panPointerId = remaining ? remaining[0] : null;
      }
    }
    this.scheduleComposite();
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const unit = event.deltaMode === 2 ? this.screen.height : event.deltaMode === 1 ? 16 : 1;
    if (this.presenting) {
      this.wheelAccum += event.deltaY * unit;
      window.clearTimeout(this.wheelAccumTimer);
      this.wheelAccumTimer = window.setTimeout(() => {
        this.wheelAccum = 0;
      }, WHEEL_ACCUM_RESET_MS);
      if (!this.pageTurn && Math.abs(this.wheelAccum) >= WHEEL_PAGE_THRESHOLD) {
        const delta = this.wheelAccum > 0 ? 1 : -1;
        this.wheelAccum = 0;
        this.turnPage(delta);
      }
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      const pos = this.eventPos(event);
      const factor = Math.exp(-event.deltaY * unit * 0.0022);
      this.viewport = zoomAt(
        this.viewport,
        pos,
        this.viewport.scale * factor,
        this.screen,
        this.pages,
      );
      this.wheelZooming = true;
      this.fitted = false;
    } else {
      this.viewport = panBy(
        this.viewport,
        -event.deltaX * unit,
        -event.deltaY * unit,
        this.screen,
        this.pages,
      );
    }
    this.scheduleComposite();
    window.clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => {
      this.wheelZooming = false;
      this.scheduleComposite();
    }, WHEEL_ZOOM_SETTLE_MS);
  };

  private applySwipe(pointerId: number, pos: Point): void {
    if (this.swipeUsed) return;
    const other = [...this.pointers.entries()].find(
      ([id, p]) => id !== pointerId && p.type === "touch",
    );
    if (!other) return;
    const midY = (pos.y + other[1].y) / 2;
    const dy = midY - this.swipeStartY;
    if (Math.abs(dy) < SWIPE_PAGE_THRESHOLD) return;
    this.swipeUsed = true;
    this.turnPage(dy < 0 ? 1 : -1);
  }

  private applyPinch(pointerId: number, prev: TrackedPointer, pos: Point): void {
    const touches = [...this.pointers.entries()].filter(([, p]) => p.type === "touch");
    if (touches.length < 2) return;
    const otherEntry = touches.find(([id]) => id !== pointerId);
    if (!otherEntry) return;
    const other = otherEntry[1];
    const prevMid = midpoint(prev, other);
    const curMid = midpoint(pos, other);
    const prevDist = distance(prev, other);
    const curDist = distance(pos, other);
    if (prevDist <= 0 || curDist <= 0) return;
    let vp = zoomAt(
      this.viewport,
      curMid,
      this.viewport.scale * (curDist / prevDist),
      this.screen,
      this.pages,
    );
    vp = panBy(vp, curMid.x - prevMid.x, curMid.y - prevMid.y, this.screen, this.pages);
    this.viewport = vp;
    this.fitted = false;
    this.scheduleComposite();
  }

  private canDraw(event: PointerEvent): boolean {
    if (event.pointerType === "pen") return true;
    if (event.pointerType === "mouse") return event.button === 0;
    return !this.penSeen && this.touchCount() === 1;
  }

  private beginStroke(event: PointerEvent, pageIndex: number, x: number, y: number): void {
    const page = this.pages[pageIndex];
    if (!page) return;
    const tool = this.callbacks.getTool();
    if (tool.tool !== "pen" && tool.tool !== "highlighter" && !isShapeTool(tool.tool)) return;
    const clamped = clampToPage(page, x, y);
    this.stroke = {
      pointerId: event.pointerId,
      button: event.button,
      pageId: page.id,
      pen: isShapeTool(tool.tool) ? "pen" : tool.tool,
      color: tool.color,
      size: tool.size,
      shape: isShapeTool(tool.tool) ? tool.tool : undefined,
      simulatePressure: event.pointerType !== "pen",
      points: [{ x: clamped.x, y: clamped.y, pressure: pressureOf(event) }],
      predicted: [],
    };
    this.scheduleComposite();
  }

  private commitStroke(): void {
    const stroke = this.stroke;
    this.stroke = null;
    this.scheduleComposite();
    if (!stroke || stroke.points.length === 0) return;
    if (stroke.shape) {
      const [a, b] = stroke.points;
      if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 2) return;
    }
    this.callbacks.onCommitStroke(
      stroke.pageId,
      createStroke({
        pen: stroke.pen,
        color: stroke.color,
        size: stroke.size,
        shape: stroke.shape,
        simulatePressure: stroke.simulatePressure,
        points: stroke.points,
      }),
    );
  }

  private cancelStroke(): void {
    this.stroke = null;
    this.scheduleComposite();
  }

  private beginSelect(event: PointerEvent, world: Point): void {
    const sel = this.selection;
    if (sel) {
      const pageIndex = this.pages.findIndex((p) => p.id === sel.pageId);
      if (pageIndex >= 0) {
        const rect = this.selectionScreenRect(pageIndex);
        if (rect) {
          const pos = this.eventPos(event);
          const handle = handlePositions(rect).find(
            (h) => Math.hypot(pos.x - h.x, pos.y - h.y) <= HANDLE_HIT_RADIUS,
          );
          if (handle) {
            this.gesture = this.beginResize(event.pointerId, handle.kind);
            this.scheduleComposite();
            return;
          }
        }
        const inflate = 10 / this.viewport.scale;
        const selPage = this.pages[pageIndex];
        const selLeft = pageLeftX(boardWidth(this.pages), selPage);
        const local = {
          x: world.x - selLeft,
          y: world.y - pageTopY(this.pages, pageIndex),
        };
        if (
          local.x >= sel.bounds.minX - inflate &&
          local.x <= sel.bounds.maxX + inflate &&
          local.y >= sel.bounds.minY - inflate &&
          local.y <= sel.bounds.maxY + inflate
        ) {
          this.gesture = { kind: "move", pointerId: event.pointerId, origin: local, dx: 0, dy: 0 };
          this.scheduleComposite();
          return;
        }
      }
      this.clearSelection();
    }
    const hit = pageAt(this.pages, world.x, world.y);
    if (!hit) {
      if (!this.presenting && this.panPointerId === null) this.panPointerId = event.pointerId;
      return;
    }
    const clamped = clampToPage(this.pages[hit.index], hit.x, hit.y);
    this.lasso = {
      pointerId: event.pointerId,
      pageId: this.pages[hit.index].id,
      points: [clamped],
    };
    this.scheduleComposite();
  }

  private beginResize(pointerId: number, handle: HandleKind): SelectGesture {
    const bounds = this.selection?.bounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const starts: Record<HandleKind, Point> = {
      nw: { x: bounds.minX, y: bounds.minY },
      n: { x: cx, y: bounds.minY },
      ne: { x: bounds.maxX, y: bounds.minY },
      e: { x: bounds.maxX, y: cy },
      se: { x: bounds.maxX, y: bounds.maxY },
      s: { x: cx, y: bounds.maxY },
      sw: { x: bounds.minX, y: bounds.maxY },
      w: { x: bounds.minX, y: cy },
    };
    const anchors: Record<HandleKind, Point> = {
      nw: { x: bounds.maxX, y: bounds.maxY },
      n: { x: cx, y: bounds.maxY },
      ne: { x: bounds.minX, y: bounds.maxY },
      e: { x: bounds.minX, y: cy },
      se: { x: bounds.minX, y: bounds.minY },
      s: { x: cx, y: bounds.minY },
      sw: { x: bounds.maxX, y: bounds.minY },
      w: { x: bounds.maxX, y: cy },
    };
    // Bounds include the ink margin, so an anchor can sit outside the page;
    // clamp it back in or clampScaleToPage cannot keep the baked result on-page.
    const page = this.pages.find((p) => p.id === this.selection?.pageId);
    const raw = anchors[handle];
    const anchor = page ? clampToPage(page, raw.x, raw.y) : raw;
    return {
      kind: "resize",
      pointerId,
      handle,
      anchor,
      start: starts[handle],
      origBounds: bounds,
      sx: 1,
      sy: 1,
    };
  }

  private updateGesture(event: PointerEvent): void {
    const gesture = this.gesture;
    const sel = this.selection;
    if (!gesture || !sel) return;
    const pageIndex = this.pages.findIndex((p) => p.id === sel.pageId);
    if (pageIndex < 0) return;
    const page = this.pages[pageIndex];
    const left = pageLeftX(boardWidth(this.pages), page);
    const pos = this.eventPos(event);
    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const local = { x: world.x - left, y: world.y - pageTopY(this.pages, pageIndex) };
    if (gesture.kind === "move") {
      const clamped = clampMoveDelta(
        sel.bounds,
        local.x - gesture.origin.x,
        local.y - gesture.origin.y,
        page.width,
        page.height,
      );
      gesture.dx = clamped.dx;
      gesture.dy = clamped.dy;
      return;
    }
    const { anchor, start, handle, origBounds } = gesture;
    let sx = 1;
    let sy = 1;
    if (handle === "n" || handle === "s") {
      sy = ratio(local.y - anchor.y, start.y - anchor.y);
    } else if (handle === "e" || handle === "w") {
      sx = ratio(local.x - anchor.x, start.x - anchor.x);
    } else {
      const ux = start.x - anchor.x;
      const uy = start.y - anchor.y;
      const denom = ux * ux + uy * uy;
      const s = denom > 0 ? ((local.x - anchor.x) * ux + (local.y - anchor.y) * uy) / denom : 1;
      sx = s;
      sy = s;
    }
    sx = Math.max(MIN_SELECTION_SCALE, sx);
    sy = Math.max(MIN_SELECTION_SCALE, sy);
    const clamped = clampScaleToPage(origBounds, anchor, sx, sy, page.width, page.height);
    if (handle === "nw" || handle === "ne" || handle === "se" || handle === "sw") {
      const uniform = Math.min(clamped.sx, clamped.sy);
      gesture.sx = uniform;
      gesture.sy = uniform;
    } else {
      gesture.sx = clamped.sx;
      gesture.sy = clamped.sy;
    }
  }

  private commitGesture(): void {
    const gesture = this.gesture;
    this.gesture = null;
    this.scheduleComposite();
    const sel = this.selection;
    if (!gesture || !sel) return;
    if (gesture.kind === "move") {
      if (Math.abs(gesture.dx) < 0.01 && Math.abs(gesture.dy) < 0.01) return;
      this.callbacks.onTransformSelection(
        { strokes: sel.strokes, images: sel.images, texts: sel.texts },
        {
          strokes: sel.strokes.map((s) => translateStroke(s, gesture.dx, gesture.dy)),
          images: sel.images.map((i) => translateImage(i, gesture.dx, gesture.dy)),
          texts: sel.texts.map((t) => translateText(t, gesture.dx, gesture.dy)),
        },
      );
      return;
    }
    if (Math.abs(gesture.sx - 1) < 0.001 && Math.abs(gesture.sy - 1) < 0.001) return;
    this.callbacks.onTransformSelection(
      { strokes: sel.strokes, images: sel.images, texts: sel.texts },
      {
        strokes: sel.strokes.map((s) => scaleStroke(s, gesture.anchor, gesture.sx, gesture.sy)),
        images: sel.images.map((i) => scaleImage(i, gesture.anchor, gesture.sx, gesture.sy)),
        texts: sel.texts.map((t) => scaleTextReflow(t, gesture.anchor, gesture.sx, gesture.sy)),
      },
    );
  }

  private finishLasso(): void {
    const lasso = this.lasso;
    this.lasso = null;
    this.scheduleComposite();
    if (!lasso) return;
    const page = this.pages.find((p) => p.id === lasso.pageId);
    const strokes = page ? strokesInLasso(page.strokes, lasso.points) : [];
    const images = page ? imagesInLasso(page.images, lasso.points) : [];
    const texts = page ? textsInLasso(page.texts, lasso.points, textItemHeight) : [];
    const bounds = this.selectionBounds(strokes, images, texts);
    if (!page || !bounds) {
      this.clearSelection();
      return;
    }
    this.selection = { pageId: page.id, strokes, images, texts, bounds };
    this.selectionBase = null;
    this.strokeOverlayCache = null;
    this.callbacks.onSelectionChange({
      pageId: page.id,
      strokeIds: strokes.map((s) => s.id),
      imageIds: images.map((i) => i.id),
      textIds: texts.map((t) => t.id),
    });
  }

  private clearSelection(): void {
    if (!this.selection) return;
    this.selection = null;
    this.selectionBase = null;
    this.strokeOverlayCache = null;
    this.gesture = null;
    this.callbacks.onSelectionChange(null);
    this.scheduleComposite();
  }

  private eraseAt(pos: Point): void {
    const erasing = this.erasing;
    if (!erasing) return;
    const pageIndex = this.pages.findIndex((p) => p.id === erasing.pageId);
    if (pageIndex < 0) {
      this.erasing = null;
      return;
    }
    const page = this.pages[pageIndex];
    const left = pageLeftX(boardWidth(this.pages), page);
    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const local = { x: world.x - left, y: world.y - pageTopY(this.pages, pageIndex) };
    for (const stroke of page.strokes) {
      if (erasing.removed.has(stroke.id)) continue;
      if (hitTestStroke(local, stroke, ERASER_TOLERANCE)) {
        erasing.removed.add(stroke.id);
        this.callbacks.onEraseStroke(page.id, stroke.id);
      }
    }
  }

  private toPagePoint(event: PointerEvent, pageIndex: number): StrokePoint {
    const page = this.pages[pageIndex];
    const left = pageLeftX(boardWidth(this.pages), page);
    const pos = this.eventPos(event);
    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const local = clampToPage(page, world.x - left, world.y - pageTopY(this.pages, pageIndex));
    return { x: local.x, y: local.y, pressure: pressureOf(event) };
  }

  private toWorldPoint(event: PointerEvent): { x: number; y: number; t: number } {
    const pos = this.eventPos(event);
    const world = screenToWorld(this.viewport, pos.x, pos.y);
    return { x: world.x, y: world.y, t: performance.now() };
  }

  private eventPos(event: { clientX: number; clientY: number }): Point {
    const rect = this.container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private touchCount(): number {
    let count = 0;
    for (const p of this.pointers.values()) if (p.type === "touch") count++;
    return count;
  }

  private pointerTypeOf(pointerId: number): string | undefined {
    return this.pointers.get(pointerId)?.type;
  }

  private markPenSeen(): void {
    if (this.penSeen) return;
    this.penSeen = true;
    try {
      localStorage.setItem(PEN_SEEN_KEY, "1");
    } catch {
      // storage may be unavailable; session-only flag still works
    }
  }
}

function readPenSeen(): boolean {
  try {
    return localStorage.getItem(PEN_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function createLayer(className = "board-layer"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  return canvas;
}

function pressureOf(event: PointerEvent): number {
  return event.pressure > 0 ? event.pressure : 0.5;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ratio(numerator: number, denominator: number): number {
  return Math.abs(denominator) < 1e-6 ? 1 : numerator / denominator;
}

function handlePositions(rect: { x: number; y: number; w: number; h: number }): {
  kind: HandleKind;
  x: number;
  y: number;
}[] {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return [
    { kind: "nw", x: rect.x, y: rect.y },
    { kind: "n", x: cx, y: rect.y },
    { kind: "ne", x: right, y: rect.y },
    { kind: "e", x: right, y: cy },
    { kind: "se", x: right, y: bottom },
    { kind: "s", x: cx, y: bottom },
    { kind: "sw", x: rect.x, y: bottom },
    { kind: "w", x: rect.x, y: cy },
  ];
}

function coalesced(event: PointerEvent): PointerEvent[] {
  const events = event.getCoalescedEvents?.();
  return events && events.length > 0 ? events : [event];
}

function predicted(event: PointerEvent): PointerEvent[] {
  return event.getPredictedEvents?.() ?? [];
}

function preventDefault(event: Event): void {
  event.preventDefault();
}

function isShapeTool(tool: ToolKind): tool is ShapeKind {
  return SHAPE_KINDS.includes(tool as ShapeKind);
}
