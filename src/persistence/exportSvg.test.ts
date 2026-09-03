import { describe, expect, it } from "vitest";
import type { Page } from "../model/page";
import type { Stroke } from "../model/stroke";
import { pageToSvg } from "./exportSvg";

function penStroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: "s1",
    pen: "pen",
    color: "#1a1a1a",
    size: 6,
    simulatePressure: false,
    points: [
      { x: 10, y: 50, pressure: 0.5 },
      { x: 60, y: 50, pressure: 0.5 },
      { x: 110, y: 50, pressure: 0.5 },
    ],
    ...overrides,
  };
}

function shapeStroke(shape: Stroke["shape"]): Stroke {
  return penStroke({
    shape,
    points: [
      { x: 10, y: 20, pressure: 0.5 },
      { x: 110, y: 120, pressure: 0.5 },
    ],
  });
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "p1",
    width: 794,
    height: 1123,
    paperColor: "#ffffff",
    pattern: "blank",
    strokes: [],
    images: [],
    texts: [],
    audios: [],
    ...overrides,
  };
}

describe("pageToSvg", () => {
  it("emits an A4 viewBox and the paper color as background", async () => {
    const svg = await pageToSvg(makePage({ paperColor: "#003423" }), new Map());
    expect(svg).toContain('viewBox="0 0 794 1123"');
    expect(svg).toContain('<rect x="0" y="0" width="794" height="1123" fill="#003423"/>');
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("emits the page's own size as the viewBox", async () => {
    const svg = await pageToSvg(makePage({ width: 1200, height: 600 }), new Map());
    expect(svg).toContain('viewBox="0 0 1200 600"');
    expect(svg).toContain('width="1200" height="600"');
  });

  it("renders a pen stroke as a filled path without opacity", async () => {
    const svg = await pageToSvg(makePage({ strokes: [penStroke()] }), new Map());
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('fill="#1a1a1a"');
    expect(svg).not.toContain("fill-opacity");
  });

  it("renders a highlighter stroke with fill-opacity", async () => {
    const svg = await pageToSvg(
      makePage({ strokes: [penStroke({ pen: "highlighter" })] }),
      new Map(),
    );
    expect(svg).toContain('fill-opacity="0.35"');
  });

  it("skips strokes with no points", async () => {
    const empty = penStroke({ points: [] });
    const svg = await pageToSvg(makePage({ strokes: [empty] }), new Map());
    expect(svg).not.toContain("<path");
  });

  it("renders shapes with stroke attributes", async () => {
    const svg = await pageToSvg(
      makePage({ strokes: [shapeStroke("line"), shapeStroke("ellipse"), shapeStroke("rect")] }),
      new Map(),
    );
    expect(svg).toContain('d="M10 20 L110 120"');
    expect(svg).toContain('<ellipse cx="60" cy="70" rx="50" ry="50"');
    expect(svg).toContain('stroke="#1a1a1a"');
    expect(svg).toContain('stroke-width="6"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("renders an arrow head as extra path segments", async () => {
    const svg = await pageToSvg(makePage({ strokes: [shapeStroke("arrow")] }), new Map());
    const arrow = svg.split("\n").find((line) => line.startsWith('<path d="M10 20'));
    expect(arrow).toBeDefined();
    expect(arrow?.match(/M/g)?.length).toBe(2);
  });

  it("renders a dashed pen stroke as a dashed centerline", async () => {
    const svg = await pageToSvg(makePage({ strokes: [penStroke({ dash: true })] }), new Map());
    expect(svg).toContain('stroke-dasharray="18 12"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="#1a1a1a"');
  });

  it("renders a dashed shape with stroke-dasharray", async () => {
    const svg = await pageToSvg(makePage({ strokes: [shapeStroke("rect")] }), new Map());
    expect(svg).not.toContain("dasharray");
    const dashed = await pageToSvg(
      makePage({ strokes: [{ ...shapeStroke("rect"), dash: true }] }),
      new Map(),
    );
    expect(dashed).toContain('stroke-dasharray="18 12"');
  });

  it("renders no guides for a blank pattern", async () => {
    const svg = await pageToSvg(makePage({ pattern: "blank" }), new Map());
    expect(svg).not.toContain("<line");
    expect(svg).not.toContain("<circle");
  });

  it("renders grid lines in black on light paper", async () => {
    const svg = await pageToSvg(makePage({ pattern: "grid" }), new Map());
    expect(svg).toContain('stroke="#000000" stroke-opacity="0.16"');
  });

  it("renders grid lines in white on dark paper", async () => {
    const svg = await pageToSvg(makePage({ pattern: "grid", paperColor: "#003423" }), new Map());
    expect(svg).toContain('stroke="#ffffff" stroke-opacity="0.22"');
  });

  it("renders dots pattern as circles", async () => {
    const svg = await pageToSvg(makePage({ pattern: "dots" }), new Map());
    expect(svg).toContain("<circle");
    expect(svg).not.toContain("<line");
  });

  it("renders rice pattern dashed lines", async () => {
    const svg = await pageToSvg(makePage({ pattern: "rice" }), new Map());
    expect(svg).toContain('stroke-dasharray="6 4"');
  });

  it("embeds images as data URIs with both href forms", async () => {
    const page = makePage({
      images: [{ id: "i1", imageId: "img1", x: 40, y: 60, width: 200, height: 100 }],
    });
    const imageData = new Map([["img1", "data:image/png;base64,AAAA"]]);
    const svg = await pageToSvg(page, imageData);
    expect(svg).toContain(
      '<image x="40" y="60" width="200" height="100" href="data:image/png;base64,AAAA" xlink:href="data:image/png;base64,AAAA" preserveAspectRatio="none"/>',
    );
  });

  it("skips images without data", async () => {
    const page = makePage({
      images: [{ id: "i1", imageId: "img1", x: 40, y: 60, width: 200, height: 100 }],
    });
    const svg = await pageToSvg(page, new Map());
    expect(svg).not.toContain("<image");
  });

  it("escapes XML special characters in attribute values", async () => {
    const svg = await pageToSvg(
      makePage({ strokes: [penStroke({ color: '#fff"><' })] }),
      new Map(),
    );
    expect(svg).toContain("&quot;&gt;&lt;");
    expect(svg).not.toContain('fill="#fff"><"');
  });

  it("annotation-only mode omits paper, pattern, and locked images", async () => {
    const page = makePage({
      paperColor: "#003423",
      pattern: "grid",
      strokes: [penStroke()],
      images: [
        { id: "i1", imageId: "locked-img", x: 0, y: 0, width: 100, height: 100, locked: true },
        { id: "i2", imageId: "free-img", x: 10, y: 10, width: 50, height: 50 },
      ],
    });
    const imageData = new Map([
      ["locked-img", "data:image/jpeg;base64,AAAA"],
      ["free-img", "data:image/png;base64,BBBB"],
    ]);
    const svg = await pageToSvg(page, imageData, { annotationOnly: true });
    expect(svg).not.toContain("<rect");
    expect(svg).not.toContain("<line");
    expect(svg).not.toContain("locked-img");
    expect(svg).not.toContain("AAAA");
    expect(svg).toContain("data:image/png;base64,BBBB");
    expect(svg).toContain('fill="#1a1a1a"');
  });

  it("clipTo shrinks the viewBox to the given bounds without touching element coordinates", async () => {
    const svg = await pageToSvg(makePage({ strokes: [penStroke()] }), new Map(), {
      annotationOnly: true,
      clipTo: { minX: 10, minY: 20, maxX: 110, maxY: 220 },
    });
    expect(svg).toContain('viewBox="10 20 100 200"');
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="200"');
    expect(svg).not.toContain("<rect");
    expect(svg).toContain("M");
  });
});
