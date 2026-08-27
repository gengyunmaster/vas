import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { newId } from "../model/stroke";
import {
  MAX_TEXT_MARKDOWN_LENGTH,
  MIN_TEXT_WIDTH,
  TEXT_FONT_SIZES,
  type TextItem,
} from "../model/textItem";
import { getImage, saveImage } from "../persistence/images";
import { COLORS, useBoardStore } from "../store/useBoardStore";
import { measureTextElement } from "../text/textElements";
import { currentTextFrame } from "../text/textFrameBus";
import { ColorField } from "./ColorField";

const PAGE_BOTTOM_MARGIN = 8;
const WIDTH_STEP = 40;

export function TextEditor() {
  const editingText = useBoardStore((state) => state.editingText);
  const item = useBoardStore((state) => {
    if (!state.editingText) return null;
    const page = state.pages.find((p) => p.id === state.editingText?.pageId);
    return page?.texts.find((t) => t.id === state.editingText?.itemId) ?? null;
  });
  const page = useBoardStore((state) =>
    state.editingText ? state.pages.find((p) => p.id === state.editingText?.pageId) : null,
  );
  const pages = useBoardStore((state) => state.pages);
  const [overflow, setOverflow] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastAccepted = useRef<string | null>(null);
  const thumbUrls = useRef(new Map<string, string>());
  const [, setThumbVersion] = useState(0);

  const itemId = item?.id ?? null;
  useEffect(() => {
    lastAccepted.current = null;
    setOverflow(false);
    setPickerOpen(false);
    if (itemId) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [itemId]);

  useEffect(
    () => () => {
      for (const url of thumbUrls.current.values()) URL.revokeObjectURL(url);
      thumbUrls.current.clear();
    },
    [],
  );

  const fitsPage = (candidate: TextItem): boolean | null => {
    const scale = currentTextFrame().scale;
    const height = measureTextElement(candidate.id, scale);
    if (height === null || !page) return null;
    return candidate.y + height <= page.height - PAGE_BOTTOM_MARGIN;
  };

  const patchSeq = useRef(0);

  // Revert when the candidate overflows the page bottom; measurement happens
  // one frame after the optimistic update so the DOM reflects the candidate.
  // Rapid keystrokes supersede each other — only the newest frame validates.
  const tryPatch = (
    patch: Partial<Pick<TextItem, "markdown" | "color" | "fontSize" | "width">>,
  ) => {
    if (!item || !page) return;
    const before = item;
    const token = ++patchSeq.current;
    useBoardStore.getState().updateTextItem(page.id, item.id, patch);
    if (patch.color !== undefined && Object.keys(patch).length === 1) return;
    requestAnimationFrame(() => {
      if (patchSeq.current !== token) return;
      const state = useBoardStore.getState();
      const currentPage = state.pages.find((p) => p.id === page.id);
      const current = currentPage?.texts.find((t) => t.id === before.id);
      if (!currentPage || !current) return;
      const fits = fitsPage(current);
      if (fits !== false) {
        if (patch.markdown !== undefined) lastAccepted.current = current.markdown;
        setOverflow(false);
        return;
      }
      const fallback: Partial<Pick<TextItem, "markdown" | "fontSize" | "width">> = {};
      if (patch.markdown !== undefined) fallback.markdown = lastAccepted.current ?? before.markdown;
      if (patch.fontSize !== undefined) fallback.fontSize = before.fontSize;
      if (patch.width !== undefined) fallback.width = before.width;
      state.updateTextItem(currentPage.id, current.id, fallback);
      setOverflow(true);
    });
  };

  const thumbnails = useMemo(() => {
    const ids: string[] = [];
    for (const p of pages) {
      for (const image of p.images) {
        if (!ids.includes(image.imageId)) ids.push(image.imageId);
      }
    }
    return ids.slice(0, 24);
  }, [pages]);

  useEffect(() => {
    if (!pickerOpen) return;
    const missing = thumbnails.filter((id) => !thumbUrls.current.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (id) => {
        const record = await getImage(id);
        return record ? ([id, URL.createObjectURL(record.blob)] as const) : null;
      }),
    ).then((loaded) => {
      let added = false;
      for (const entry of loaded) {
        if (!entry) continue;
        if (cancelled || thumbUrls.current.has(entry[0])) {
          URL.revokeObjectURL(entry[1]);
          continue;
        }
        thumbUrls.current.set(entry[0], entry[1]);
        added = true;
      }
      if (added && !cancelled) setThumbVersion((version) => version + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, thumbnails]);

  if (!editingText || !item || !page) return null;

  const { updateTextItem, setEditingText, setTextFontSize } = useBoardStore.getState();

  const insertImageRef = (imageId: string, alt: string) => {
    const textarea = textareaRef.current;
    const snippet = `![${alt}](image:${imageId})`;
    const start = textarea?.selectionStart ?? item.markdown.length;
    const end = textarea?.selectionEnd ?? start;
    const next = `${item.markdown.slice(0, start)}${snippet}${item.markdown.slice(end)}`;
    if (next.length > MAX_TEXT_MARKDOWN_LENGTH) return;
    tryPatch({ markdown: next });
    setPickerOpen(false);
    requestAnimationFrame(() => {
      const cursor = start + snippet.length;
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const onUpload = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const imageId = newId();
    void saveImage({ id: imageId, mimeType: file.type || "application/octet-stream", blob: file })
      .then(() => insertImageRef(imageId, file.name.replace(/\.[^.]*$/, "") || "image"))
      .catch((error: unknown) => {
        console.error("Failed to attach image", error);
        window.alert("Failed to attach image.");
      });
  };

  const maxWidth = Math.max(MIN_TEXT_WIDTH, page.width - item.x - PAGE_BOTTOM_MARGIN);

  return (
    <div className="text-editor" role="dialog" aria-label="Text editor">
      <div className="text-editor-head">
        <span className="text-editor-title">Text</span>
        <button type="button" className="text-btn" onClick={() => setEditingText(null)}>
          Done
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="text-editor-input"
        value={item.markdown}
        maxLength={MAX_TEXT_MARKDOWN_LENGTH}
        placeholder="Markdown, $math$, {#ff0000|colored}"
        spellCheck={false}
        onChange={(event) => tryPatch({ markdown: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setEditingText(null);
          }
        }}
      />
      {overflow && (
        <div className="text-editor-hint">Page is full — enlarge width or remove text.</div>
      )}
      <div className="text-editor-row">
        <select
          className="text-editor-size"
          value={item.fontSize}
          onChange={(event) => {
            const fontSize = Number(event.target.value);
            setTextFontSize(fontSize);
            tryPatch({ fontSize });
          }}
          aria-label="Font size"
        >
          {TEXT_FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={`Color ${c}`}
            className="swatch"
            style={{ "--swatch": c } as CSSProperties}
            onClick={() => updateTextItem(page.id, item.id, { color: c })}
          >
            <span />
          </button>
        ))}
        <ColorField
          value={item.color}
          onChange={(color) => updateTextItem(page.id, item.id, { color })}
        />
      </div>
      <div className="text-editor-row">
        <button
          type="button"
          className="text-btn"
          disabled={item.width - WIDTH_STEP < MIN_TEXT_WIDTH}
          onClick={() => tryPatch({ width: Math.max(MIN_TEXT_WIDTH, item.width - WIDTH_STEP) })}
        >
          Narrower
        </button>
        <button
          type="button"
          className="text-btn"
          disabled={item.width + WIDTH_STEP > maxWidth}
          onClick={() => tryPatch({ width: Math.min(maxWidth, item.width + WIDTH_STEP) })}
        >
          Wider
        </button>
        <button type="button" className="text-btn" onClick={() => setPickerOpen((open) => !open)}>
          Image…
        </button>
      </div>
      {pickerOpen && (
        <div className="text-editor-images">
          {thumbnails.map((id) => {
            const url = thumbUrls.current.get(id);
            return url ? (
              <button
                key={id}
                type="button"
                className="text-editor-thumb"
                onClick={() => insertImageRef(id, "image")}
              >
                <img src={url} alt="notebook attachment" />
              </button>
            ) : null;
          })}
          <label className="text-btn text-editor-upload">
            Upload…
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
