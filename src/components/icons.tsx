import type { ReactNode } from "react";

function Icon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

export function PenIcon() {
  return (
    <Icon title="Pen">
      <path d="M4 20l1.5-4.5L16 5l3 3L8.5 18.5 4 20z" />
      <path d="M13.5 7.5l3 3" />
    </Icon>
  );
}

export function HighlighterIcon() {
  return (
    <Icon title="Highlighter">
      <path d="M5 15L14 6l4 4-9 9H5v-4z" />
      <path d="M13 20h7" />
    </Icon>
  );
}

export function EraserIcon() {
  return (
    <Icon title="Eraser">
      <path d="M7 21l-4-4L13 7l4 4L7 21z" />
      <path d="M11 9l4 4" />
      <path d="M13 21h8" />
    </Icon>
  );
}

export function SettingsIcon() {
  return (
    <Icon title="Settings">
      <path d="M4 8h16" />
      <path d="M4 16h16" />
      <circle cx="9" cy="8" r="2" />
      <circle cx="15" cy="16" r="2" />
    </Icon>
  );
}

export function BackIcon() {
  return (
    <Icon title="Back to notebooks">
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  );
}

export function UndoIcon() {
  return (
    <Icon title="Undo">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </Icon>
  );
}

export function RedoIcon() {
  return (
    <Icon title="Redo">
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon title="Delete">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </Icon>
  );
}

export function AddPageIcon() {
  return (
    <Icon title="Add page">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </Icon>
  );
}

export function DeletePageIcon() {
  return (
    <Icon title="Delete page">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9.5 9.5l5 5" />
      <path d="M14.5 9.5l-5 5" />
    </Icon>
  );
}

export function SidebarIcon() {
  return (
    <Icon title="Pages panel">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Icon>
  );
}

export function PresentIcon() {
  return (
    <Icon title="Present">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 16v4" />
      <path d="M9 20h6" />
    </Icon>
  );
}

export function PasteIcon() {
  return (
    <Icon title="Paste">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </Icon>
  );
}

export function ImageIcon() {
  return (
    <Icon title="Insert media">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </Icon>
  );
}

export function ImportPdfIcon() {
  return (
    <Icon title="Import PDF">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M12 18v-6" />
      <path d="m9 15 3 3 3-3" />
    </Icon>
  );
}

export function RenameIcon() {
  return (
    <Icon title="Rename">
      <path d="M4 20l1.5-4.5L16 5l3 3L8.5 18.5 4 20z" />
    </Icon>
  );
}

export function ExportIcon() {
  return (
    <Icon title="Export">
      <path d="M12 4v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </Icon>
  );
}

export function GeometryIcon() {
  return (
    <Icon title="Geometry">
      <path d="M12 3l8.5 17h-17L12 3z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Icon>
  );
}
