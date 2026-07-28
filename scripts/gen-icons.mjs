// Renders the MotoRoute app icons from the vector mark (public/logo-mark.svg).
// iOS/Android apply their own corner mask, so we ship a full-bleed dark square.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const BG = '#0f0f0f';

// Prefer the original logo file when present (public/logo-source.png): the app
// icon uses only its upper part, i.e. the mark without the wordmark.
const sourceUrl = new URL('../public/logo-source.png', import.meta.url);
let markSvg;
if (existsSync(sourceUrl)) {
  const img = sharp(readFileSync(sourceUrl));
  const { width = 0, height = 0 } = await img.metadata();
  markSvg = await img
    .extract({ left: 0, top: 0, width, height: Math.round(height * 0.72) })
    .trim()
    .png()
    .toBuffer();
  console.log('using public/logo-source.png (mark cropped from the original)');
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
