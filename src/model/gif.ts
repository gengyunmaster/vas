const HEADER_SIZE = 6;
const SCREEN_DESCRIPTOR_SIZE = 7;
const EXTENSION = 0x21;
const EXTENSION_GCE = 0xf9;
const IMAGE_DESCRIPTOR = 0x2c;
const TRAILER = 0x3b;
const COLOR_TABLE_FLAG = 0x80;
const INTERLACE_FLAG = 0x40;
// Only "animated or not" matters for counting, so it stops at two frames.
const ANIMATED_AT = 2;

const MAX_FRAMES = 150;
const MAX_TOTAL_PIXELS = 25_000_000;
const MAX_FRAME_PIXELS = 4_000_000;
const MIN_DELAY_MS = 20;
const DEFAULT_DELAY_MS = 100;
const MAX_CODE_SIZE = 12;

const INTERLACE_PASSES: readonly [number, number][] = [
  [0, 8],
  [4, 8],
  [2, 4],
  [1, 2],
];

export interface GifFrames {
  width: number;
  height: number;
  frames: { delayMs: number; pixels: Uint8ClampedArray<ArrayBuffer> }[];
}

interface GifScreen {
  width: number;
  height: number;
  colorTable: Uint8Array | null;
  next: number;
}

interface GifImageBlock {
  kind: "image";
  left: number;
  top: number;
  width: number;
  height: number;
  interlaced: boolean;
  colorTable: Uint8Array | null;
  minCodeSize: number;
  data: Uint8Array;
}

type GifBlock =
  | { kind: "gce"; disposal: number; delayCs: number; transparentIndex: number }
  | GifImageBlock
  | { kind: "extension" }
  | { kind: "trailer" };

export function countGifFrames(bytes: Uint8Array): number {
  const screen = readGifScreen(bytes);
  if (!screen) return 0;
  let offset = screen.next;
  let frames = 0;
  while (frames < ANIMATED_AT) {
    const result = nextGifBlock(bytes, offset);
    if (!result || result.block.kind === "trailer") break;
    if (result.block.kind === "image") frames++;
    offset = result.next;
  }
  return frames;
}

// Fully decodes and composites an animated GIF into per-frame full-size RGBA
// snapshots. Returns null (never throws) on malformed input or past the safety
// limits; callers fall back to the static first frame.
export function decodeGifFrames(bytes: Uint8Array): GifFrames | null {
  const screen = readGifScreen(bytes);
  if (!screen) return null;
  const { width, height } = screen;
  if (width <= 0 || height <= 0 || width * height > MAX_TOTAL_PIXELS) return null;
  const composite = new Uint8ClampedArray(width * height * 4);
  const frames: GifFrames["frames"] = [];
  let gce = { disposal: 0, delayCs: 0, transparentIndex: -1 };
  let offset = screen.next;
  let sawTrailer = false;
  while (true) {
    const result = nextGifBlock(bytes, offset);
    if (!result) break;
    offset = result.next;
    const block = result.block;
    if (block.kind === "trailer") {
      sawTrailer = true;
      break;
    }
    if (block.kind === "gce") {
      gce = block;
      continue;
    }
    if (block.kind !== "image") continue;
    if (block.width <= 0 || block.height <= 0) return null;
    if (block.width * block.height > MAX_FRAME_PIXELS) return null;
    if (block.left + block.width > width || block.top + block.height > height) return null;
    const colorTable = block.colorTable ?? screen.colorTable;
    if (!colorTable) return null;
    const indices = lzwDecode(block.minCodeSize, block.data, block.width * block.height);
    if (!indices) return null;
    // Disposal 3 restores the pre-frame state after this frame's snapshot.
    const previous = gce.disposal === 3 ? composite.slice() : null;
    drawFrame(composite, width, block, indices, colorTable, gce.transparentIndex);
    const delayMs = Math.max(MIN_DELAY_MS, gce.delayCs > 0 ? gce.delayCs * 10 : DEFAULT_DELAY_MS);
    frames.push({ delayMs, pixels: composite.slice() });
    if (frames.length > MAX_FRAMES) return null;
    if (width * height * frames.length > MAX_TOTAL_PIXELS) return null;
    if (gce.disposal === 2) clearFrameRegion(composite, width, block);
    else if (gce.disposal === 3 && previous) composite.set(previous);
    gce = { disposal: 0, delayCs: 0, transparentIndex: -1 };
  }
  if (!sawTrailer || frames.length === 0) return null;
  return { width, height, frames };
}

function readGifScreen(bytes: Uint8Array): GifScreen | null {
  if (bytes.length < HEADER_SIZE + SCREEN_DESCRIPTOR_SIZE) return null;
  // "GIF8" + "7a" | "9a"
  if (
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x38 ||
    (bytes[4] !== 0x37 && bytes[4] !== 0x39) ||
    bytes[5] !== 0x61
  ) {
    return null;
  }
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  let next = HEADER_SIZE + SCREEN_DESCRIPTOR_SIZE;
  let colorTable: Uint8Array | null = null;
  if (bytes[10] & COLOR_TABLE_FLAG) {
    const size = colorTableSize(bytes[10]);
    if (next + size > bytes.length) return null;
    colorTable = bytes.subarray(next, next + size);
    next += size;
  }
  return { width, height, colorTable, next };
}

function nextGifBlock(bytes: Uint8Array, offset: number): { block: GifBlock; next: number } | null {
  if (offset >= bytes.length) return null;
  const marker = bytes[offset++];
  if (marker === TRAILER) return { block: { kind: "trailer" }, next: offset };
  if (marker === EXTENSION) {
    if (offset >= bytes.length) return null;
    const label = bytes[offset++];
    const sub = readSubBlocks(bytes, offset);
    if (label !== EXTENSION_GCE) return { block: { kind: "extension" }, next: sub.next };
    if (sub.data.length < 4) return null;
    return {
      block: {
        kind: "gce",
        disposal: (sub.data[0] >> 2) & 0x07,
        delayCs: sub.data[1] | (sub.data[2] << 8),
        transparentIndex: sub.data[0] & 0x01 ? sub.data[3] : -1,
      },
      next: sub.next,
    };
  }
  if (marker !== IMAGE_DESCRIPTOR) return null;
  if (offset + 9 > bytes.length) return null;
  const left = bytes[offset] | (bytes[offset + 1] << 8);
  const top = bytes[offset + 2] | (bytes[offset + 3] << 8);
  const width = bytes[offset + 4] | (bytes[offset + 5] << 8);
  const height = bytes[offset + 6] | (bytes[offset + 7] << 8);
  const packed = bytes[offset + 8];
  offset += 9;
  let colorTable: Uint8Array | null = null;
  if (packed & COLOR_TABLE_FLAG) {
    const size = colorTableSize(packed);
    if (offset + size > bytes.length) return null;
    colorTable = bytes.subarray(offset, offset + size);
    offset += size;
  }
  if (offset >= bytes.length) return null;
  const minCodeSize = bytes[offset++];
  const sub = readSubBlocks(bytes, offset);
  return {
    block: {
      kind: "image",
      left,
      top,
      width,
      height,
      interlaced: (packed & INTERLACE_FLAG) !== 0,
      colorTable,
      minCodeSize,
      data: sub.data,
    },
    next: sub.next,
  };
}

// Truncation keeps the bytes gathered so far: counting stays tolerant, and the
// LZW decode of the partial data is what rejects the frame for full decoding.
function readSubBlocks(bytes: Uint8Array, offset: number): { data: Uint8Array; next: number } {
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (offset < bytes.length) {
    const size = bytes[offset++];
    if (size === 0) break;
    const end = Math.min(offset + size, bytes.length);
    chunks.push(bytes.subarray(offset, end));
    length += end - offset;
    offset += size;
  }
  const data = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    data.set(chunk, at);
    at += chunk.length;
  }
  return { data, next: offset };
}

function colorTableSize(packed: number): number {
  return packed & COLOR_TABLE_FLAG ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
}

function drawFrame(
  composite: Uint8ClampedArray,
  screenWidth: number,
  block: GifImageBlock,
  indices: Uint8Array,
  colorTable: Uint8Array,
  transparentIndex: number,
): void {
  const rows = block.interlaced ? interlaceRows(block.height) : null;
  for (let r = 0; r < block.height; r++) {
    const row = rows ? rows[r] : r;
    const base = ((block.top + row) * screenWidth + block.left) * 4;
    for (let c = 0; c < block.width; c++) {
      const index = indices[r * block.width + c];
      if (index === transparentIndex) continue;
      const t = index * 3;
      if (t + 2 >= colorTable.length) continue;
      const p = base + c * 4;
      composite[p] = colorTable[t];
      composite[p + 1] = colorTable[t + 1];
      composite[p + 2] = colorTable[t + 2];
      composite[p + 3] = 255;
    }
  }
}

// Disposal 2 ("restore to background") clears to transparent so the paper
// shows through, matching how browsers composite transparent-backed GIFs.
function clearFrameRegion(
  composite: Uint8ClampedArray,
  screenWidth: number,
  block: GifImageBlock,
): void {
  for (let r = 0; r < block.height; r++) {
    const start = ((block.top + r) * screenWidth + block.left) * 4;
    composite.fill(0, start, start + block.width * 4);
  }
}

function interlaceRows(height: number): number[] {
  const rows: number[] = [];
  for (const [start, step] of INTERLACE_PASSES) {
    for (let row = start; row < height; row += step) rows.push(row);
  }
  return rows;
}

function lzwDecode(minCodeSize: number, data: Uint8Array, pixelCount: number): Uint8Array | null {
  if (minCodeSize < 2 || minCodeSize > 8) return null;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4096);
  const out = new Uint8Array(pixelCount);
  let outLength = 0;
  let codeSize = minCodeSize + 1;
  let next = endCode + 1;
  let prev = -1;
  let bitPos = 0;

  const readCode = (): number => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byteIndex = (bitPos + i) >> 3;
      if (byteIndex >= data.length) return -1;
      code |= ((data[byteIndex] >> ((bitPos + i) & 7)) & 1) << i;
    }
    bitPos += codeSize;
    return code;
  };

  while (outLength < pixelCount) {
    const code = readCode();
    if (code < 0) return null;
    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      next = endCode + 1;
      prev = -1;
      continue;
    }
    if (code === endCode) break;
    let stackLength = 0;
    let first: number;
    if (code < clearCode) {
      first = code;
      stack[stackLength++] = code;
    } else {
      const source = code === next && prev >= 0 ? prev : code;
      if (source >= next) return null;
      let c = source;
      while (c >= clearCode) {
        stack[stackLength++] = suffix[c];
        c = prefix[c];
      }
      first = c;
      stack[stackLength++] = c;
      if (code === next) stack[stackLength++] = first;
    }
    if (prev >= 0 && next < 4096) {
      prefix[next] = prev;
      suffix[next] = first;
      next++;
      if (next === 1 << codeSize && codeSize < MAX_CODE_SIZE) codeSize++;
    }
    while (stackLength > 0 && outLength < pixelCount) out[outLength++] = stack[--stackLength];
    prev = code;
  }
  return outLength === pixelCount ? out : null;
}
