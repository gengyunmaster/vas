import type { CSSProperties } from "react";
import { COLORS, useBoardStore } from "../store/useBoardStore";
import { ColorField } from "./ColorField";

export function SelectionBar() {
  const selection = useBoardStore((state) => state.selection);
  const anchor = useBoardStore((state) => state.selectionAnchor);
  const tool = useBoardStore((state) => state.tool);
  const inkColor = useBoardStore((state) => {
    const sel = state.selection;
    if (!sel) return null;
    const page = state.pages.find((p) => p.id === sel.pageId);
    return (
      page?.strokes.find((s) => s.id === sel.strokeIds[0])?.color ??
      page?.texts.find((t) => t.id === sel.textIds[0])?.color ??
      null
    );
  });
  const exporting = useBoardStore((state) => state.exporting);
  const editableGeometryItemId = useBoardStore((state) => {
    const sel = state.selection;
    if (!sel || sel.strokeIds.length > 0 || sel.imageIds.length !== 1) return null;
    const page = state.pages.find((p) => p.id === sel.pageId);
    const image = page?.images.find((i) => i.id === sel.imageIds[0]);
    return image?.geometryId ? image.id : null;
  });
  const editableTextItemId = useBoardStore((state) => {
    const sel = state.selection;
    if (!sel || sel.strokeIds.length > 0 || sel.imageIds.length > 0) return null;
    return sel.textIds.length === 1 ? sel.textIds[0] : null;
  });
  if (!selection || !anchor || tool !== "select" || exporting) return null;

  const { recolorSelection, cutSelection, copySelection, deleteSelection, editGeometry } =
    useBoardStore.getState();

  const editText = () => {
    if (!editableTextItemId) return;
    useBoardStore.getState().setSelection(null);
    useBoardStore
      .getState()
      .setEditingText({ pageId: selection.pageId, itemId: editableTextItemId });
  };

  return (
    <div
      className="selection-bar"
      style={{
        left: `clamp(${Math.min(190, (window.innerWidth - 12) / 2)}px, ${anchor.x}px, calc(100vw - ${Math.min(190, (window.innerWidth - 12) / 2)}px))`,
        top: Math.max(anchor.y, 52),
      }}
      role="toolbar"
      aria-label="Selection actions"
    >
      {(selection.strokeIds.length > 0 || selection.textIds.length > 0) && (
        <>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={`Color ${c}`}
              className="swatch"
              style={{ "--swatch": c } as CSSProperties}
              onClick={() => recolorSelection(c)}
            >
              <span />
            </button>
          ))}
          <ColorField value={inkColor ?? COLORS[0]} onChange={recolorSelection} />
          <div className="selection-divider" />
        </>
      )}
      {editableGeometryItemId && (
        <button
          type="button"
          className="text-btn"
          onClick={() => editGeometry(selection.pageId, editableGeometryItemId)}
        >
          Edit
        </button>
      )}
      {editableTextItemId && (
        <button type="button" className="text-btn" onClick={editText}>
          Edit
        </button>
      )}
      <button type="button" className="text-btn" onClick={cutSelection}>
        Cut
      </button>
      <button type="button" className="text-btn" onClick={copySelection}>
        Copy
      </button>
      <button type="button" className="text-btn" onClick={deleteSelection}>
        Delete
      </button>
    </div>
  );
}
