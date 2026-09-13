import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Desktop shell loads the deployed MedLum HTTPS URL at runtime.
 * Tauri requires frontendDist (out/) and app icons; generate placeholders.
 */

const root = process.cwd();

const outDir = path.join(root, "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MedLum</title>
  </head>
  <body>
    <p>MedLum desktop shell — production window URL is injected at package time.</p>
  </body>
</html>
`
);

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c;
}

function pngRgba(size, rgba = [26, 86, 219, 255]) {
  const [r, g, b, a] = rgba;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const iconsDir = path.join(root, "src-tauri", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

const png32 = pngRgba(32);
const png128 = pngRgba(128);
const png256 = pngRgba(256);
const png512 = pngRgba(512);

fs.writeFileSync(path.join(iconsDir, "32x32.png"), png32);
fs.writeFileSync(path.join(iconsDir, "128x128.png"), png128);
fs.writeFileSync(path.join(iconsDir, "128x128@2x.png"), png256);
fs.writeFileSync(path.join(iconsDir, "icon.png"), png512);

const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
const icoEntry = Buffer.alloc(16);
icoEntry[0] = 32;
icoEntry[1] = 32;
icoEntry.writeUInt16LE(1, 4);
icoEntry.writeUInt16LE(32, 6);
icoEntry.writeUInt32LE(png32.length, 8);
icoEntry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(iconsDir, "icon.ico"), Buffer.concat([icoHeader, icoEntry, png32]));

function icnsChunk(ostype, data) {
  const header = Buffer.alloc(8);
  header.write(ostype, 0, 4, "ascii");
  header.writeUInt32BE(8 + data.length, 4);
  return Buffer.concat([header, data]);
}
const icnsBody = icnsChunk("ic09", png512);
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns", 0, 4, "ascii");
icnsHeader.writeUInt32BE(8 + icnsBody.length, 4);
fs.writeFileSync(path.join(iconsDir, "icon.icns"), Buffer.concat([icnsHeader, icnsBody]));

console.log("Prepared desktop web placeholder at out/index.html");
console.log("Prepared Tauri icons at src-tauri/icons/");
