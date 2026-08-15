import { normalizeHex } from "../model/color";
import { PAGE_PATTERNS, type PagePattern } from "../model/page";
import { TOOL_KINDS, type ToolKind } from "../model/stroke";
import { useBoardStore } from "../store/useBoardStore";

const PREFS_KEY = "vas.toolPrefs";

interface ToolPrefs {
  tool?: ToolKind;
  color?: string;
  size?: number;
  paperColor?: string;
  pattern?: PagePattern;
  sidebarOpen?: boolean;
}

export function loadToolPrefs(): ToolPrefs {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
  return parseToolPrefs(raw);
}

export function parseToolPrefs(raw: unknown): ToolPrefs {
  if (typeof raw !== "object" || raw === null) return {};
  const prefs = raw as Record<string, unknown>;
  const out: ToolPrefs = {};
  if (TOOL_KINDS.includes(prefs.tool as ToolKind)) out.tool = prefs.tool as ToolKind;
  if (prefs.tool === undefined && (prefs.pen === "pen" || prefs.pen === "highlighter")) {
    out.tool = prefs.pen;
  }
  const color = typeof prefs.color === "string" ? normalizeHex(prefs.color) : null;
  if (color) out.color = color;
  if (
    typeof prefs.size === "number" &&
    Number.isFinite(prefs.size) &&
    prefs.size > 0 &&
    prefs.size <= 48
  ) {
    out.size = prefs.size;
  }
  const paperColor = typeof prefs.paperColor === "string" ? normalizeHex(prefs.paperColor) : null;
  if (paperColor) out.paperColor = paperColor;
  if (PAGE_PATTERNS.includes(prefs.pattern as PagePattern)) {
    out.pattern = prefs.pattern as PagePattern;
  }
  if (typeof prefs.sidebarOpen === "boolean") out.sidebarOpen = prefs.sidebarOpen;
  return out;
}

export function startPrefsSync(): () => void {
  let timer: number | undefined;
  const unsubscribe = useBoardStore.subscribe((state, prev) => {
    if (
      state.tool === prev.tool &&
      state.color === prev.color &&
      state.size === prev.size &&
      state.paperColor === prev.paperColor &&
      state.pattern === prev.pattern &&
      state.sidebarOpen === prev.sidebarOpen
    ) {
      return;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const { tool, color, size, paperColor, pattern, sidebarOpen } = useBoardStore.getState();
      try {
        localStorage.setItem(
          PREFS_KEY,
          JSON.stringify({ tool, color, size, paperColor, pattern, sidebarOpen }),
        );
      } catch {
        // storage may be unavailable
      }
    }, 300);
  });
  return () => {
    window.clearTimeout(timer);
    unsubscribe();
  };
}
