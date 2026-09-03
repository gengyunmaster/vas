import { describe, expect, it } from "vitest";
import { type ClipboardContent, parseClipboardPayload, serializeClipboard } from "./clipboard";

function sampleContent(): ClipboardContent {
  return {
    strokes: [
      {
        id: "s1",
        points: [
          { x: 1, y: 2, pressure: 0.5 },
          { x: 3, y: 4, pressure: 0.7 },
        ],
        color: "#1a1a1a",
        size: 3,
        pen: "pen",
        simulatePressure: false,
      },
      {
        id: "s2",
        points: [
          { x: 0, y: 0, pressure: 0.5 },
          { x: 10, y: 10, pressure: 0.5 },
        ],
        color: "#d64541",
        size: 5,
        pen: "highlighter",
        simulatePressure: true,
        shape: "arrow",
      },
    ],
    images: [
      {
        id: "i1",
        imageId: "blob-1",
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        pdfSource: { docId: "doc-1", pageIndex: 3, whiteBackground: false },
      },
      {
        id: "i2",
        imageId: "blob-2",
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        locked: true,
        geometryId: "geo-1",
        videoId: "vid-1",
      },
    ],
    texts: [
      { id: "t1", x: 5, y: 6, width: 200, fontSize: 24, color: "#1a1a1a", markdown: "hi $x$" },
    ],
    audios: [{ id: "a1", audioId: "aud-1", x: 1, y: 2, width: 240, height: 44 }],
  };
}

describe("clipboard payload", () => {
  it("round-trips a full selection", () => {
    const parsed = parseClipboardPayload(serializeClipboard(sampleContent()));
    expect(parsed).toEqual(sampleContent());
  });

  it("returns null for plain text", () => {
    expect(parseClipboardPayload("hello world")).toBeNull();
    expect(parseClipboardPayload("")).toBeNull();
  });

  it("returns null for foreign JSON", () => {
    expect(parseClipboardPayload('{"foo":1}')).toBeNull();
    expect(parseClipboardPayload('{"marker":"other"}')).toBeNull();
    expect(parseClipboardPayload("[1,2,3]")).toBeNull();
  });

  it("throws when a marked payload has invalid content", () => {
    expect(() => parseClipboardPayload('{"marker":"vas-clipboard","strokes":[]}')).toThrow();
    const broken = JSON.stringify({
      marker: "vas-clipboard",
      strokes: [{ id: "s", points: [], color: "#1a1a1a", size: 3, pen: "pen" }],
      images: [],
      texts: [],
      audios: [],
    });
    expect(() => parseClipboardPayload(broken)).toThrow("Invalid clipboard stroke points");
  });

  it("rejects non-finite numbers", () => {
    const content = sampleContent();
    content.strokes[0].points[0].x = Number.NaN;
    expect(() => parseClipboardPayload(serializeClipboard(content))).toThrow();
  });

  it("rejects invalid text items", () => {
    const content = sampleContent();
    content.texts[0].width = 10;
    expect(() => parseClipboardPayload(serializeClipboard(content))).toThrow(
      "Invalid clipboard text",
    );
  });

  it("rejects a malformed pdf source", () => {
    const content = sampleContent();
    content.images[0].pdfSource = { docId: "d", pageIndex: -1 };
    expect(() => parseClipboardPayload(serializeClipboard(content))).toThrow();
  });

  it("drops absent optional flags and defaults missing pressure", () => {
    const raw = JSON.parse(serializeClipboard(sampleContent()));
    delete raw.images[0].pdfSource.whiteBackground;
    delete raw.strokes[0].points[0].pressure;
    const parsed = parseClipboardPayload(JSON.stringify(raw));
    expect(parsed?.images[0].pdfSource).toEqual({ docId: "doc-1", pageIndex: 3 });
    expect(parsed?.strokes[0].points[0].pressure).toBe(0.5);
  });
});
