import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const INK = [26, 26, 26];
const PAPER = [255, 255, 255];

const STROKE = [
  [0.28, 0.3],
  [0.46, 0.72],
  [0.74, 0.26],
];
const STROKE_WIDTH = 0.085;
const DOT = { x: 0.75, y: 0.71, r: 0.055 };

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRoundedRect(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

function rasterize(size, { fullBleed }) {
  const data = new Uint8Array(size * size * 4);
  const radius = size * 0.22;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const offset = (py * size + px) * 4;
      if (!fullBleed && !insideRoundedRect(px + 0.5, py + 0.5, size, radius)) continue;
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      let color = INK;
      const d1 = segmentDistance(u, v, ...STROKE[0], ...STROKE[1]);
      const d2 = segmentDistance(u, v, ...STROKE[1], ...STROKE[2]);
      const onStroke = Math.min(d1, d2) <= STROKE_WIDTH / 2;
      const onDot = Math.hypot(u - DOT.x, v - DOT.y) <= DOT.r;
      if (onStroke || onDot) color = PAPER;
      data.set([color[0], color[1], color[2], 255], offset);
    }
  }
  return data;
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writeIcon(name, size, options) {
  const png = encodePng(size, size, rasterize(size, options));
  writeFileSync(join(outDir, name), png);
  console.log(`${name} (${size}x${size})`);
}

writeIcon("icon-192.png", 192, { fullBleed: false });
writeIcon("icon-512.png", 512, { fullBleed: false });
writeIcon("icon-maskable-512.png", 512, { fullBleed: true });
writeIcon("apple-touch-icon.png", 180, { fullBleed: true });
writeIcon("favicon-32.png", 32, { fullBleed: false });
