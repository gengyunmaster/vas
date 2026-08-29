import { type CSSProperties, useRef } from "react";
import { COLORS, useBoardStore } from "../store/useBoardStore";
import { ColorField } from "./ColorField";
import { usePresence } from "./usePresence";

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
  const visible = selection !== null && anchor !== null && tool === "select" && !exporting;
  const presence = usePresence(visible, 120);
  const lastShown = useRef<{
    selection: NonNullable<typeof selection>;
    anchor: NonNullable<typeof anchor>;
  } | null>(null);
  if (selection && anchor) lastShown.current = { selection, anchor };
  if (!presence.mounted || !lastShown.current) return null;
  const shown = selection && anchor ? { selection, anchor } : lastShown.current;
  const { selection: shownSelection, anchor: shownAnchor } = shown;

  const { recolorSelection, cutSelection, copySelection, deleteSelection, editGeometry } =
    useBoardStore.getState();
  const { centerSelection } = useBoardStore.getState();

  const editText = () => {
    if (!editableTextItemId) return;
    useBoardStore.getState().setSelection(null);
    useBoardStore
      .getState()
      .setEditingText({ pageId: shownSelection.pageId, itemId: editableTextItemId });
  };

  return (
    <div
      className={presence.closing ? "selection-bar closing" : "selection-bar"}
      style={{
        left: `clamp(${Math.min(190, (window.innerWidth - 12) / 2)}px, ${shownAnchor.x}px, calc(100vw - ${Math.min(190, (window.innerWidth - 12) / 2)}px))`,
        top: Math.max(shownAnchor.y, 52),
      }}
      role="toolbar"
      aria-label="Selection actions"
    >
      {(shownSelection.strokeIds.length > 0 || shownSelection.textIds.length > 0) && (
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
          onClick={() => editGeometry(shownSelection.pageId, editableGeometryItemId)}
        >
          Edit
        </button>
      )}
      {editableTextItemId && (
        <button type="button" className="text-btn" onClick={editText}>
          Edit
        </button>
      )}
      <button
        type="button"
        className="text-btn"
        title="Center horizontally on page"
        onClick={() => centerSelection("horizontal")}
      >
        Center H
      </button>
      <button
        type="button"
        className="text-btn"
        title="Center vertically on page"
        onClick={() => centerSelection("vertical")}
      >
        Center V
      </button>
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
