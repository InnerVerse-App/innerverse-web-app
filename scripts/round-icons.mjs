// One-shot script to give the favicon + PWA icons rounded corners and
// a small transparent margin. Source PNGs are 8-bit RGB (no alpha)
// with the dark teal going pixel-for-pixel to the edge — which the
// browser renders against the tab-strip background as a thin white
// halo when it clips to a rounded shape.
//
// Output: in-place rewrites of src/app/icon.png, public/icon-192.png,
// and public/icon-512.png with the same artwork composited inside a
// rounded-rectangle alpha mask.
//
// Run once with `node scripts/round-icons.mjs`. Re-running is
// idempotent (the result of one pass is already a clean rounded icon
// — a second pass just re-rounds an already-rounded shape).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Margin around the artwork as a fraction of the icon's edge length.
// 4% leaves visible breathing room without cropping the logo's dots.
const MARGIN_PCT = 0.04;
// Corner radius as a fraction of the icon's edge length. 22% matches
// the modern app-icon convention (iOS uses ~22.4% for its squircle
// approximation).
const RADIUS_PCT = 0.22;

const TARGETS = [
  "src/app/icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
];

function maskSvg(size) {
  const r = Math.round(size * RADIUS_PCT);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/>
    </svg>`,
  );
}

async function processOne(relPath) {
  const abs = path.resolve(relPath);
  const src = readFileSync(abs);
  const meta = await sharp(src).metadata();
  const size = meta.width;
  if (size !== meta.height) {
    throw new Error(`${relPath}: not square (${meta.width}x${meta.height})`);
  }

  // Inset the artwork by MARGIN_PCT on every side, then composite on
  // a fully-transparent canvas of the original size. This adds the
  // visible breathing room.
  const inset = Math.round(size * MARGIN_PCT);
  const inner = size - inset * 2;
  const insetArtwork = await sharp(src)
    .resize(inner, inner, { fit: "fill" })
    .toBuffer();

  const padded = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: insetArtwork, top: inset, left: inset }])
    .png()
    .toBuffer();

  // Apply the rounded-rectangle alpha mask via dest-in.
  const rounded = await sharp(padded)
    .composite([{ input: maskSvg(size), blend: "dest-in" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  writeFileSync(abs, rounded);
  console.log(`  ${relPath} → ${rounded.length.toLocaleString()} bytes`);
}

console.log("Rounding icons + adding transparent margin…");
for (const t of TARGETS) {
  await processOne(t);
}
console.log("Done.");
