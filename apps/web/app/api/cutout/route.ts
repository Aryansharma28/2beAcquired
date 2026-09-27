import { makeCutout } from "@/lib/cutout";

// POST /api/cutout { itemId, photo } (X-Poof-Key): make the item's sticker cutout from its cover photo and store it
// next to the photos as <itemId>-cutout.png. Called by n8n intake after pricing (so it never slows "Is this it?").
// Answers { cutout: <record URL> }; the n8n flow saves it on the item.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RECORD = /^https:\/\/api\.apify\.com\/v2\/key-value-stores\/[^/]+\/records\/([\w.-]+)$/;

export async function POST(req: Request) {
  // Development only (mock mode, local screenshots): { image: dataURL } → the PNG itself, nothing stored. Never in
  // production: it would be an open door to a paid image model.
  if (process.env.NODE_ENV === "development" && req.headers.get("content-type")?.includes("json")) {
    const peek = (await req.clone().json().catch(() => ({}))) as { image?: string };
    if (peek.image?.startsWith("data:")) {
      const [head, b64] = peek.image.split(",");
      try {
        const png = await makeCutout(Buffer.from(b64, "base64"), head.slice(5, head.indexOf(";")) || "image/jpeg");
        return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 502 });
      }
    }
  }
  const appKey = process.env.POOF_APP_KEY;
  if (!appKey || req.headers.get("x-poof-key") !== appKey) return Response.json({ error: "unauthorized" }, { status: 401 });
  const store = process.env.APIFY_PHOTO_STORE;
  const token = process.env.APIFY_TOKEN;
  if (!store || !token) return Response.json({ error: "photo store not configured" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { itemId?: string; photo?: string };
  const itemId = String(body.itemId ?? "");
  const photoKey = String(body.photo ?? "").match(RECORD)?.[1] ?? String(body.photo ?? "");
  if (!/^itm_\w+$/.test(itemId) || !/^[\w.-]+$/.test(photoKey)) return Response.json({ error: "itemId and photo are required" }, { status: 400 });

  const rec = (key: string) => `https://api.apify.com/v2/key-value-stores/${store}/records/${key}`;
  const photo = await fetch(rec(photoKey), { headers: { Authorization: `Bearer ${token}` } });
  if (!photo.ok) return Response.json({ error: `photo not found: ${photoKey}` }, { status: 404 });

  const t0 = Date.now();
  let png: Buffer;
  try {
    png = await makeCutout(Buffer.from(await photo.arrayBuffer()), photo.headers.get("content-type") ?? "image/jpeg");
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  const key = `${itemId}-cutout.png`;
  const put = await fetch(rec(key), { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png" }, body: new Uint8Array(png) });
  if (!put.ok) return Response.json({ error: `store failed: ${put.status}` }, { status: 502 });
  return Response.json({ cutout: rec(key), ms: Date.now() - t0, bytes: png.length });
}
