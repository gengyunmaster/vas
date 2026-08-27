// Per-frame channel from the render engine to the text overlay. The overlay
// is DOM (React), so positions must not round-trip through React state at
// 60fps — the board publishes here and the overlay applies CSS transforms
// imperatively. Content changes still flow through the store as usual.
export interface SelectionGestureSnapshot {
  kind: "move" | "resize";
  dx: number;
  dy: number;
  anchor: { x: number; y: number };
  sx: number;
  sy: number;
}

export interface TextFrame {
  scale: number;
  // Screen-space origin of each page that currently has text items.
  pages: { pageId: string; x: number; y: number }[];
  gesture: SelectionGestureSnapshot | null;
  selectedTextIds: string[];
}

let current: TextFrame = { scale: 1, pages: [], gesture: null, selectedTextIds: [] };
const subscribers = new Set<(frame: TextFrame) => void>();

export function publishTextFrame(frame: TextFrame): void {
  current = frame;
  for (const subscriber of subscribers) subscriber(frame);
}

export function currentTextFrame(): TextFrame {
  return current;
}

export function subscribeTextFrame(subscriber: (frame: TextFrame) => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}
