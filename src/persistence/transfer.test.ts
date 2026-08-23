import { strFromU8, strToU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { Page } from "../model/page";
import {
  buildNotebookZip,
  geometryEntryPath,
  imageEntryPath,
  NOTEBOOK_JSON_ENTRY,
  parseNotebookFile,
  pdfEntryPath,
  resolveGeometryEntries,
  resolveImageEntries,
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

describe("sanitizeFileName", () => {
  it("replaces characters that are unsafe in file names", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("keeps safe names untouched", () => {
    expect(sanitizeFileName("My notes-page-1.png")).toBe("My notes-page-1.png");
  });
});
