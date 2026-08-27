// The text overlay owns the on-screen DOM elements; the editor needs their
// real measured heights to lock input at the page bottom. This registry is
// the narrow bridge between the two.
const elements = new Map<string, HTMLElement>();

export function registerTextElement(itemId: string, element: HTMLElement | null): void {
  if (element) elements.set(itemId, element);
  else elements.delete(itemId);
}

// Height in page units; null when the element is not rendered (e.g. the page
// is far off-screen and the layer is display:none).
export function measureTextElement(itemId: string, scale: number): number | null {
  const element = elements.get(itemId);
  if (!element || scale <= 0) return null;
  const height = element.getBoundingClientRect().height;
  if (height <= 0) return null;
  return height / scale;
}
