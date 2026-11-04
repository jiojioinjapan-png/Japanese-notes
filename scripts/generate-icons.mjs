import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Render the repository's vector mark; no external image service or font is used.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const source = await readFile(resolve(publicDir, 'icons/app-icon.svg'), 'utf8');
await mkdir(resolve(publicDir, 'icons'), { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [size, file] of [
    [180, 'apple-touch-icon.png'],
    [192, 'icons/icon-192.png'],
    [512, 'icons/icon-512.png'],
    [512, 'icons/icon-maskable-512.png'],
    [32, 'icons/favicon-32.png'],
    [16, 'icons/favicon-16.png'],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${source}`,
    );
    await page.screenshot({ path: resolve(publicDir, file) });
  }
} finally {
  await browser.close();
}
const favicon = source.replace(
  '<path fill="url(#background)" d="M0 0h512v512H0z"/>',
  '<rect width="512" height="512" rx="110" fill="url(#background)"/>',
);
await writeFile(resolve(publicDir, 'favicon.svg'), favicon);
const bitmaps = await Promise.all(
  [16, 32].map((size) => readFile(resolve(publicDir, `icons/favicon-${size}.png`))),
);
const header = Buffer.alloc(6 + 16 * bitmaps.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(bitmaps.length, 4);
let offset = header.length;
for (let i = 0; i < bitmaps.length; i++) {
  const position = 6 + i * 16;
  const size = [16, 32][i];
  header[position] = size;
  header[position + 1] = size;
  header.writeUInt16LE(1, position + 4);
  header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(bitmaps[i].length, position + 8);
  header.writeUInt32LE(offset, position + 12);
  offset += bitmaps[i].length;
}
await writeFile(resolve(publicDir, 'favicon.ico'), Buffer.concat([header, ...bitmaps]));
console.log('Generated iPhone home-screen, web app, and browser tab icons.');
