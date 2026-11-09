import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const output = new URL('../public/icons/', import.meta.url);
mkdirSync(output, { recursive: true });

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, crc]);
}

function icon(size, maskable) {
  const rows = Buffer.alloc(size * (1 + size * 3));
  const lines = [[8, 14, 18], [12, 10, 22], [16, 7, 25], [20, 11, 21], [24, 15, 17]];
  const scale = maskable ? 0.7 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = (((x + (sx + 0.5) / 4) / size * 32) - 16) / scale + 16;
          const py = (((y + (sy + 0.5) / 4) / size * 32) - 16) / scale + 16;
          if (lines.some(([cx, top, bottom]) => Math.hypot(px - cx, py - Math.max(top, Math.min(bottom, py))) <= 1.25)) covered++;
        }
      }
      const offset = y * (1 + size * 3) + 1 + x * 3;
      for (const [channel, background] of [122, 36, 54].entries()) {
        rows[offset + channel] = Math.round(background + (255 - background) * covered / 16);
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  writeFileSync(fileURLToPath(new URL(name, output)), icon(size, maskable));
}
