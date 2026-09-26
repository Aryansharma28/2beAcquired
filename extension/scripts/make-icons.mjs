// Renders the poof mark (yellow swing tag, tilted, on a cobalt rounded square) to
// icons/icon-{16,32,48,128}.png. Pure node: analytic shapes + 8x8 supersampling.
// Run: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
const COBALT = [0x2b, 0x3b, 0xff];
const TAG = [0xff, 0xd8, 0x4d];
const ANGLE = (-12 * Math.PI) / 180;

// Tag in its own 380x220 space (same shape as the web app icon): a pointed left end,
// rounded right corners (r=20) and a punched hole at (62,110) r=17.
function inTag(x, y) {
  if (y < 0 || y > 220 || x < 0 || x > 380) return false;
  if (x < 80) return Math.abs(y - 110) <= (110 * x) / 80;
  const r = 20;
  const cx = x > 380 - r ? 380 - r : null;
  const cy = y < r ? r : y > 220 - r ? 220 - r : null;
  if (cx !== null && cy !== null) return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  return true;
}
const inHole = (x, y, holeR) => (x - 62) ** 2 + (y - 110) ** 2 <= holeR * holeR;

function inRoundRect(u, v, r) {
  const cx = Math.min(Math.max(u, r), 1 - r);
  const cy = Math.min(Math.max(v, r), 1 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

/** Colour at unit-square point (u,v), or null for transparent. */
function sample(u, v, size) {
  if (!inRoundRect(u, v, 0.22)) return null;
  // Tag width as a share of the icon: bigger at tiny sizes so it stays readable.
  const share = size <= 16 ? 0.9 : size <= 32 ? 0.84 : 0.78;
  const scale = 380 / share; // tag units per icon unit
  // Rotate the point back by the tag's tilt around the icon centre.
  const dx = u - 0.5;
  const dy = v - 0.5;
  const rx = dx * Math.cos(-ANGLE) - dy * Math.sin(-ANGLE);
  const ry = dx * Math.sin(-ANGLE) + dy * Math.cos(-ANGLE);
  const tx = rx * scale + 190;
  const ty = ry * scale + 110;
  // Keep the hole at least ~1px wide at small sizes.
  const holeR = Math.max(17, (0.9 * scale) / size);
  if (inTag(tx, ty) && !inHole(tx, ty, holeR)) return TAG;
  return COBALT;
}

function render(size) {
  const SS = 8;
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
        px[i + 3] = Math.round((255 * a) / (SS * SS));
      }
    }
  }
  return encodePng(size, size, px);
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log("wrote", file);
}
