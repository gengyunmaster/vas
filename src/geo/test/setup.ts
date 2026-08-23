const STUB_RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 800,
  bottom: 500,
  width: 800,
  height: 500,
  toJSON: () => ({}),
};

if (typeof window !== "undefined") {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = () =>
      ({
        matches: false,
        media: "",
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return STUB_RECT as DOMRect;
  };

  for (const property of ["offsetWidth", "clientWidth"] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      get() {
        return 800;
      },
      configurable: true,
    });
  }
  for (const property of ["offsetHeight", "clientHeight"] as const) {
    Object.defineProperty(HTMLElement.prototype, property, {
      get() {
        return 500;
      },
      configurable: true,
    });
  }

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  if (typeof globalThis.IntersectionObserver !== "function") {
    globalThis.IntersectionObserver = class {
      readonly root = null;
      readonly rootMargin = "";
      readonly thresholds = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
  }
}
