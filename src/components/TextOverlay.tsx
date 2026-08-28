import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseMarkdown } from "../markdown/blocks";
import { ensureHighlight, highlightReady } from "../markdown/highlight";
import { renderBlocksHtml } from "../markdown/html";
import { ensureKatex, katexReady } from "../markdown/katex";
import { isDarkColor } from "../model/color";
import { type TextItem, textImageRefs } from "../model/textItem";
import { getImage } from "../persistence/images";
import { useBoardStore } from "../store/useBoardStore";
import { TEXT_FONT_STACK } from "../text/measure";
import { registerTextElement } from "../text/textElements";
import { currentTextFrame, subscribeTextFrame, type TextFrame } from "../text/textFrameBus";
import { noteTextItemHeight } from "../text/textHeight";

interface TextItemViewProps {
  item: TextItem;
  editing: boolean;
  mathReady: boolean;
  codeReady: boolean;
  darkPaper: boolean;
  resolveImage: (imageId: string) => string | null;
  registerEl: (itemId: string, el: HTMLElement | null) => void;
}

const TextItemView = memo(function TextItemView({
  item,
  editing,
  mathReady,
  codeReady,
  darkPaper,
  resolveImage,
  registerEl,
}: TextItemViewProps) {
  const html = useMemo(() => {
    // mathReady/codeReady are re-render signals: KaTeX/highlight.js finishing
    // loading must rebuild math and code markup.
    void mathReady;
    void codeReady;
    return renderBlocksHtml(parseMarkdown(item.markdown), resolveImage, darkPaper);
  }, [item.markdown, resolveImage, darkPaper, mathReady, codeReady]);
  return (
    <div
      ref={(el) => registerEl(item.id, el)}
      className={editing ? "text-item text-item-editing" : "text-item"}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        fontSize: item.fontSize,
        color: item.color,
        fontFamily: TEXT_FONT_STACK,
      }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderBlocksHtml escapes all user text; only KaTeX output and sanitized tags are emitted.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export function TextOverlay() {
  const pages = useBoardStore((state) => state.pages);
  const editingText = useBoardStore((state) => state.editingText);
  const [, setKatexTick] = useState(0);
  const [, setHighlightTick] = useState(0);
  const pageEls = useRef(new Map<string, HTMLElement>());
  const itemEls = useRef(new Map<string, HTMLElement>());
  const itemsById = useRef(new Map<string, TextItem>());
  const [imageUrls, setImageUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const allUrls = useRef(new Set<string>());

  const resolveImage = useCallback(
    (imageId: string) => imageUrls.get(imageId) ?? null,
    [imageUrls],
  );

  const items = useMemo(() => {
    const all: { pageId: string; item: TextItem }[] = [];
    for (const page of pages) for (const item of page.texts) all.push({ pageId: page.id, item });
    return all;
  }, [pages]);

  useEffect(() => {
    itemsById.current = new Map(items.map(({ item }) => [item.id, item]));
  }, [items]);

  useEffect(() => {
    if (!items.some(({ item }) => item.markdown.includes("$")) || katexReady()) return;
    let cancelled = false;
    void ensureKatex().then(() => {
      if (!cancelled) setKatexTick((tick) => tick + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (!items.some(({ item }) => item.markdown.includes("```")) || highlightReady()) return;
    let cancelled = false;
    void ensureHighlight().then(() => {
      if (!cancelled) setHighlightTick((tick) => tick + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    const wanted = new Set<string>();
    for (const { item } of items) for (const id of textImageRefs(item.markdown)) wanted.add(id);
    const missing = [...wanted].filter((id) => !imageUrls.has(id));
    const stale = [...imageUrls.keys()].filter((id) => !wanted.has(id));
    if (missing.length === 0 && stale.length === 0) return;
    let cancelled = false;
    void (async () => {
      const loaded: (readonly [string, string])[] = [];
      for (const id of missing) {
        const record = await getImage(id).catch(() => undefined);
        if (record) {
          const url = URL.createObjectURL(record.blob);
          allUrls.current.add(url);
          loaded.push([id, url] as const);
        }
      }
      if (cancelled) return;
      setImageUrls((prev) => {
        const next = new Map(prev);
        for (const [id, url] of prev) {
          if (!wanted.has(id)) {
            URL.revokeObjectURL(url);
            next.delete(id);
          }
        }
        for (const [id, url] of loaded) {
          if (wanted.has(id) && !next.has(id)) next.set(id, url);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [items, imageUrls]);

  useEffect(
    () => () => {
      for (const url of allUrls.current) URL.revokeObjectURL(url);
      allUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    const apply = (frame: TextFrame) => {
      const origins = new Map(frame.pages.map((p) => [p.pageId, p]));
      for (const [pageId, el] of pageEls.current) {
        const origin = origins.get(pageId);
        if (!origin) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.transform = `translate(${origin.x}px, ${origin.y}px) scale(${frame.scale})`;
      }
      const selected = new Set(frame.selectedTextIds);
      const gesture = frame.gesture;
      for (const [itemId, el] of itemEls.current) {
        const item = itemsById.current.get(itemId);
        if (!item || !gesture || !selected.has(itemId)) {
          el.style.transform = "";
          el.style.width = item ? `${item.width}px` : "";
          continue;
        }
        if (gesture.kind === "move") {
          el.style.transform = `translate(${gesture.dx}px, ${gesture.dy}px)`;
        } else {
          const dx = (item.x - gesture.anchor.x) * (gesture.sx - 1);
          const dy = (item.y - gesture.anchor.y) * (gesture.sy - 1);
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          el.style.width = `${item.width * gesture.sx}px`;
        }
      }
    };
    const unsubscribe = subscribeTextFrame(apply);
    apply(currentTextFrame());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const scale = currentTextFrame().scale;
      if (scale <= 0) return;
      for (const [itemId, el] of itemEls.current) {
        const item = itemsById.current.get(itemId);
        if (!item) continue;
        const height = el.getBoundingClientRect().height / scale;
        if (height > 0) noteTextItemHeight(item, height);
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  const registerItemEl = useCallback((itemId: string, el: HTMLElement | null) => {
    if (el) itemEls.current.set(itemId, el);
    else itemEls.current.delete(itemId);
    registerTextElement(itemId, el);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="text-layer">
      {pages
        .filter((page) => page.texts.length > 0)
        .map((page) => (
          <div
            key={page.id}
            ref={(el) => {
              if (el) pageEls.current.set(page.id, el);
              else pageEls.current.delete(page.id);
            }}
            className="text-page"
            style={{ display: "none" }}
          >
            {page.texts.map((item) => (
              <TextItemView
                key={item.id}
                item={item}
                editing={editingText?.itemId === item.id}
                mathReady={katexReady()}
                codeReady={highlightReady()}
                darkPaper={isDarkColor(page.paperColor)}
                resolveImage={resolveImage}
                registerEl={registerItemEl}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
