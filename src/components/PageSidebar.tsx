import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { onImageLoaded } from "../engine/imageCache";
import { paintPage } from "../engine/renderPage";
import { PAGE_WIDTH, type Page } from "../model/page";
import { useBoardStore } from "../store/useBoardStore";

const THUMB_WIDTH = 336;
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;
const EDGE_SCROLL_PX = 48;
const EDGE_SCROLL_STEP = 14;

interface Interaction {
  phase: "pressing" | "dragging";
  pointerId: number;
  fromIndex: number;
  startY: number;
  offsetY: number;
  dropPos: number;
  element: HTMLElement;
}

interface DragRender {
  fromIndex: number;
  offsetY: number;
  dropPos: number;
}

export function PageSidebar() {
  const open = useBoardStore((state) => state.sidebarOpen);
  const pages = useBoardStore((state) => state.pages);
  const viewPageIndex = useBoardStore((state) => state.viewPageIndex);
  const [drag, setDrag] = useState<DragRender | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const cancelTimer = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
    const endInteraction = (commit: boolean) => {
      const it = interactionRef.current;
      interactionRef.current = null;
      cancelTimer();
      setDrag(null);
      if (!it) return;
      it.element.style.touchAction = "";
      if (commit && it.phase === "dragging") {
        if (it.dropPos !== it.fromIndex) {
          useBoardStore.getState().movePage(it.fromIndex, it.dropPos);
        }
        suppressClickRef.current = true;
      }
    };
    const onMove = (event: PointerEvent) => {
      const it = interactionRef.current;
      if (!it || event.pointerId !== it.pointerId) return;
      if (event.pointerType === "mouse" && event.buttons === 0) {
        endInteraction(false);
        return;
      }
      if (it.phase === "pressing") {
        if (Math.abs(event.clientY - it.startY) > MOVE_CANCEL_PX) endInteraction(false);
        return;
      }
      it.offsetY = event.clientY - it.startY;
      const items = [...(listRef.current?.querySelectorAll(".thumbnail") ?? [])];
      const others = items.filter((_, i) => i !== it.fromIndex);
      let dropPos = 0;
      for (const item of others) {
        const rect = item.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) dropPos++;
      }
      it.dropPos = dropPos;
      const aside = asideRef.current;
      if (aside) {
        const rect = aside.getBoundingClientRect();
        if (event.clientY < rect.top + EDGE_SCROLL_PX) aside.scrollTop -= EDGE_SCROLL_STEP;
        else if (event.clientY > rect.bottom - EDGE_SCROLL_PX) aside.scrollTop += EDGE_SCROLL_STEP;
      }
      setDrag({ fromIndex: it.fromIndex, offsetY: it.offsetY, dropPos: it.dropPos });
    };
    const onEnd = (event: PointerEvent) => {
      const it = interactionRef.current;
      if (!it || event.pointerId !== it.pointerId) return;
      endInteraction(event.type !== "pointercancel");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      cancelTimer();
    };
  }, []);

  useEffect(() => {
    if (!open || interactionRef.current) return;
    const aside = asideRef.current;
    const item = listRef.current?.querySelectorAll(".thumbnail")[viewPageIndex];
    if (!aside || !(item instanceof HTMLElement)) return;
    const asideRect = aside.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < asideRect.top) aside.scrollTop -= asideRect.top - itemRect.top;
    else if (itemRect.bottom > asideRect.bottom)
      aside.scrollTop += itemRect.bottom - asideRect.bottom;
  }, [open, viewPageIndex]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, index: number) => {
    suppressClickRef.current = false;
    if (interactionRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    interactionRef.current = {
      phase: "pressing",
      pointerId: event.pointerId,
      fromIndex: index,
      startY: event.clientY,
      offsetY: 0,
      dropPos: index,
      element: event.currentTarget,
    };
    timerRef.current = window.setTimeout(() => {
      const it = interactionRef.current;
      if (it?.phase !== "pressing") return;
      it.phase = "dragging";
      it.element.style.touchAction = "none";
      setDrag({ fromIndex: it.fromIndex, offsetY: 0, dropPos: it.dropPos });
    }, LONG_PRESS_MS);
  };

  if (!open) return null;

  const othersCount = pages.length - 1;
  const indicatorBeforeIndex =
    drag && drag.dropPos !== drag.fromIndex && drag.dropPos < othersCount
      ? drag.dropPos + (drag.dropPos >= drag.fromIndex ? 1 : 0)
      : null;
  const indicatorAfterIndex =
    drag && drag.dropPos !== drag.fromIndex && drag.dropPos === othersCount
      ? othersCount - 1 >= drag.fromIndex
        ? othersCount
        : othersCount - 1
      : null;

  return (
    <aside ref={asideRef} className="sidebar">
      <div className="sidebar-header">
        <span>Pages</span>
        <button
          type="button"
          title="Close pages panel"
          onClick={() => useBoardStore.getState().toggleSidebar()}
        >
          ×
        </button>
      </div>
      <div ref={listRef} className="sidebar-list">
        {pages.map((page, index) => (
          <PageThumbnail
            key={page.id}
            page={page}
            index={index}
            active={index === viewPageIndex}
            dragging={drag?.fromIndex === index}
            dropBefore={index === indicatorBeforeIndex}
            dropAfter={index === indicatorAfterIndex}
            dragOffset={drag?.fromIndex === index ? drag.offsetY : 0}
            onPointerDown={(e) => handlePointerDown(e, index)}
            onOpen={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              useBoardStore.getState().requestScrollToPage(index);
            }}
          />
        ))}
      </div>
    </aside>
  );
}

function PageThumbnail({
  page,
  index,
  active,
  dragging,
  dropBefore,
  dropAfter,
  dragOffset,
  onPointerDown,
  onOpen,
}: {
  page: Page;
  index: number;
  active: boolean;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  dragOffset: number;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onOpen: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = THUMB_WIDTH / PAGE_WIDTH;
    paintPage(canvas, page, scale);
    if (page.images.length === 0) return;
    return onImageLoaded(() => paintPage(canvas, page, scale));
  }, [page]);

  const className = [
    "thumbnail",
    active ? "active" : "",
    dragging ? "dragging" : "",
    dropBefore ? "drop-before" : "",
    dropAfter ? "drop-after" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
      title={`Go to page ${index + 1}`}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onOpen}
    >
      <canvas ref={canvasRef} />
      <span>{index + 1}</span>
    </button>
  );
}
