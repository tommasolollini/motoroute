// Generates MotoRoute PNG icons procedurally (no deps beyond Node built-ins).
// A dark tile with an amber "road" diagonal and two waypoint dots.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [15, 15, 15];
const AMBER = [239, 159, 39];
const GREEN = [29, 158, 117];
const DARK = [15, 15, 15];

function hypotSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size;
  // road endpoints and dots (fractions of the tile)
  const ax = 0.22 * s, ay = 0.78 * s;
  const bx = 0.78 * s, by = 0.22 * s;
  const road = 0.066 * s;   // half-thickness
  const dotR = 0.058 * s;
  const ring = 0.016 * s;

  const put = (i, [r, g, b]) => { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; };

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const cx = x + 0.5, cy = y + 0.5;
      let color = BG;

      if (hypotSeg(cx, cy, ax, ay, bx, by) <= road) color = AMBER;

      const dStart = Math.hypot(cx - ax, cy - ay);
      const dEnd = Math.hypot(cx - bx, cy - by);
      if (dStart <= dotR + ring) color = dStart <= dotR ? GREEN : DARK;
      if (dEnd <= dotR + ring) color = dEnd <= dotR ? AMBER : DARK;

      put(i, color);
    }
  }
  return buf;
}

// --- minimal PNG encoder (8-bit RGBA) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
for (const [size, name] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  const png = encodePng(render(size), size);
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png);
  console.log(`${name}: ${size}x${size}, ${png.length} bytes`);
}
