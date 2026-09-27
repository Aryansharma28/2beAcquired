// Renders the extension icons icons/icon-{16,32,48,128}.png from the brand app icon (the cloud on lime,
// design/visual/assets/icon-512.png). Uses sharp from apps/web. Run: npm run icons
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sharp = createRequire(join(ROOT, "apps", "web", "package.json"))("sharp");
const SRC = join(ROOT, "design", "visual", "assets", "icon-512.png");
for (const px of [16, 32, 48, 128]) {
  // Rounded square like the app icon on a home screen.
  const r = Math.round(px * 0.22);
  const mask = Buffer.from(`<svg width="${px}" height="${px}"><rect width="${px}" height="${px}" rx="${r}" ry="${r}"/></svg>`);
  await sharp(SRC).resize(px, px).composite([{ input: mask, blend: "dest-in" }]).png().toFile(join(ROOT, "extension", "icons", `icon-${px}.png`));
  console.log(`icons/icon-${px}.png`);
}
