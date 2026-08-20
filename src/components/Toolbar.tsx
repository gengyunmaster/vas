import { useEffect, useState } from "react";
import { closeNotebook } from "../persistence/session";
import { useBoardStore } from "../store/useBoardStore";
import { BackIcon, EraserIcon, HighlighterIcon, PenIcon, SettingsIcon } from "./icons";
import { SettingsPanel } from "./SettingsPanel";

export function Toolbar() {
  const [panelOpen, setPanelOpen] = useState(false);
  const tool = useBoardStore((state) => state.tool);
  const lastPenKind = useBoardStore((state) => state.lastPenKind);
  const presentation = useBoardStore((state) => state.presentation);
  const { setTool } = useBoardStore.getState();

  const penActive = tool === "pen" || tool === "highlighter";
  const shownKind = penActive ? tool : lastPenKind;

  useEffect(() => {
    if (presentation) setPanelOpen(false);
  }, [presentation]);

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Drawing tools">
        <button
          type="button"
          title={shownKind === "highlighter" ? "Highlighter" : "Pen"}
          aria-pressed={penActive}
          className={penActive ? "active" : ""}
          onClick={() => setTool(penActive ? tool : lastPenKind)}
        >
          {shownKind === "highlighter" ? <HighlighterIcon /> : <PenIcon />}
        </button>
        <button
          type="button"
          title="Eraser"
          aria-pressed={tool === "eraser"}
          className={tool === "eraser" ? "active" : ""}
          onClick={() => setTool("eraser")}
        >
          <EraserIcon />
        </button>
        <button
          type="button"
          title="Settings"
          aria-expanded={panelOpen}
          className={panelOpen ? "active" : ""}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <SettingsIcon />
        </button>
        <button type="button" title="Back to notebooks" onClick={() => void closeNotebook()}>
          <BackIcon />
        </button>
      </div>
      {panelOpen && <SettingsPanel />}
    </>
  );
}
