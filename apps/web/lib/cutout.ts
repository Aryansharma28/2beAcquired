import sharp from "sharp";

/**
 * Item cutout (a transparent PNG of just the item, for the sticker look of the prototype).
 * 1. An image model isolates the item from the owner's photo (drops the hand, table, room) onto a flat screen
 *    colour: green, or magenta for green items. Background removers keep the hand that holds the item; this doesn't.
 * 2. We key that screen out ourselves: the image models don't return transparency.
 */
// gemini-3.1-flash-image copies printed text and logos faithfully (2.5 garbled "MONSTER" and sometimes ignored the screen).
const MODEL = process.env.CUTOUT_MODEL || "google/gemini-3.1-flash-image";

const PROMPT =
  "Product cutout for a second-hand listing. Isolate only the item being sold: keep it exactly as it is in the photo " +
  "(same shape, colour, angle, wear and details; copy all printed text and logos letter for letter), but remove the hand, " +
  "people and everything around it. Place the item " +
  "centered, filling most of the frame, on a flat solid bright green background (a green screen). If the item itself is " +
  "mostly green, use a flat solid magenta background instead. No border, no outline, no shadow, no reflection, no text.";

export async function isolate(photo: Buffer, mime = "image/jpeg"): Promise<Buffer> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      modalities: ["image", "text"],
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: `data:${mime};base64,${photo.toString("base64")}` } },
      ] }],
    }),
  });
  const j = await r.json().catch(() => null);
  const url: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!r.ok || !url) throw new Error(`image model: ${r.status} ${JSON.stringify(j?.error ?? j).slice(0, 200)}`);
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

/** Screen colour → transparent. Background = pixels of the screen's colour and hue that touch the border, plus
 *  enclosed gaps of the same colour (between chair legs); small stray specks are dropped; edges get a soft alpha. */
export async function keyOut(screen: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(screen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
  const med = (c: number) => { const v = border.map((p) => data[p * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const dist = (p: number) => { const i = p * 4; return Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]); };
  // Same colour AND same hue: a navy cushion is close to dark green in RGB, not in hue.
  const bm = (bg[0] + bg[1] + bg[2]) / 3;
  const cb = [bg[0] - bm, bg[1] - bm, bg[2] - bm];
  const cbn = Math.hypot(cb[0], cb[1], cb[2]) || 1;
  // No coloured screen around the item (the model returned a photo): no cutout; the app keeps using the photo.
  if (cbn < 40) throw new Error("image model returned no colour screen");
  const hue = (p: number) => { const i = p * 4, m = (data[i] + data[i + 1] + data[i + 2]) / 3;
    return ((data[i] - m) * cb[0] + (data[i + 1] - m) * cb[1] + (data[i + 2] - m) * cb[2]) / cbn; };
  const isBg = (p: number) => dist(p) < 90 && hue(p) > Math.max(12, cbn * 0.35);
  const around = (p: number) => { const x = p % W, y = (p / W) | 0;
    return [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]; };

  const mask = new Uint8Array(N);
  const stack: number[] = [];
  for (const p of border) if (!mask[p] && isBg(p)) { mask[p] = 1; stack.push(p); }
  while (stack.length) { const p = stack.pop()!; for (const q of around(p)) if (q >= 0 && !mask[q] && isBg(q)) { mask[q] = 1; stack.push(q); } }

  // Enclosed gaps: screen-coloured regions not touching the border.
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) if (!mask[s] && !seen[s] && isBg(s)) {
    const reg: number[] = []; let sum = 0; seen[s] = 1; stack.push(s);
    while (stack.length) { const p = stack.pop()!; reg.push(p); sum += dist(p);
      for (const q of around(p)) if (q >= 0 && !mask[q] && !seen[q] && isBg(q)) { seen[q] = 1; stack.push(q); } }
    if (reg.length > N * 0.0005 && sum / reg.length < 45) for (const p of reg) mask[p] = 1;
  }

  // Drop foreground specks (stray text, dust): parts smaller than 3% of the biggest part.
  const lab = new Int32Array(N); const sizes = [0];
  for (let s = 0; s < N; s++) if (!mask[s] && !lab[s]) {
    const id = sizes.length; let n = 0; lab[s] = id; stack.push(s);
    while (stack.length) { const p = stack.pop()!; n++; for (const q of around(p)) if (q >= 0 && !mask[q] && !lab[q]) { lab[q] = id; stack.push(q); } }
    sizes.push(n);
  }
  const big = Math.max(...sizes);
  if (big < N * 0.01) throw new Error("no item found on the screen");
  for (let p = 0; p < N; p++) if (!mask[p] && sizes[lab[p]] < big * 0.03) mask[p] = 1;

  const nearBg = (p: number, r: number) => { const x = p % W, y = (p / W) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx]) return true; }
    return false; };
  const greenScreen = bg[1] > bg[0] + 30 && bg[1] > bg[2] + 30;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (mask[p]) { data[i + 3] = 0; continue; }
    if (nearBg(p, 2)) {
      data[i + 3] = Math.round(255 * Math.max(0.15, Math.min(1, (dist(p) - 40) / 80)));
      if (greenScreen) data[i + 1] = Math.min(data[i + 1], Math.max(data[i], data[i + 2]) + 6); // green spill
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .resize(720, 720, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

export async function makeCutout(photo: Buffer, mime?: string): Promise<Buffer> {
  return keyOut(await isolate(photo, mime));
}
