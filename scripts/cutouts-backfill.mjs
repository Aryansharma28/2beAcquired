// Give existing items a sticker cutout (new items get one from n8n intake).
//   node scripts/cutouts-backfill.mjs [appUrl]      (default https://poof-lovat.vercel.app)
// Reuses <itemId>-cutout.png when it is already in the photo store, else asks the app's /api/cutout to make it.
// Then saves `cutout` on the item row (only that field; the rest of the item is left as it is).
const { loadEnv, TABLES } = await import(new URL("../n8n/lib.mjs", import.meta.url).href);
const env = loadEnv();
const APP = (process.argv[2] || "https://poof-lovat.vercel.app").split("/").filter((s, i, a) => s || i < a.length - 1).join("/");
const H = { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json" };
const rec = (key) => `https://api.apify.com/v2/key-value-stores/${env.APIFY_PHOTO_STORE}/records/${key}`;

const rows = (await (await fetch(`${env.N8N_BASE_URL}/api/v1/data-tables/${TABLES.items}/rows?limit=250`, { headers: H })).json()).data;
for (const r of rows) {
  const d = JSON.parse(r.data || "{}");
  if (d.cutout) { console.log(`${r.itemId}  has a cutout`); continue; }
  const photo = d.photos?.[0];
  if (!photo) { console.log(`${r.itemId}  no photo`); continue; }
  let cutout = null;
  const head = await fetch(`${rec(`${r.itemId}-cutout.png`)}?token=${env.APIFY_TOKEN}`, { method: "HEAD" });
  if (head.ok) cutout = rec(`${r.itemId}-cutout.png`);
  else {
    const res = await fetch(`${APP}/api/cutout`, { method: "POST", headers: { "Content-Type": "application/json", "X-Poof-Key": env.POOF_APP_KEY }, body: JSON.stringify({ itemId: r.itemId, photo }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.cutout) { console.log(`${r.itemId}  failed: ${res.status} ${j.error ?? ""}`); continue; }
    cutout = j.cutout;
  }
  // Re-read right before writing: the agent may have saved this item meanwhile.
  const filter = encodeURIComponent(JSON.stringify({ type: "and", filters: [{ columnName: "itemId", condition: "eq", value: r.itemId }] }));
  const now = (await (await fetch(`${env.N8N_BASE_URL}/api/v1/data-tables/${TABLES.items}/rows?filter=${filter}`, { headers: H })).json()).data[0];
  const data = JSON.stringify({ ...JSON.parse(now.data), cutout });
  const up = await fetch(`${env.N8N_BASE_URL}/api/v1/data-tables/${TABLES.items}/rows/update`, { method: "PATCH", headers: H, body: JSON.stringify({ filter: { type: "and", filters: [{ columnName: "itemId", condition: "eq", value: r.itemId }] }, data: { data } }) });
  console.log(`${r.itemId}  ${up.ok ? "saved" : "save failed " + up.status + " " + (await up.text()).slice(0, 150)}  ${cutout}`);
}
