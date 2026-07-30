// Generates MotoRoute app icons from the transparent logo (public/logo.svg).
// The splash uses logo.svg directly (transparent), so no white can ever show.
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const DARK = '#0C0C0B'; // the logo's own black
const svg = readFileSync(new URL('../public/logo.svg', import.meta.url));

// High-res transparent render of the whole logo.
const full = await sharp(svg, { density: 200 }).png().toBuffer();
const meta = await sharp(full).metadata();
const W = meta.width ?? 1254;
const H = meta.height ?? 1254;

// The mark alone (mountain + road) = top ~72% of the canvas, excluding the wordmark.
const cropped = await sharp(full)
  .extract({ left: 0, top: 0, width: W, height: Math.round(H * 0.72) })
  .png()
  .toBuffer();
const mark = await sharp(cropped).trim().png().toBuffer();

const SIZES = [
  [512, 'icon-512.png'],
  [192, 'icon-192.png'],
  [180, 'apple-touch-icon.png'],
];

for (const [size, name] of SIZES) {
  const inner = Math.round(size * 0.8);
  const scaled = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const png = await sharp({ create: { width: size, height: size, channels: 4, background: DARK } })
    .composite([{ input: scaled, gravity: 'center' }])
    .png()
    .toBuffer();
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png);
  console.log(`${name}: ${size}x${size}, ${png.length} bytes`);
}
