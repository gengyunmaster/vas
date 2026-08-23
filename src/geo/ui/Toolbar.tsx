import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ToolId } from "../tools";
import { TOOL_CATEGORIES } from "./toolCatalog";

interface ToolbarProps {
  activeTool: string;
  canUndo: boolean;
  canRedo: boolean;
  customTools: { name: string }[];
  embedBusy: boolean;
  onSelect(tool: ToolId): void;
  onSelectCustom(name: string): void;
  onCreateCustom(): void;
  onImportCustom(): void;
  onExportCustom(): void;
  onDeleteCustom(name: string): void;
  onUndo(): void;
  onRedo(): void;
  onSave(): void;
  onOpen(): void;
  onExportSvg(): void;
  onExportPng(): void;
  onClearTraces(): void;
  onEmbed(): void;
  onCancel(): void;
}

function MenuItem({
  current,
  onClick,
  children,
}: {
  current?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={current ? "tool-menu-item current" : "tool-menu-item"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  activeTool,
  canUndo,
  canRedo,
  customTools,
  embedBusy,
  onSelect,
  onSelectCustom,
  onCreateCustom,
  onImportCustom,
  onExportCustom,
  onDeleteCustom,
  onUndo,
  onRedo,
  onSave,
  onOpen,
  onExportSvg,
  onExportPng,
  onClearTraces,
  onEmbed,
  onCancel,
}: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<Partial<Record<string, ToolId>>>({});
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        barRef.current &&
        event.target instanceof Node &&
        !barRef.current.contains(event.target)
      ) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        // The menu consumed this Escape; keep App's window handler from also
        // cancelling the in-progress construction.
        event.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const pickTool = (categoryId: string, id: ToolId) => {
    setLastUsed((previous) => ({ ...previous, [categoryId]: id }));
    setOpenMenu(null);
    onSelect(id);
  };

  const menuAction = (action: () => void) => () => {
    setOpenMenu(null);
    action();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Geometry tools" ref={barRef}>
      <button
        type="button"
        className={activeTool === "select" ? "tool-button active" : "tool-button"}
        aria-pressed={activeTool === "select"}
        onClick={() => onSelect("select")}
      >
        Select
      </button>
      {TOOL_CATEGORIES.map((category) => {
        const activeItem = category.tools.find((tool) => tool.id === activeTool);
        const current =
          activeItem ??
          category.tools.find((tool) => tool.id === lastUsed[category.id]) ??
          category.tools[0];
        const open = openMenu === category.id;
        return (
          <div className="tool-category" key={category.id}>
            <button
              type="button"
              className={
                activeItem ? "tool-button category-main active" : "tool-button category-main"
              }
              title={category.label}
              aria-pressed={activeItem !== undefined}
              onClick={() => pickTool(category.id, current.id)}
            >
              {current.label}
            </button>
            <button
              type="button"
              className="tool-button category-chevron"
              data-category={category.id}
              aria-label={`${category.label} tools`}
              aria-expanded={open}
              onClick={() => setOpenMenu(open ? null : category.id)}
            >
              ▾
            </button>
            {open && (
              <div className="tool-menu" role="menu" aria-label={category.label}>
                <div className="tool-menu-title">{category.label}</div>
                {category.tools.map((tool) => (
                  <MenuItem
                    key={tool.id}
                    current={tool.id === activeTool}
                    onClick={() => pickTool(category.id, tool.id)}
                  >
                    {tool.label}
                  </MenuItem>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="toolbar-separator" />
      {customTools.map((tool) => (
        <span key={tool.name} className="custom-tool">
          <button
            type="button"
            className={`custom:${tool.name}` === activeTool ? "tool-button active" : "tool-button"}
            aria-pressed={`custom:${tool.name}` === activeTool}
            onClick={() => onSelectCustom(tool.name)}
          >
            {tool.name}
          </button>
          <button
            type="button"
            className="custom-tool-delete"
            title={`Delete ${tool.name}`}
            onClick={() => onDeleteCustom(tool.name)}
          >
            ×
          </button>
        </span>
      ))}
      <button type="button" className="tool-button" onClick={onCreateCustom}>
        + Tool
      </button>
      <div className="toolbar-spacer" />
      <button type="button" className="tool-button" onClick={onUndo} disabled={!canUndo}>
        Undo
      </button>
      <button type="button" className="tool-button" onClick={onRedo} disabled={!canRedo}>
        Redo
      </button>
      <div className="tool-category">
        <button
          type="button"
          className="tool-button menu-trigger"
          data-category="file"
          aria-expanded={openMenu === "file"}
          onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
        >
          File ▾
        </button>
        {openMenu === "file" && (
          <div className="tool-menu tool-menu-right" role="menu" aria-label="File">
            <MenuItem onClick={menuAction(onSave)}>Save</MenuItem>
            <MenuItem onClick={menuAction(onOpen)}>Open</MenuItem>
            <div className="tool-menu-divider" />
            <MenuItem onClick={menuAction(onExportSvg)}>Export SVG</MenuItem>
            <MenuItem onClick={menuAction(onExportPng)}>Export PNG</MenuItem>
            <div className="tool-menu-divider" />
            <MenuItem onClick={menuAction(onImportCustom)}>Import Tools</MenuItem>
            <MenuItem onClick={menuAction(onExportCustom)}>Export Tools</MenuItem>
            <div className="tool-menu-divider" />
            <MenuItem onClick={menuAction(onClearTraces)}>Clear Traces</MenuItem>
          </div>
        )}
      </div>
      <div className="toolbar-separator" />
      <button type="button" className="tool-button" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="tool-button embed-button"
        disabled={embedBusy}
        onClick={onEmbed}
      >
        {embedBusy ? "Embedding…" : "Embed"}
      </button>
    </div>
  );
}
