import { useBoardStore } from "./store/useBoardStore";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

const THEME_COLORS = { light: "#f4f4f2", dark: "#1c1c1f" } as const;

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  return pref === "system" ? (systemDark() ? "dark" : "light") : pref;
}

// data-theme must land before first paint; main.tsx calls this at module scope.
export function applyTheme(pref: ThemePreference): void {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  if (resolved === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[resolved];
}

// Follows both the preference and the OS scheme while it is "system".
export function startThemeSync(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (useBoardStore.getState().theme === "system") applyTheme("system");
  };
  media.addEventListener("change", onChange);
  const unsubscribe = useBoardStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) applyTheme(state.theme);
  });
  applyTheme(useBoardStore.getState().theme);
  return () => {
    media.removeEventListener("change", onChange);
    unsubscribe();
  };
}
