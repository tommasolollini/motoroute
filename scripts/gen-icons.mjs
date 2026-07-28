// Renders the MotoRoute app icons from the vector mark (public/logo-mark.svg).
// iOS/Android apply their own corner mask, so we ship a full-bleed dark square.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

let BG = '#0f0f0f';

// Prefer the original logo file when present (public/logo-source.png): the app
// icon uses only its upper part, i.e. the mark without the wordmark.
const sourceUrl = new URL('../public/logo-source.png', import.meta.url);
let markSvg;
if (existsSync(sourceUrl)) {
  const buf = readFileSync(sourceUrl);
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  // Crop the mark (mountain + road), leaving out the wordmark underneath.
  const region = {
    left: Math.round(width * 0.17),
    top: Math.round(height * 0.12),
    width: Math.round(width * 0.66),
    height: Math.round(height * 0.60),
  };
  markSvg = await sharp(buf).extract(region).png().toBuffer();
  // Match the icon background to the logo's own black so no seam shows.
  const [r, g, b] = await sharp(markSvg).extract({ left: 2, top: 2, width: 4, height: 4 }).raw().toBuffer();
  BG = `rgb(${r},${g},${b})`;
  console.log(`using public/logo-source.png (${width}x${height}, mark cropped, bg ${BG})`);
} else {
  markSvg = readFileSync(new URL('../public/logo-mark.svg', import.meta.url));
  console.log('using public/logo-mark.svg (placeholder — drop logo-source.png to use the real logo)');
}

const SIZES = [
  [512, 'icon-512.png'],
  [192, 'icon-192.png'],
  [180, 'apple-touch-icon.png'],
];

for (const [size, name] of SIZES) {
  const inner = Math.round(size * 0.82); // padding around the mark
  const mark = await sharp(markSvg).resize(inner, inner).png().toBuffer();
  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png);
  console.log(`${name}: ${size}x${size}, ${png.length} bytes`);
}

// Lightweight full logo (with wordmark) for the splash screen.
if (existsSync(sourceUrl)) {
  const splash = await sharp(readFileSync(sourceUrl))
    .trim({ threshold: 20 }) // drop the white margin around the logo
    .resize(560, 560, { fit: 'inside' })
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
  writeFileSync(new URL('../public/logo.png', import.meta.url), splash);
  console.log(`logo.png: 560px, ${splash.length} bytes`);
}
