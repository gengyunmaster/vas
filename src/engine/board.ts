import { type Bounds, ERASER_TOLERANCE, hitTestStroke } from "../model/hitTest";
import type { ImageItem } from "../model/image";
import {
  clampToPage,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type Page,
  pageAt,
  pageIndexAtY,
  pageTopY,
} from "../model/page";
import { imagesInLasso, strokesInLasso } from "../model/selection";
import {
  createStroke,
  type PenKind,
  SHAPE_KINDS,
  type ShapeKind,
  type Stroke,
  type StrokePoint,
  type ToolKind,
} from "../model/stroke";
import {
  clampMoveDelta,
  clampScaleToPage,
  imagesBounds,
  scaleBounds,
  scaleImage,
  scaleStroke,
  strokesBounds,
  translateBounds,
  translateImage,
  translateStroke,
  unionBounds,
} from "../model/transform";
import type { ViewState } from "../model/viewState";
import { get2dContext } from "./canvas";
import { getImageBitmap, onImageLoaded } from "./imageCache";
import { MAX_CACHE_RENDER_SCALE, PageCache } from "./pageCache";
import { drawPagePattern } from "./patterns";
import { drawStroke } from "./renderStroke";
import {
  clampScale,
  clampViewport,
  createViewport,
  fitScale,
  type Point,
  panBy,
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
}

export interface SelectionSnapshot {
  pageId: string;
  strokeIds: string[];
  imageIds: string[];
}

interface BoardCallbacks {
  getTool: () => ToolSettings;
  onCommitStroke: (pageId: string, stroke: Stroke) => void;
  onEraseStroke: (pageId: string, strokeId: string) => void;
  onViewChange: (pageIndex: number) => void;
  onSelectionChange: (selection: SelectionSnapshot | null) => void;
  onSelectionAnchor: (anchor: Point | null) => void;
  onTransformSelection: (
    before: { strokes: Stroke[]; images: ImageItem[] },
    after: { strokes: Stroke[]; images: ImageItem[] },
  ) => void;
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
  pageIndex: number;
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
  pageIndex: number;
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
  bounds: Bounds;
}

interface LassoSession {
  pointerId: number;
  pageIndex: number;
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

const PEN_SEEN_KEY = "vas.penSeen";
const WHEEL_ZOOM_SETTLE_MS = 150;
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

  private pages: Page[] = [];
  private viewport: Viewport = { x: 0, y: 0, scale: 1 };
  private screen: ScreenSize = { width: 0, height: 0 };
  private fitted = true;
  private penSeen = false;

  private pointers = new Map<number, TrackedPointer>();
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
  private rafId = 0;
  private lastReportedPage = -1;
  private lastReportedView: { x: number; y: number; scale: number } | null = null;
  private readonly stopImageListener: () => void;

  constructor(container: HTMLElement, callbacks: BoardCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.baseCanvas = createLayer();
    this.activeCanvas = createLayer();
    container.append(this.baseCanvas, this.activeCanvas);
    this.baseCtx = get2dContext(this.baseCanvas);
    this.activeCtx = get2dContext(this.activeCanvas);
    this.penSeen = readPenSeen();

    this.activeCanvas.addEventListener("pointerdown", this.handlePointerDown);
    this.activeCanvas.addEventListener("pointermove", this.handlePointerMove);
    this.activeCanvas.addEventListener("pointerup", this.handlePointerEnd);
    this.activeCanvas.addEventListener("pointercancel", this.handlePointerEnd);
    this.activeCanvas.addEventListener("contextmenu", preventDefault);
    this.activeCanvas.addEventListener("wheel", this.handleWheel, { passive: false });
    document.addEventListener("gesturestart", preventDefault);

    this.stopImageListener = onImageLoaded((imageId) => this.handleImageLoaded(imageId));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  syncPages(next: Page[]): void {
    this.pages = next;
    if (this.stroke && !next.some((p) => p.id === this.stroke?.pageId)) this.stroke = null;
    if (this.erasing && !next.some((p) => p.id === this.erasing?.pageId)) this.erasing = null;
    if (this.lasso && !next.some((p) => p.id === this.lasso?.pageId)) this.lasso = null;
    if (this.selection) {
      const page = next.find((p) => p.id === this.selection?.pageId);
      const strokeIds = new Set(this.selection.strokes.map((s) => s.id));
      const imageIds = new Set(this.selection.images.map((i) => i.id));
      const strokes = page?.strokes.filter((s) => strokeIds.has(s.id)) ?? [];
      const images = page?.images.filter((i) => imageIds.has(i.id)) ?? [];
      const bounds = unionBounds(strokesBounds(strokes), imagesBounds(images));
      if (!page || !bounds) {
        this.selection = null;
        this.gesture = null;
        this.selectionBase = null;
        this.strokeOverlayCache = null;
        this.callbacks.onSelectionChange(null);
      } else {
        this.selection = { pageId: page.id, strokes, images, bounds };
      }
    }
    this.viewport = clampViewport(this.viewport, this.screen, next.length);
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
    const strokes = page.strokes.filter((s) => strokeIds.has(s.id));
    const images = page.images.filter((i) => imageIds.has(i.id));
    const bounds = unionBounds(strokesBounds(strokes), imagesBounds(images));
    if (!bounds) return;
    if (
      this.selection &&
      this.selection.pageId === target.pageId &&
      this.selection.strokes.length === strokes.length &&
      this.selection.strokes.every((s) => strokeIds.has(s.id)) &&
      this.selection.images.length === images.length &&
      this.selection.images.every((i) => imageIds.has(i.id))
    ) {
      return;
    }
    this.selection = { pageId: target.pageId, strokes, images, bounds };
    this.selectionBase = null;
    this.strokeOverlayCache = null;
    this.scheduleComposite();
  }

  scrollToPage(index: number): void {
    this.viewport = clampViewport(
      { ...this.viewport, y: pageTopY(index) },
      this.screen,
      this.pages.length,
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
    const scale = clampScale(viewState.zoom * fitScale(this.screen.width), this.screen.width);
    this.viewport = clampViewport(
      { x: viewState.x, y: viewState.y, scale },
      this.screen,
      Math.max(1, this.pages.length),
    );
    this.fitted = false;
    this.scheduleComposite();
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.wheelTimer);
    this.observer.disconnect();
    this.stopImageListener();
    this.activeCanvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.activeCanvas.removeEventListener("pointermove", this.handlePointerMove);
    this.activeCanvas.removeEventListener("pointerup", this.handlePointerEnd);
    this.activeCanvas.removeEventListener("pointercancel", this.handlePointerEnd);
    this.activeCanvas.removeEventListener("contextmenu", preventDefault);
    this.activeCanvas.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("gesturestart", preventDefault);
    this.baseCanvas.remove();
    this.activeCanvas.remove();
  }

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
    this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
    for (const canvas of [this.baseCanvas, this.activeCanvas]) {
      canvas.width = Math.round(this.screen.width * dpr);
      canvas.height = Math.round(this.screen.height * dpr);
      canvas.style.width = `${this.screen.width}px`;
      canvas.style.height = `${this.screen.height}px`;
    }
    if (this.screen.width === 0 || this.screen.height === 0) return;
    if (this.viewport.scale === 1 && this.pages.length === 0) {
      this.viewport = createViewport(this.screen, Math.max(1, this.pages.length));
    } else {
      if (this.fitted) this.viewport.scale = fitScale(this.screen.width);
      this.viewport = clampViewport(this.viewport, this.screen, Math.max(1, this.pages.length));
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
    const vp = this.viewport;
    const ctx = this.baseCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.screen.width, this.screen.height);

    const live = !this.pinching && !this.wheelZooming;
    const renderScale = dpr * vp.scale;
    const directVector = live && renderScale > MAX_CACHE_RENDER_SCALE;
    const { first, last } = visiblePageRange(vp, this.screen, this.pages.length);
    const keep = new Set<string>();
    for (let i = Math.max(0, first - 1); i <= Math.min(this.pages.length - 1, last + 1); i++) {
      keep.add(this.pages[i].id);
    }
    for (let i = first; i <= last; i++) {
      const page = this.pages[i];
      if (!page) continue;
      if (directVector) {
        this.paintPageDirect(ctx, this.pageForCache(page), i, dpr);
        // Keep the gesture-time bitmap fresh; capped and incrementally updated internally.
        this.cache.sync(this.pageForCache(page), renderScale);
        continue;
      }
      const bitmap = live
        ? this.cache.sync(this.pageForCache(page), renderScale)
        : (this.cache.peek(page.id) ?? this.cache.sync(this.pageForCache(page), renderScale));
      const sx = (0 - vp.x) * vp.scale;
      const sy = (pageTopY(i) - vp.y) * vp.scale;
      const sw = PAGE_WIDTH * vp.scale;
      const sh = PAGE_HEIGHT * vp.scale;
      ctx.drawImage(bitmap, sx, sy, sw, sh);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    }
    this.cache.prune(keep);
    this.renderActiveStroke(dpr);
    this.renderSelection(dpr);
    this.renderLaserTrail(dpr);
    this.reportViewPage();
    this.pushSelectionAnchor();
    this.reportViewport();
  }

  private reportViewport(): void {
    const vp = this.viewport;
    const last = this.lastReportedView;
    if (last && last.x === vp.x && last.y === vp.y && last.scale === vp.scale) return;
    this.lastReportedView = { x: vp.x, y: vp.y, scale: vp.scale };
    if (this.screen.width === 0) return;
    this.callbacks.onViewportChange({
      x: vp.x,
      y: vp.y,
      zoom: vp.scale / fitScale(this.screen.width),
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

  private paintPageDirect(
    ctx: CanvasRenderingContext2D,
    page: Page,
    index: number,
    dpr: number,
  ): void {
    const vp = this.viewport;
    const s = dpr * vp.scale;
    const top = pageTopY(index);
    ctx.save();
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
    ctx.fillStyle = page.paperColor;
    ctx.fillRect(0, top, PAGE_WIDTH, PAGE_HEIGHT);
    ctx.beginPath();
    ctx.rect(0, top, PAGE_WIDTH, PAGE_HEIGHT);
    ctx.clip();
    ctx.translate(0, top);
    drawPagePattern(ctx, page.pattern, page.paperColor);
    for (const image of page.images) {
      const bitmap = getImageBitmap(image.imageId);
      if (bitmap) ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
    }
    for (const stroke of page.strokes) drawStroke(ctx, stroke);
    ctx.restore();
    const sx = (0 - vp.x) * vp.scale;
    const sy = (top - vp.y) * vp.scale;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, PAGE_WIDTH * vp.scale - 1, PAGE_HEIGHT * vp.scale - 1);
  }

  private renderActiveStroke(dpr: number): void {
    const ctx = this.activeCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.screen.width, this.screen.height);
    const stroke = this.stroke;
    if (!stroke) return;
    const pageIndex = this.pages.findIndex((p) => p.id === stroke.pageId);
    if (pageIndex < 0) return;
    const vp = this.viewport;
    const s = dpr * vp.scale;
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
    ctx.translate(0, pageTopY(pageIndex));
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

  private renderSelection(dpr: number): void {
    const ctx = this.activeCtx;
    const vp = this.viewport;
    const s = dpr * vp.scale;
    const lasso = this.lasso;
    if (lasso && lasso.points.length > 0) {
      ctx.save();
      ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
      ctx.translate(0, pageTopY(lasso.pageIndex));
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
    const top = pageTopY(pageIndex);
    ctx.save();
    ctx.setTransform(s, 0, 0, s, -vp.x * s, -vp.y * s);
    ctx.translate(0, top);
    if (sel.images.length > 0) {
      const selectedImageIds = new Set(sel.images.map((i) => i.id));
      for (const image of page.images) {
        const bitmap = getImageBitmap(image.imageId);
        if (!bitmap) continue;
        if (selectedImageIds.has(image.id)) {
          ctx.save();
          this.applyGestureTransform(ctx);
          ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
          ctx.restore();
        } else {
          ctx.drawImage(bitmap, image.x, image.y, image.width, image.height);
        }
      }
      const live = !this.pinching && !this.wheelZooming;
      if (live && s > MAX_CACHE_RENDER_SCALE) {
        const selectedStrokeIds = new Set(sel.strokes.map((st) => st.id));
        for (const stroke of page.strokes) {
          if (!selectedStrokeIds.has(stroke.id)) drawStroke(ctx, stroke);
        }
      } else {
        const overlay = this.strokeOverlay(page, sel, s, live);
        if (overlay) ctx.drawImage(overlay, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
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
    const capped = Math.min(renderScale, MAX_CACHE_RENDER_SCALE);
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
    canvas.width = Math.max(1, Math.round(PAGE_WIDTH * capped));
    canvas.height = Math.max(1, Math.round(PAGE_HEIGHT * capped));
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
    const vp = this.viewport;
    const x = (bounds.minX - vp.x) * vp.scale;
    const y = (pageTopY(pageIndex) + bounds.minY - vp.y) * vp.scale;
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
    const index = pageIndexAtY(midY, this.pages.length);
    if (index !== this.lastReportedPage) {
      this.lastReportedPage = index;
      this.callbacks.onViewChange(index);
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button === 2) return;
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
      return;
    }

    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const hit = pageAt(world.x, world.y, this.pages.length);

    const toolKind = this.callbacks.getTool().tool;
    if (toolKind === "eraser") {
      if (this.canDraw(event) && hit && !this.erasing) {
        this.erasing = {
          pointerId: event.pointerId,
          pageIndex: hit.index,
          pageId: this.pages[hit.index].id,
          removed: new Set(),
        };
        this.eraseAt(pos);
        return;
      }
      if (this.panPointerId === null) this.panPointerId = event.pointerId;
      return;
    }

    if (toolKind === "laser") {
      if (this.canDraw(event)) {
        this.laser = { pointerId: event.pointerId, points: [this.toWorldPoint(event)] };
        this.scheduleComposite();
        return;
      }
      if (this.panPointerId === null) this.panPointerId = event.pointerId;
      return;
    }

    if (toolKind === "select") {
      if (this.canDraw(event) && !this.lasso && !this.gesture) {
        this.beginSelect(event, world);
      } else if (this.panPointerId === null) {
        this.panPointerId = event.pointerId;
      }
      return;
    }

    if (this.canDraw(event) && !this.stroke) {
      if (hit) {
        this.beginStroke(event, hit.index, hit.x, hit.y);
        return;
      }
    }
    if (this.panPointerId === null) this.panPointerId = event.pointerId;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const prev = this.pointers.get(event.pointerId);
    if (!prev) return;
    const pos = this.eventPos(event);
    this.pointers.set(event.pointerId, { ...pos, type: event.pointerType });

    if (this.pinching && event.pointerType === "touch") {
      this.applyPinch(event.pointerId, prev, pos);
    } else if (this.panPointerId === event.pointerId) {
      this.viewport = panBy(
        this.viewport,
        pos.x - prev.x,
        pos.y - prev.y,
        this.screen,
        this.pages.length,
      );
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
        for (const e of coalesced(event)) {
          const point = this.toPagePoint(e, lasso.pageIndex);
          lasso.points.push({ x: point.x, y: point.y });
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
      const remaining = [...this.pointers.entries()].find(([, p]) => p.type === "touch");
      this.panPointerId = remaining ? remaining[0] : null;
    }
    this.scheduleComposite();
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const unit = event.deltaMode === 2 ? this.screen.height : event.deltaMode === 1 ? 16 : 1;
    if (event.ctrlKey || event.metaKey) {
      const pos = this.eventPos(event);
      const factor = Math.exp(-event.deltaY * unit * 0.0022);
      this.viewport = zoomAt(
        this.viewport,
        pos,
        this.viewport.scale * factor,
        this.screen,
        this.pages.length,
      );
      this.wheelZooming = true;
      this.fitted = false;
    } else {
      this.viewport = panBy(
        this.viewport,
        -event.deltaX * unit,
        -event.deltaY * unit,
        this.screen,
        this.pages.length,
      );
    }
    this.scheduleComposite();
    window.clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => {
      this.wheelZooming = false;
      this.scheduleComposite();
    }, WHEEL_ZOOM_SETTLE_MS);
  };

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
      this.pages.length,
    );
    vp = panBy(vp, curMid.x - prevMid.x, curMid.y - prevMid.y, this.screen, this.pages.length);
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
    const clamped = clampToPage(x, y);
    this.stroke = {
      pointerId: event.pointerId,
      button: event.button,
      pageIndex,
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
        const local = { x: world.x, y: world.y - pageTopY(pageIndex) };
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
    const hit = pageAt(world.x, world.y, this.pages.length);
    if (!hit) {
      if (this.panPointerId === null) this.panPointerId = event.pointerId;
      return;
    }
    const clamped = clampToPage(hit.x, hit.y);
    this.lasso = {
      pointerId: event.pointerId,
      pageIndex: hit.index,
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
    return {
      kind: "resize",
      pointerId,
      handle,
      anchor: anchors[handle],
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
    const pos = this.eventPos(event);
    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const local = { x: world.x, y: world.y - pageTopY(pageIndex) };
    if (gesture.kind === "move") {
      const clamped = clampMoveDelta(
        sel.bounds,
        local.x - gesture.origin.x,
        local.y - gesture.origin.y,
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
    const clamped = clampScaleToPage(origBounds, anchor, sx, sy);
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
        { strokes: sel.strokes, images: sel.images },
        {
          strokes: sel.strokes.map((s) => translateStroke(s, gesture.dx, gesture.dy)),
          images: sel.images.map((i) => translateImage(i, gesture.dx, gesture.dy)),
        },
      );
      return;
    }
    if (Math.abs(gesture.sx - 1) < 0.001 && Math.abs(gesture.sy - 1) < 0.001) return;
    this.callbacks.onTransformSelection(
      { strokes: sel.strokes, images: sel.images },
      {
        strokes: sel.strokes.map((s) => scaleStroke(s, gesture.anchor, gesture.sx, gesture.sy)),
        images: sel.images.map((i) => scaleImage(i, gesture.anchor, gesture.sx, gesture.sy)),
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
    const bounds = unionBounds(strokesBounds(strokes), imagesBounds(images));
    if (!page || !bounds) {
      this.clearSelection();
      return;
    }
    this.selection = { pageId: page.id, strokes, images, bounds };
    this.selectionBase = null;
    this.strokeOverlayCache = null;
    this.callbacks.onSelectionChange({
      pageId: page.id,
      strokeIds: strokes.map((s) => s.id),
      imageIds: images.map((i) => i.id),
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
    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const local = { x: world.x, y: world.y - pageTopY(pageIndex) };
    for (const stroke of page.strokes) {
      if (erasing.removed.has(stroke.id)) continue;
      if (hitTestStroke(local, stroke, ERASER_TOLERANCE)) {
        erasing.removed.add(stroke.id);
        this.callbacks.onEraseStroke(page.id, stroke.id);
      }
    }
  }

  private toPagePoint(event: PointerEvent, pageIndex: number): StrokePoint {
    const pos = this.eventPos(event);
    const world = screenToWorld(this.viewport, pos.x, pos.y);
    const local = clampToPage(world.x, world.y - pageTopY(pageIndex));
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

function createLayer(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "board-layer";
  return canvas;
}

function pressureOf(event: PointerEvent): number {
  return event.pressure > 0 ? event.pressure : 0.5;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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
