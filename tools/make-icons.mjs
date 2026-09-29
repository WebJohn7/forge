// Generates icons/icon-{180,192,512}.png with no dependencies (raw PNG via zlib).
// Design: near-black square, a bold white "F" built from bars, a red base bar.
// Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0e, 0x0e, 0x0d], FG = [0xff, 0xff, 0xff], RED = [0xd0, 0x3b, 0x3b];

// Shapes in a 100×100 unit space: [x, y, w, h, colour]
const SHAPES = [
  [30, 22, 12, 52, FG],   // stem
  [30, 22, 40, 12, FG],   // top arm
  [30, 44, 30, 11, FG],   // middle arm
  [30, 80, 40, 5, RED],   // base bar
];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 100, v = (y / size) * 100;
      let col = BG;
      for (const [sx, sy, w, h, c] of SHAPES) if (u >= sx && u < sx + w && v >= sy && v < sy + h) col = c;
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const s of [180, 192, 512]) {
  writeFileSync(new URL(`../icons/icon-${s}.png`, import.meta.url), png(s));
  console.log(`icons/icon-${s}.png`);
}
