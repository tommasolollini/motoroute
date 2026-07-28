// Renders the MotoRoute app icons from the vector mark (public/logo-mark.svg).
// iOS/Android apply their own corner mask, so we ship a full-bleed dark square.
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BG = '#0f0f0f';
const markSvg = readFileSync(new URL('../public/logo-mark.svg', import.meta.url));

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
