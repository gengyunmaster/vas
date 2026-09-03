export interface ShortcutCombo {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

export function matchCombo(event: KeyboardEvent, combo: ShortcutCombo): boolean {
  if (combo.mod !== undefined && (event.ctrlKey || event.metaKey) !== combo.mod) return false;
  if (combo.shift !== undefined && event.shiftKey !== combo.shift) return false;
  return event.key.toLowerCase() === combo.key;
}

export const COMBOS = {
  undo: { key: "z", mod: true, shift: false },
  redo: [
    { key: "z", mod: true, shift: true },
    { key: "y", mod: true },
  ],
  cut: { key: "x", mod: true },
  copy: { key: "c", mod: true },
  deleteSelection: { key: "delete" },
  shortcuts: { key: "?" },
} as const;

export interface ShortcutHelpGroup {
  title: string;
  entries: { keys: string; action: string }[];
}

export const SHORTCUT_HELP: ShortcutHelpGroup[] = [
  {
    title: "Edit",
    entries: [
      { keys: "Ctrl/⌘ Z", action: "Undo" },
      { keys: "Ctrl/⌘ Shift Z · Ctrl/⌘ Y", action: "Redo" },
      { keys: "Ctrl/⌘ X", action: "Cut selection" },
      { keys: "Ctrl/⌘ C", action: "Copy selection" },
      { keys: "Ctrl/⌘ V", action: "Paste" },
      { keys: "Delete", action: "Delete selection" },
      { keys: "Esc", action: "Cancel / close" },
    ],
  },
  {
    title: "Presentation",
    entries: [
      { keys: "↓ → Space PgDn", action: "Next page" },
      { keys: "↑ ← PgUp", action: "Previous page" },
      { keys: "Esc", action: "Exit presentation" },
    ],
  },
  {
    title: "Gestures",
    entries: [
      { keys: "Two-finger tap", action: "Undo" },
      { keys: "Three-finger tap", action: "Redo" },
      { keys: "Pinch", action: "Zoom" },
      { keys: "Two-finger drag", action: "Pan" },
    ],
  },
  {
    title: "General",
    entries: [{ keys: "?", action: "Show this panel" }],
  },
];
