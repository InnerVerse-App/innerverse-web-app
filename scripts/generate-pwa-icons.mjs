import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "reference/logos/innerverse_logo only 300x300.jpg";

await mkdir("public", { recursive: true });

await sharp(SOURCE)
  .resize(192, 192, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile("public/icon-192.png");

await sharp(SOURCE)
  .resize(512, 512, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile("public/icon-512.png");

// iOS flattens transparency to black on the home screen, so apple-icon ships with a solid background.
await sharp(SOURCE)
  .resize(180, 180, {
    fit: "contain",
    background: { r: 255, g: 255, b: 255 },
  })
  .png()
  .toFile("src/app/apple-icon.png");

// Replace the 4440x6660 source-res favicon with a properly-sized version.
await sharp(SOURCE)
  .resize(64, 64, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile("src/app/icon.png");

console.log("Generated PWA icons.");
