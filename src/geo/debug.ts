export interface DebugEntry {
  time: string;
  text: string;
}

const ENABLED =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

type Listener = (entries: DebugEntry[]) => void;

const entries: DebugEntry[] = [];
const listeners = new Set<Listener>();

export const isDebugEnabled = (): boolean => ENABLED;

export function debugLog(text: string): void {
  if (!ENABLED) return;
  const now = new Date();
  const time = `${now.toLocaleTimeString("en-GB", { hour12: false })}.${String(
    now.getMilliseconds(),
  ).padStart(3, "0")}`;
  entries.push({ time, text });
  if (entries.length > 100) entries.shift();
  for (const listener of listeners) listener([...entries]);
}

export function subscribeDebug(listener: Listener): () => void {
  listeners.add(listener);
  listener([...entries]);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDebug(): void {
  entries.length = 0;
  for (const listener of listeners) listener([]);
}
