import { strFromU8, strToU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { Page } from "../model/page";
import {
  buildNotebookZip,
  geometryEntryPath,
  imageEntryPath,
  mediaEntryPath,
  NOTEBOOK_JSON_ENTRY,
  parseNotebookFile,
  pdfEntryPath,
  remapPageAssetIds,
  resolveGeometryEntries,
  resolveImageEntries,
  resolveMediaEntries,
  resolvePdfEntries,
  sanitizeFileName,
  serializeNotebook,
} from "./transfer";

function samplePage(): Page {
  return {
    id: "page-1",
    width: 794,
    height: 1123,
    paperColor: "#003423",
    pattern: "grid",
    images: [],
    texts: [],
    audios: [],
    strokes: [
      {
        id: "stroke-1",
        pen: "highlighter",
        color: "#f2b134",
        size: 9,
        simulatePressure: true,
        points: [
          { x: 1, y: 2, pressure: 0.4 },
          { x: 30, y: 40, pressure: 0.8 },
        ],
      },
      {
        id: "stroke-2",
        pen: "pen",
        color: "#2f6fdd",
        size: 3,
        simulatePressure: false,
        shape: "arrow",
        points: [
          { x: 10, y: 10, pressure: 0.5 },
          { x: 100, y: 80, pressure: 0.5 },
        ],
      },
    ],
  };
}

describe("serializeNotebook / parseNotebookFile", () => {
  it("round-trips a notebook preserving content", () => {
    const text = serializeNotebook("My notes", [samplePage()]);
    const parsed = parseNotebookFile(text);
    expect(parsed.title).toBe("My notes");
    expect(parsed.pages).toHaveLength(1);
    const page = parsed.pages[0];
    expect(page.paperColor).toBe("#003423");
    expect(page.pattern).toBe("grid");
    expect(page.strokes).toHaveLength(2);
    const stroke = page.strokes[0];
    expect(stroke.pen).toBe("highlighter");
    expect(stroke.color).toBe("#f2b134");
    expect(stroke.size).toBe(9);
    expect(stroke.simulatePressure).toBe(true);
    expect(stroke.points).toEqual([
      { x: 1, y: 2, pressure: 0.4 },
      { x: 30, y: 40, pressure: 0.8 },
    ]);
    const shape = page.strokes[1];
    expect(shape.shape).toBe("arrow");
    expect(shape.points).toHaveLength(2);
  });

  it("round-trips dashed strokes", () => {
    const page = samplePage();
    page.strokes[0] = { ...page.strokes[0], dash: true };
    const parsed = parseNotebookFile(serializeNotebook("My notes", [page]));
    expect(parsed.pages[0].strokes[0].dash).toBe(true);
    expect(parsed.pages[0].strokes[1].dash).toBeUndefined();
  });

  it("round-trips point tilt and clamps out-of-range values", () => {
    const page = samplePage();
    page.strokes[0] = {
      ...page.strokes[0],
      points: [
        { x: 1, y: 2, pressure: 0.4, tilt: 0.6 },
        { x: 30, y: 40, pressure: 0.8 },
      ],
    };
    const text = serializeNotebook("My notes", [page]);
    const parsed = parseNotebookFile(text);
    expect(parsed.pages[0].strokes[0].points).toEqual([
      { x: 1, y: 2, pressure: 0.4, tilt: 0.6 },
      { x: 30, y: 40, pressure: 0.8 },
    ]);
    const tampered = JSON.parse(text);
    tampered.pages[0].strokes[0].points[0].tilt = 7;
    const clamped = parseNotebookFile(JSON.stringify(tampered));
    expect(clamped.pages[0].strokes[0].points[0].tilt).toBe(1);
  });

  it("regenerates ids on import", () => {
    const text = serializeNotebook("My notes", [samplePage()]);
    const parsed = parseNotebookFile(text);
    expect(parsed.pages[0].id).not.toBe("page-1");
    expect(parsed.pages[0].strokes[0].id).not.toBe("stroke-1");
    const second = parseNotebookFile(text);
    expect(second.pages[0].id).not.toBe(parsed.pages[0].id);
  });

  it("rejects non-JSON input", () => {
    expect(() => parseNotebookFile("not json")).toThrow();
  });

  it("rejects a foreign file format", () => {
    expect(() => parseNotebookFile(JSON.stringify({ format: "other", version: 1 }))).toThrow(
      "Not a vas notebook file",
    );
  });

  it("rejects an unsupported version", () => {
    expect(() =>
      parseNotebookFile(
        JSON.stringify({ format: "vas-notebook", version: 99, pages: [{ strokes: [] }] }),
      ),
    ).toThrow("Unsupported file version");
  });

  it("rejects a file without pages", () => {
    expect(() =>
      parseNotebookFile(JSON.stringify({ format: "vas-notebook", version: 1, pages: [] })),
    ).toThrow("no pages");
  });

  it("applies defaults for missing optional fields", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 1,
      pages: [{ strokes: [{ points: [{ x: 1, y: 2 }] }] }],
    });
    const parsed = parseNotebookFile(text);
    expect(parsed.title).toBe("Imported notebook");
    const stroke = parsed.pages[0].strokes[0];
    expect(parsed.pages[0].paperColor).toBe("#ffffff");
    expect(parsed.pages[0].pattern).toBe("blank");
    expect(stroke.pen).toBe("pen");
    expect(stroke.color).toBe("#1a1a1a");
    expect(stroke.size).toBe(5);
    expect(stroke.simulatePressure).toBe(false);
    expect(stroke.points[0].pressure).toBe(0.5);
  });

  it("rejects a stroke with invalid points", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 1,
      pages: [{ strokes: [{ points: [{ x: "1", y: 2 }] }] }],
    });
    expect(() => parseNotebookFile(text)).toThrow("Invalid point");
  });

  it("rejects non-finite point coordinates", () => {
    const text = `{
      "format": "vas-notebook",
      "version": 1,
      "pages": [{ "strokes": [{ "points": [{ "x": 1e999, "y": 2 }] }] }]
    }`;
    expect(() => parseNotebookFile(text)).toThrow("Invalid point");
  });

  it("falls back to the default size for non-finite stroke size", () => {
    const text = `{
      "format": "vas-notebook",
      "version": 1,
      "pages": [{ "strokes": [{ "size": 1e999, "points": [{ "x": 1, "y": 2 }] }] }]
    }`;
    const parsed = parseNotebookFile(text);
    expect(parsed.pages[0].strokes[0].size).toBe(5);
  });

  it("round-trips a custom page size", () => {
    const text = serializeNotebook("Sized", [{ ...samplePage(), width: 1200, height: 600 }]);
    const parsed = parseNotebookFile(text);
    expect(parsed.pages[0].width).toBe(1200);
    expect(parsed.pages[0].height).toBe(600);
  });

  it("defaults a missing page size to A4", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 3,
      pages: [{ strokes: [] }],
    });
    const parsed = parseNotebookFile(text);
    expect(parsed.pages[0].width).toBe(794);
    expect(parsed.pages[0].height).toBe(1123);
  });

  it("rejects a page size outside the allowed range", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 3,
      pages: [{ strokes: [], width: 50, height: 1123 }],
    });
    expect(() => parseNotebookFile(text)).toThrow("Invalid page width");
  });

  it("round-trips the view state when present", () => {
    const text = serializeNotebook("Views", [samplePage()], [], { x: 12, y: 400, zoom: 2.5 });
    expect(parseNotebookFile(text).viewState).toEqual({ x: 12, y: 400, zoom: 2.5 });
  });

  it("omits the view state when absent", () => {
    expect(parseNotebookFile(serializeNotebook("Views", [samplePage()])).viewState).toBeUndefined();
  });

  it("rejects an invalid view state", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 2,
      viewState: { x: 0, y: 0, zoom: -1 },
      pages: [{ strokes: [] }],
    });
    expect(() => parseNotebookFile(text)).toThrow("Invalid view state");
  });
});

describe("notebook images and zip packaging", () => {
  function imagedPage(): Page {
    return {
      ...samplePage(),
      images: [
        { id: "item-1", imageId: "blob-1", x: 40, y: 40, width: 200, height: 100, locked: true },
      ],
    };
  }

  it("round-trips pages with images and remaps the image ids", () => {
    const text = serializeNotebook(
      "With images",
      [imagedPage()],
      [{ imageId: "blob-1", mimeType: "image/png" }],
    );
    const parsed = parseNotebookFile(text);
    expect(parsed.images).toHaveLength(1);
    const entry = parsed.images[0];
    expect(entry.sourceId).toBe("blob-1");
    expect(entry.imageId).not.toBe("blob-1");
    expect(entry.mimeType).toBe("image/png");
    const item = parsed.pages[0].images[0];
    expect(item.imageId).toBe(entry.imageId);
    expect(item.id).not.toBe("item-1");
    expect(item).toMatchObject({ x: 40, y: 40, width: 200, height: 100, locked: true });
  });

  it("rejects a page referencing an image missing from the manifest", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 2,
      pages: [{ strokes: [], images: [{ imageId: "ghost", x: 0, y: 0, width: 10, height: 10 }] }],
    });
    expect(() => parseNotebookFile(text)).toThrow("unknown image");
  });

  it("rejects invalid image geometry", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 2,
      images: [{ imageId: "blob-1", mimeType: "image/png" }],
      pages: [{ strokes: [], images: [{ imageId: "blob-1", x: 0, y: 0, width: -5, height: 10 }] }],
    });
    expect(() => parseNotebookFile(text)).toThrow("Invalid image width");
  });

  it("builds a zip that parses back with image bytes resolved", () => {
    const json = serializeNotebook(
      "Zip",
      [imagedPage()],
      [{ imageId: "blob-1", mimeType: "image/png" }],
    );
    const pngBytes = new Uint8Array([1, 2, 3, 4]);
    const zip = buildNotebookZip(json, [
      { path: imageEntryPath("blob-1", "image/png"), data: pngBytes },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    const entries = unzipSync(zip);
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    const resolved = resolveImageEntries(entries, parsed.images);
    expect([...resolved[0]]).toEqual([1, 2, 3, 4]);
  });

  it("resolveImageEntries throws when an image file is missing", () => {
    const json = serializeNotebook(
      "Zip",
      [imagedPage()],
      [{ imageId: "blob-1", mimeType: "image/png" }],
    );
    const zip = buildNotebookZip(json, []);
    const entries = unzipSync(zip);
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    expect(() => resolveImageEntries(entries, parsed.images)).toThrow("Missing image data");
  });
});

describe("notebook pdf sources", () => {
  function sourcedPage(): Page {
    return { ...samplePage(), pdfSource: { docId: "pdf-1", pageIndex: 2 } };
  }

  it("round-trips the pdf source and remaps the doc id", () => {
    const text = serializeNotebook("With pdf", [sourcedPage()], [], undefined, [
      { docId: "pdf-1" },
    ]);
    const parsed = parseNotebookFile(text);
    expect(parsed.pdfs).toHaveLength(1);
    expect(parsed.pdfs[0].sourceId).toBe("pdf-1");
    expect(parsed.pdfs[0].docId).not.toBe("pdf-1");
    expect(parsed.pages[0].pdfSource).toEqual({ docId: parsed.pdfs[0].docId, pageIndex: 2 });
  });

  it("omits the pdfs manifest when no page has a pdf source", () => {
    const text = serializeNotebook("Plain", [samplePage()]);
    expect(parseNotebookFile(text).pdfs).toEqual([]);
    expect(text).not.toContain("pdfs");
  });

  it("rejects a page referencing a pdf missing from the manifest", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 3,
      pages: [{ strokes: [], pdfSource: { docId: "ghost", pageIndex: 0 } }],
    });
    expect(() => parseNotebookFile(text)).toThrow("unknown pdf");
  });

  it("rejects an invalid pdf source page index", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 3,
      pdfs: [{ docId: "pdf-1" }],
      pages: [{ strokes: [], pdfSource: { docId: "pdf-1", pageIndex: -1 } }],
    });
    expect(() => parseNotebookFile(text)).toThrow("Invalid pdf source page index");
  });

  it("round-trips the white background choice", () => {
    const page: Page = {
      ...samplePage(),
      pdfSource: { docId: "pdf-1", pageIndex: 2, whiteBackground: false },
    };
    const text = serializeNotebook("Transparent pdf", [page], [], undefined, [{ docId: "pdf-1" }]);
    const parsed = parseNotebookFile(text);
    expect(parsed.pages[0].pdfSource).toEqual({
      docId: parsed.pdfs[0].docId,
      pageIndex: 2,
      whiteBackground: false,
    });
  });

  it("rejects a non-boolean pdf source background flag", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 3,
      pdfs: [{ docId: "pdf-1" }],
      pages: [{ strokes: [], pdfSource: { docId: "pdf-1", pageIndex: 0, whiteBackground: "y" } }],
    });
    expect(() => parseNotebookFile(text)).toThrow("Invalid pdf source background flag");
  });

  it("resolves pdf bytes from the zip archive", () => {
    const json = serializeNotebook("Zip", [sourcedPage()], [], undefined, [{ docId: "pdf-1" }]);
    const zip = buildNotebookZip(json, [
      { path: pdfEntryPath("pdf-1"), data: new Uint8Array([9, 8, 7]) },
    ]);
    const entries = unzipSync(zip);
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    const resolved = resolvePdfEntries(entries, parsed.pdfs);
    expect([...resolved[0]]).toEqual([9, 8, 7]);
    expect(entries[pdfEntryPath("pdf-1")]).toBeDefined();
  });

  it("resolvePdfEntries throws when a pdf file is missing", () => {
    const json = serializeNotebook("Zip", [sourcedPage()], [], undefined, [{ docId: "pdf-1" }]);
    const entries = unzipSync(buildNotebookZip(json, []));
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    expect(() => resolvePdfEntries(entries, parsed.pdfs)).toThrow("Missing PDF data");
  });
});

describe("pdf-backed images", () => {
  function pdfImagePage(): Page {
    return {
      ...samplePage(),
      images: [
        {
          id: "item-1",
          imageId: "blob-1",
          x: 10,
          y: 20,
          width: 300,
          height: 400,
          pdfSource: { docId: "pdf-1", pageIndex: 4 },
        },
      ],
    };
  }

  it("round-trips an image pdf source and remaps both ids", () => {
    const text = serializeNotebook(
      "Pdf image",
      [pdfImagePage()],
      [{ imageId: "blob-1", mimeType: "image/png" }],
      undefined,
      [{ docId: "pdf-1" }],
    );
    const parsed = parseNotebookFile(text);
    expect(parsed.pdfs).toHaveLength(1);
    const item = parsed.pages[0].images[0];
    expect(item.imageId).toBe(parsed.images[0].imageId);
    expect(item.pdfSource?.docId).not.toBe("pdf-1");
    expect(item.pdfSource).toEqual({ docId: parsed.pdfs[0].docId, pageIndex: 4 });
  });

  it("rejects an image referencing a pdf missing from the manifest", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 5,
      images: [{ imageId: "blob-1", mimeType: "image/png" }],
      pages: [
        {
          strokes: [],
          images: [
            {
              imageId: "blob-1",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              pdfSource: { docId: "ghost", pageIndex: 0 },
            },
          ],
        },
      ],
    });
    expect(() => parseNotebookFile(text)).toThrow("unknown pdf");
  });

  it("rejects an invalid image pdf source page index", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 5,
      images: [{ imageId: "blob-1", mimeType: "image/png" }],
      pdfs: [{ docId: "pdf-1" }],
      pages: [
        {
          strokes: [],
          images: [
            {
              imageId: "blob-1",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              pdfSource: { docId: "pdf-1", pageIndex: -1 },
            },
          ],
        },
      ],
    });
    expect(() => parseNotebookFile(text)).toThrow("Invalid pdf source page index");
  });
});

describe("notebook geometries", () => {
  function geometryPage(): Page {
    return {
      ...samplePage(),
      images: [
        {
          id: "item-1",
          imageId: "blob-1",
          x: 40,
          y: 40,
          width: 200,
          height: 100,
          geometryId: "geo-1",
        },
      ],
    };
  }

  const geometryImages = [{ imageId: "blob-1", mimeType: "image/svg+xml" }];

  it("round-trips the geometry reference and remaps ids", () => {
    const text = serializeNotebook(
      "Geo",
      [geometryPage()],
      geometryImages,
      undefined,
      [],
      [{ geometryId: "geo-1" }],
    );
    const parsed = parseNotebookFile(text);
    expect(parsed.geometries).toHaveLength(1);
    expect(parsed.geometries[0].sourceId).toBe("geo-1");
    expect(parsed.geometries[0].geometryId).not.toBe("geo-1");
    expect(parsed.pages[0].images[0].geometryId).toBe(parsed.geometries[0].geometryId);
  });

  it("omits the geometries manifest when no image has one", () => {
    const text = serializeNotebook("Plain", [samplePage()]);
    expect(parseNotebookFile(text).geometries).toEqual([]);
    expect(text).not.toContain("geometries");
  });

  it("rejects an image referencing a geometry missing from the manifest", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 4,
      images: [{ imageId: "blob-1", mimeType: "image/svg+xml" }],
      pages: [
        {
          strokes: [],
          images: [{ imageId: "blob-1", x: 0, y: 0, width: 10, height: 10, geometryId: "ghost" }],
        },
      ],
    });
    expect(() => parseNotebookFile(text)).toThrow("unknown geometry");
  });

  it("resolves geometry documents from the zip archive", () => {
    const json = serializeNotebook(
      "Zip",
      [geometryPage()],
      geometryImages,
      undefined,
      [],
      [{ geometryId: "geo-1" }],
    );
    const zip = buildNotebookZip(json, [
      { path: imageEntryPath("blob-1", "image/svg+xml"), data: new Uint8Array([1]) },
      { path: geometryEntryPath("geo-1"), data: strToU8('{"objects":{}}') },
    ]);
    const entries = unzipSync(zip);
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    const resolved = resolveGeometryEntries(entries, parsed.geometries);
    expect(strFromU8(resolved[0])).toBe('{"objects":{}}');
  });

  it("resolveGeometryEntries throws when a geometry file is missing", () => {
    const json = serializeNotebook(
      "Zip",
      [geometryPage()],
      geometryImages,
      undefined,
      [],
      [{ geometryId: "geo-1" }],
    );
    const entries = unzipSync(
      buildNotebookZip(json, [
        { path: imageEntryPath("blob-1", "image/svg+xml"), data: new Uint8Array([1]) },
      ]),
    );
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    expect(() => resolveGeometryEntries(entries, parsed.geometries)).toThrow(
      "Missing geometry data",
    );
  });
});

describe("notebook text items", () => {
  function textedPage(): Page {
    return {
      ...samplePage(),
      images: [{ id: "item-1", imageId: "blob-1", x: 40, y: 40, width: 200, height: 100 }],
      texts: [
        {
          id: "text-1",
          x: 60,
          y: 80,
          width: 360,
          fontSize: 24,
          color: "#d64541",
          markdown: "# Title\n\nwith ![inline](image:blob-1) image and $x^2$",
        },
      ],
    };
  }

  it("round-trips text items and remaps markdown image refs", () => {
    const text = serializeNotebook(
      "Texts",
      [textedPage()],
      [{ imageId: "blob-1", mimeType: "image/png" }],
    );
    const parsed = parseNotebookFile(text);
    const item = parsed.pages[0].texts[0];
    expect(item.id).not.toBe("text-1");
    expect(item).toMatchObject({ x: 60, y: 80, width: 360, fontSize: 24, color: "#d64541" });
    const newImageId = parsed.images[0].imageId;
    expect(item.markdown).toBe(`# Title\n\nwith ![inline](image:${newImageId}) image and $x^2$`);
  });

  it("rejects a text referencing an image missing from the manifest", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 5,
      pages: [
        {
          strokes: [],
          texts: [
            {
              x: 0,
              y: 0,
              width: 200,
              fontSize: 24,
              color: "#1a1a1a",
              markdown: "![](image:ghost)",
            },
          ],
        },
      ],
    });
    expect(() => parseNotebookFile(text)).toThrow("unknown image");
  });

  it("rejects invalid text geometry and overlong markdown", () => {
    const base = { x: 0, y: 0, width: 200, fontSize: 24, color: "#1a1a1a", markdown: "ok" };
    const wrap = (textEntry: unknown) =>
      JSON.stringify({
        format: "vas-notebook",
        version: 5,
        pages: [{ strokes: [], texts: [textEntry] }],
      });
    expect(() => parseNotebookFile(wrap({ ...base, width: 10 }))).toThrow("Invalid text width");
    expect(() => parseNotebookFile(wrap({ ...base, fontSize: 500 }))).toThrow(
      "Invalid text font size",
    );
    expect(() => parseNotebookFile(wrap({ ...base, markdown: "x".repeat(20001) }))).toThrow(
      "Text is too long",
    );
  });

  it("reads v4 files without texts as empty text lists", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 4,
      pages: [{ strokes: [] }],
    });
    expect(parseNotebookFile(text).pages[0].texts).toEqual([]);
  });
});

describe("notebook media", () => {
  function mediaPage(): Page {
    return {
      ...samplePage(),
      images: [
        {
          id: "item-1",
          imageId: "blob-1",
          x: 40,
          y: 40,
          width: 320,
          height: 180,
          videoId: "vid-1",
        },
      ],
      audios: [{ id: "audio-1", audioId: "aud-1", x: 40, y: 300, width: 240, height: 44 }],
    };
  }

  const mediaImages = [{ imageId: "blob-1", mimeType: "image/png" }];
  const mediaManifest = [
    { mediaId: "vid-1", kind: "video" as const, mimeType: "video/webm" },
    { mediaId: "aud-1", kind: "audio" as const, mimeType: "audio/webm" },
  ];

  function serializeMedia(): string {
    return serializeNotebook("Media", [mediaPage()], mediaImages, undefined, [], [], mediaManifest);
  }

  it("round-trips video and audio items and remaps the media ids", () => {
    const parsed = parseNotebookFile(serializeMedia());
    expect(parsed.media).toHaveLength(2);
    const video = parsed.media.find((e) => e.kind === "video");
    const audio = parsed.media.find((e) => e.kind === "audio");
    expect(video?.sourceId).toBe("vid-1");
    expect(audio?.sourceId).toBe("aud-1");
    expect(video?.mediaId).not.toBe("vid-1");
    const item = parsed.pages[0].images[0];
    expect(item.videoId).toBe(video?.mediaId);
    expect(item.imageId).toBe(parsed.images[0].imageId);
    const badge = parsed.pages[0].audios[0];
    expect(badge.id).not.toBe("audio-1");
    expect(badge.audioId).toBe(audio?.mediaId);
    expect(badge).toMatchObject({ x: 40, y: 300, width: 240, height: 44 });
  });

  it("omits the media manifest when nothing references media", () => {
    const text = serializeNotebook("Plain", [samplePage()]);
    expect(parseNotebookFile(text).media).toEqual([]);
    expect(text).not.toContain("media");
  });

  it("reads v5 files without audios as empty audio lists", () => {
    const text = JSON.stringify({
      format: "vas-notebook",
      version: 5,
      pages: [{ strokes: [] }],
    });
    const parsed = parseNotebookFile(text);
    expect(parsed.pages[0].audios).toEqual([]);
    expect(parsed.media).toEqual([]);
  });

  it("rejects a page referencing media missing from the manifest", () => {
    const audioRef = JSON.stringify({
      format: "vas-notebook",
      version: 6,
      pages: [{ strokes: [], audios: [{ audioId: "ghost", x: 0, y: 0, width: 240, height: 44 }] }],
    });
    expect(() => parseNotebookFile(audioRef)).toThrow("unknown media");
    const videoRef = JSON.stringify({
      format: "vas-notebook",
      version: 6,
      images: [{ imageId: "blob-1", mimeType: "image/png" }],
      pages: [
        {
          strokes: [],
          images: [{ imageId: "blob-1", x: 0, y: 0, width: 10, height: 10, videoId: "ghost" }],
        },
      ],
    });
    expect(() => parseNotebookFile(videoRef)).toThrow("unknown media");
  });

  it("rejects invalid media manifest entries and audio geometry", () => {
    const badKind = JSON.stringify({
      format: "vas-notebook",
      version: 6,
      media: [
        { mediaId: "m1", kind: "video", mimeType: "video/webm" },
        { mediaId: "m2", kind: "midi", mimeType: "audio/midi" },
      ],
      pages: [{ strokes: [] }],
    });
    expect(() => parseNotebookFile(badKind)).toThrow("Invalid media kind");
    const badRect = JSON.stringify({
      format: "vas-notebook",
      version: 6,
      media: [{ mediaId: "m1", kind: "audio", mimeType: "audio/webm" }],
      pages: [{ strokes: [], audios: [{ audioId: "m1", x: 0, y: 0, width: 0, height: 44 }] }],
    });
    expect(() => parseNotebookFile(badRect)).toThrow("Invalid audio width");
  });

  it("resolves media bytes from the zip archive", () => {
    const zip = buildNotebookZip(serializeMedia(), [
      { path: imageEntryPath("blob-1", "image/png"), data: new Uint8Array([1]) },
      { path: mediaEntryPath("vid-1", "video/webm"), data: new Uint8Array([5, 6, 7]) },
      { path: mediaEntryPath("aud-1", "audio/webm"), data: new Uint8Array([8, 9]) },
    ]);
    const entries = unzipSync(zip);
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    const resolved = resolveMediaEntries(entries, parsed.media);
    expect([...resolved[0]]).toEqual([5, 6, 7]);
    expect([...resolved[1]]).toEqual([8, 9]);
  });

  it("resolveMediaEntries throws when a media file is missing", () => {
    const entries = unzipSync(
      buildNotebookZip(serializeMedia(), [
        { path: imageEntryPath("blob-1", "image/png"), data: new Uint8Array([1]) },
      ]),
    );
    const parsed = parseNotebookFile(strFromU8(entries[NOTEBOOK_JSON_ENTRY]));
    expect(() => resolveMediaEntries(entries, parsed.media)).toThrow("Missing media data");
  });
});

describe("sanitizeFileName", () => {
  it("replaces characters that are unsafe in file names", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("keeps safe names untouched", () => {
    expect(sanitizeFileName("My notes-page-1.png")).toBe("My notes-page-1.png");
  });
});

describe("remapPageAssetIds", () => {
  it("remaps image, video, audio, pdf and text references", () => {
    const page: Page = {
      id: "p1",
      width: 794,
      height: 1123,
      paperColor: "#ffffff",
      pattern: "blank",
      strokes: [],
      images: [
        { id: "i1", imageId: "img-old", x: 0, y: 0, width: 10, height: 10 },
        {
          id: "i2",
          imageId: "img-old-2",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          videoId: "vid-old",
        },
        {
          id: "i3",
          imageId: "img-old-3",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          pdfSource: { docId: "doc-old", pageIndex: 2 },
        },
      ],
      texts: [
        {
          id: "t1",
          x: 0,
          y: 0,
          width: 100,
          fontSize: 20,
          color: "#000000",
          markdown: "see ![](image:img-old)",
        },
      ],
      audios: [{ id: "a1", audioId: "aud-old", x: 0, y: 0, width: 10, height: 10 }],
      pdfSource: { docId: "doc-old", pageIndex: 0 },
    };
    remapPageAssetIds([page], {
      images: new Map([
        ["img-old", "img-new"],
        ["img-old-2", "img-new-2"],
        ["img-old-3", "img-new-3"],
      ]),
      pdfs: new Map([["doc-old", "doc-new"]]),
      media: new Map([
        ["vid-old", "vid-new"],
        ["aud-old", "aud-new"],
      ]),
    });
    expect(page.images[0].imageId).toBe("img-new");
    expect(page.images[1].videoId).toBe("vid-new");
    expect(page.images[2].pdfSource?.docId).toBe("doc-new");
    expect(page.images[2].pdfSource?.pageIndex).toBe(2);
    expect(page.texts[0].markdown).toBe("see ![](image:img-new)");
    expect(page.audios[0].audioId).toBe("aud-new");
    expect(page.pdfSource?.docId).toBe("doc-new");
    expect(page.pdfSource?.pageIndex).toBe(0);
  });

  it("keeps references without a mapping untouched", () => {
    const page: Page = {
      id: "p1",
      width: 794,
      height: 1123,
      paperColor: "#ffffff",
      pattern: "blank",
      strokes: [],
      images: [{ id: "i1", imageId: "img-old", x: 0, y: 0, width: 10, height: 10 }],
      texts: [],
      audios: [{ id: "a1", audioId: "aud-old", x: 0, y: 0, width: 10, height: 10 }],
      pdfSource: { docId: "doc-old", pageIndex: 1, whiteBackground: true },
    };
    remapPageAssetIds([page], { images: new Map(), pdfs: new Map(), media: new Map() });
    expect(page.images[0].imageId).toBe("img-old");
    expect(page.audios[0].audioId).toBe("aud-old");
    expect(page.pdfSource?.docId).toBe("doc-old");
    expect(page.pdfSource?.whiteBackground).toBe(true);
  });
});
