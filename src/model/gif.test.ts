import { describe, expect, it } from "vitest";
import { countGifFrames, decodeGifFrames, type GifFrames } from "./gif";

const FRAME = [
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,
];
const FRAME_WITH_LCT = [
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0xff, 0x00, 0x00,
  0x02, 0x02, 0x44, 0x01, 0x00,
];
const GCE = [0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00];
const COMMENT = [0x21, 0xfe, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00];

function gifBytes(blocks: number[][], { version = 0x39, gct = true } = {}): Uint8Array {
  return new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    version,
    0x61, // "GIF8xa"
    0x01,
    0x00,
    0x01,
    0x00,
    gct ? 0x80 : 0x00,
    0x00,
    0x00,
    ...(gct ? [0x00, 0x00, 0x00, 0xff, 0xff, 0xff] : []),
    ...blocks.flat(),
    0x3b,
  ]);
}

describe("countGifFrames", () => {
  it("counts a real single-frame GIF", () => {
    // The classic 1x1 transparent GIF89a.
    const bytes = Uint8Array.from(
      atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
      (c) => c.charCodeAt(0),
    );
    expect(countGifFrames(bytes)).toBe(1);
  });

  it("counts one frame per image descriptor, skipping extensions", () => {
    expect(countGifFrames(gifBytes([FRAME]))).toBe(1);
    expect(countGifFrames(gifBytes([GCE, FRAME, COMMENT, FRAME_WITH_LCT]))).toBe(2);
  });

  it("stops counting once two frames are found", () => {
    expect(countGifFrames(gifBytes([FRAME, FRAME, FRAME]))).toBe(2);
  });

  it("accepts GIF87a and a missing global color table", () => {
    expect(countGifFrames(gifBytes([FRAME], { version: 0x37 }))).toBe(1);
    expect(countGifFrames(gifBytes([FRAME], { gct: false }))).toBe(1);
  });

  it("returns zero for non-GIF bytes", () => {
    expect(countGifFrames(new Uint8Array([]))).toBe(0);
    expect(countGifFrames(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      0,
    );
    expect(countGifFrames(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe(0);
    expect(countGifFrames(gifBytes([]))).toBe(0);
  });

  it("returns what was counted from truncated data", () => {
    const twoFrames = gifBytes([FRAME, FRAME]);
    expect(countGifFrames(twoFrames.slice(0, 46))).toBe(2);
    expect(countGifFrames(twoFrames.slice(0, 40))).toBe(1);
    expect(countGifFrames(gifBytes([FRAME]).slice(0, 22))).toBe(0);
  });
});

// --- decodeGifFrames fixtures ------------------------------------------------

const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];
const DEFAULT_TABLE = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255];
const PALETTE = [RED, GREEN, BLUE, WHITE];

interface EncFrame {
  width: number;
  height: number;
  left?: number;
  top?: number;
  indices?: number[];
  interlaced?: boolean;
  disposal?: number;
  delayCs?: number;
  transparentIndex?: number;
  minCodeSize?: number;
  realLzw?: boolean;
  rawData?: number[];
  localTable?: number[];
}

function le16(value: number): number[] {
  return [value & 0xff, value >> 8];
}

function packCodes(codes: { code: number; width: number }[]): number[] {
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const { code, width } of codes) {
    acc |= code << bits;
    bits += width;
    while (bits >= 8) {
      bytes.push(acc & 0xff);
      acc >>= 8;
      bits -= 8;
    }
  }
  if (bits > 0) bytes.push(acc & 0xff);
  return bytes;
}

// A clear code every two pixel codes keeps the code width at min+1, so solid
// patterns can be emitted without a real LZW dictionary.
function lzwTrick(indices: number[], m: number): number[] {
  const clear = 1 << m;
  const width = m + 1;
  const codes: { code: number; width: number }[] = [];
  for (let i = 0; i < indices.length; i += 2) {
    codes.push({ code: clear, width }, { code: indices[i], width });
    if (i + 1 < indices.length) codes.push({ code: indices[i + 1], width });
  }
  codes.push({ code: clear + 1, width });
  return packCodes(codes);
}

function lzwReal(indices: number[], m: number): number[] {
  const clear = 1 << m;
  const eoi = clear + 1;
  const out: { code: number; width: number }[] = [];
  const dict = new Map<string, number>();
  let next = eoi + 1;
  let width = m + 1;
  out.push({ code: clear, width });
  let prefix = [indices[0]];
  let prefixCode = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = `${prefix},${k}`;
    const existing = dict.get(key);
    if (existing !== undefined) {
      prefix.push(k);
      prefixCode = existing;
      continue;
    }
    out.push({ code: prefixCode, width });
    if (next < 4096) {
      dict.set(key, next++);
      if (next === (1 << width) + 1 && width < 12) width++;
    }
    prefix = [k];
    prefixCode = k;
  }
  out.push({ code: prefixCode, width });
  out.push({ code: eoi, width });
  return packCodes(out);
}

function subBlocks(data: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

function frameBytes(frame: EncFrame): number[] {
  const m = frame.minCodeSize ?? 2;
  const disposal = frame.disposal ?? 0;
  const delayCs = frame.delayCs ?? 0;
  const tIndex = frame.transparentIndex ?? -1;
  const data = frame.rawData ?? (frame.realLzw ? lzwReal : lzwTrick)(frame.indices ?? [], m);
  let packed = frame.interlaced ? 0x40 : 0x00;
  const table = frame.localTable ? [...frame.localTable] : [];
  if (table.length > 0) {
    const sizeField = Math.max(0, Math.ceil(Math.log2(table.length / 3)) - 1);
    packed |= 0x80 | sizeField;
    while (table.length < 3 * 2 ** (sizeField + 1)) table.push(0);
  }
  return [
    0x21,
    0xf9,
    0x04,
    ((disposal & 7) << 2) | (tIndex >= 0 ? 1 : 0),
    delayCs & 0xff,
    delayCs >> 8,
    tIndex >= 0 ? tIndex : 0,
    0x00,
    0x2c,
    ...le16(frame.left ?? 0),
    ...le16(frame.top ?? 0),
    ...le16(frame.width),
    ...le16(frame.height),
    packed,
    ...table,
    m,
    ...subBlocks(data),
  ];
}

function encodeGif(
  opts: { width: number; height: number; trailer?: boolean },
  frames: EncFrame[],
): Uint8Array {
  const bytes = [
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61,
    ...le16(opts.width),
    ...le16(opts.height),
    0x81, // global color table of 4 entries
    0x00,
    0x00,
    ...DEFAULT_TABLE,
  ];
  for (const frame of frames) bytes.push(...frameBytes(frame));
  if (opts.trailer !== false) bytes.push(0x3b);
  return new Uint8Array(bytes);
}

function solid(index: number, count: number): number[] {
  return new Array(count).fill(index);
}

function pixelAt(decoded: GifFrames, frame: number, x: number, y: number): number[] {
  const p = (y * decoded.width + x) * 4;
  return [...decoded.frames[frame].pixels.slice(p, p + 4)];
}

function expectFrame(decoded: GifFrames, frame: number, indices: number[]): void {
  const pixels = decoded.frames[frame].pixels;
  expect(indices.length * 4).toBe(pixels.length);
  for (const [i, index] of indices.entries()) {
    expect([...pixels.slice(i * 4, i * 4 + 4)], `pixel ${i}`).toEqual(PALETTE[index]);
  }
}

function fail(): never {
  throw new Error("decodeGifFrames returned null");
}

describe("decodeGifFrames", () => {
  it("decodes a real encoder-produced GIF", () => {
    // The classic 1x1 transparent GIF89a (GCE sets transparent index 0).
    const gif = Uint8Array.from(
      atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
      (c) => c.charCodeAt(0),
    );
    const decoded = decodeGifFrames(gif) ?? fail();
    expect(decoded.frames).toHaveLength(1);
    expect(decoded.frames[0].delayMs).toBe(100);
    expect(pixelAt(decoded, 0, 0, 0)).toEqual(CLEAR);
  });

  it("composites two full frames and reads delays", () => {
    const gif = encodeGif({ width: 2, height: 1 }, [
      { width: 2, height: 1, indices: solid(0, 2), delayCs: 30 },
      { width: 2, height: 1, indices: solid(2, 2), delayCs: 5 },
    ]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(decoded.frames.map((f) => f.delayMs)).toEqual([300, 50]);
    expectFrame(decoded, 0, [0, 0]);
    expectFrame(decoded, 1, [2, 2]);
  });

  it("defaults zero delay to 100ms and clamps tiny delays to 20ms", () => {
    const gif = encodeGif({ width: 1, height: 1 }, [
      { width: 1, height: 1, indices: [0], delayCs: 0 },
      { width: 1, height: 1, indices: [1], delayCs: 1 },
    ]);
    expect(decodeGifFrames(gif)?.frames.map((f) => f.delayMs)).toEqual([100, 20]);
  });

  it("keeps prior pixels under the transparent index", () => {
    const gif = encodeGif({ width: 2, height: 2 }, [
      { width: 2, height: 2, indices: solid(0, 4) },
      { width: 2, height: 2, indices: [1, 0, 1, 0], transparentIndex: 0 },
    ]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expectFrame(decoded, 1, [1, 0, 1, 0]);
    expect(pixelAt(decoded, 1, 1, 0)).toEqual(RED);
  });

  it("places partial frames at their offset", () => {
    const gif = encodeGif({ width: 3, height: 2 }, [
      { width: 3, height: 2, indices: solid(0, 6) },
      { left: 2, top: 1, width: 1, height: 1, indices: [1] },
    ]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expectFrame(decoded, 1, [0, 0, 0, 0, 0, 1]);
  });

  it("restores the frame region to transparent for disposal 2", () => {
    const gif = encodeGif({ width: 3, height: 3 }, [
      { width: 3, height: 3, indices: solid(0, 9) },
      { left: 1, top: 1, width: 2, height: 2, indices: solid(2, 4), disposal: 2 },
      { width: 1, height: 1, indices: [1] },
    ]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expect(pixelAt(decoded, 1, 1, 1)).toEqual(BLUE);
    expect(pixelAt(decoded, 2, 0, 0)).toEqual(GREEN);
    expect(pixelAt(decoded, 2, 1, 1)).toEqual(CLEAR);
    expect(pixelAt(decoded, 2, 2, 2)).toEqual(CLEAR);
    expect(pixelAt(decoded, 2, 2, 0)).toEqual(RED);
  });

  it("restores the pre-frame state for disposal 3", () => {
    const gif = encodeGif({ width: 3, height: 3 }, [
      { width: 3, height: 3, indices: solid(0, 9) },
      { left: 1, top: 1, width: 2, height: 2, indices: solid(2, 4), disposal: 3 },
      { width: 1, height: 1, indices: [1] },
    ]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expect(pixelAt(decoded, 2, 1, 1)).toEqual(RED);
    expect(pixelAt(decoded, 2, 0, 0)).toEqual(GREEN);
  });

  it("deinterlaces interlaced frames", () => {
    const pattern = Array.from({ length: 64 }, (_, i) => i % 4);
    const storage = [0, 4, 2, 6, 1, 3, 5, 7].flatMap((row) => pattern.slice(row * 8, row * 8 + 8));
    const gif = encodeGif({ width: 8, height: 8 }, [
      { width: 8, height: 8, indices: storage, interlaced: true },
    ]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expectFrame(decoded, 0, pattern);
  });

  it("decodes dictionary references and grows the code width", () => {
    // clear, 0, 1, <entry6>, <entry7>, eoi — entry 7 is read after the table
    // grows to 4-bit codes.
    const data = packCodes([
      { code: 4, width: 3 },
      { code: 0, width: 3 },
      { code: 1, width: 3 },
      { code: 6, width: 3 },
      { code: 7, width: 4 },
      { code: 5, width: 4 },
    ]);
    const gif = encodeGif({ width: 6, height: 1 }, [{ width: 6, height: 1, rawData: data }]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expectFrame(decoded, 0, [0, 1, 0, 1, 1, 0]);
  });

  it("decodes the not-in-table-yet (KwKwK) case", () => {
    const data = packCodes([
      { code: 4, width: 3 },
      { code: 0, width: 3 },
      { code: 6, width: 3 },
      { code: 5, width: 3 },
    ]);
    const gif = encodeGif({ width: 2, height: 1 }, [{ width: 2, height: 1, rawData: data }]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expectFrame(decoded, 0, [0, 0]);
  });

  it("round-trips streams from a dictionary-growing encoder", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 20; trial++) {
      const width = 8 + (trial % 9);
      const height = 8 + (trial % 7);
      const indices: number[] = [];
      for (let i = 0; i < width * height; i++) {
        indices.push(rand() < 0.6 && i > 0 ? indices[i - 1] : Math.floor(rand() * 4));
      }
      const gif = encodeGif({ width, height }, [{ width, height, indices, realLzw: true }]);
      const decoded = decodeGifFrames(gif) ?? fail();
      expectFrame(decoded, 0, indices);
    }
  });

  it("uses the local color table when present", () => {
    const gif = encodeGif({ width: 2, height: 1 }, [
      { width: 2, height: 1, indices: [0, 1], localTable: [0, 0, 0, 255, 255, 0] },
    ]);
    const decoded = decodeGifFrames(gif) ?? fail();
    expect(pixelAt(decoded, 0, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(decoded, 0, 1, 0)).toEqual([255, 255, 0, 255]);
  });

  it("returns null instead of throwing on malformed input", () => {
    const good = encodeGif({ width: 2, height: 1 }, [
      { width: 2, height: 1, indices: [0, 0] },
      { width: 2, height: 1, indices: [1, 1] },
    ]);
    expect(decodeGifFrames(good.slice(0, good.length - 4))).toBeNull();
    expect(
      decodeGifFrames(
        encodeGif({ width: 2, height: 1, trailer: false }, [
          { width: 2, height: 1, indices: [0, 0] },
        ]),
      ),
    ).toBeNull();
    expect(
      decodeGifFrames(
        encodeGif({ width: 2, height: 1 }, [
          { width: 2, height: 1, indices: [0, 0], minCodeSize: 1 },
        ]),
      ),
    ).toBeNull();
    // Unknown block marker.
    const junk = new Uint8Array([...good.slice(0, 19), 0x07, ...good.slice(19)]);
    expect(decodeGifFrames(junk)).toBeNull();
    // Frame region outside the logical screen.
    expect(
      decodeGifFrames(
        encodeGif({ width: 2, height: 1 }, [{ left: 1, width: 2, height: 1, indices: [0, 0] }]),
      ),
    ).toBeNull();
    expect(decodeGifFrames(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("returns null past the frame-count limit", () => {
    const frames: EncFrame[] = Array.from({ length: 151 }, () => ({
      width: 1,
      height: 1,
      indices: [0],
    }));
    expect(decodeGifFrames(encodeGif({ width: 1, height: 1 }, frames))).toBeNull();
  });

  it("returns null past the single-frame pixel limit", () => {
    const gif = encodeGif({ width: 2049, height: 2048 }, [
      { width: 2049, height: 2048, rawData: [0] },
    ]);
    expect(decodeGifFrames(gif)).toBeNull();
  });

  it("returns null past the total pixel budget", () => {
    // 2500x2500 screen with five tiny frames: 5 x 6.25M > 25M pixels.
    const frames: EncFrame[] = Array.from({ length: 5 }, () => ({
      width: 1,
      height: 1,
      indices: [0],
    }));
    expect(decodeGifFrames(encodeGif({ width: 2500, height: 2500 }, frames))).toBeNull();
  });
});
