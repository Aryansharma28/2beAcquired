// Photos live in a private Apify key-value store; serve them through the app with the server-side token.
// /api/photo/<key>  ->  https://api.apify.com/v2/key-value-stores/${APIFY_PHOTO_STORE}/records/<key>
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const store = process.env.APIFY_PHOTO_STORE;
  const token = process.env.APIFY_TOKEN;
  if (!store || !token || !/^[\w.-]+$/.test(key)) return new Response("Not found", { status: 404 });
  const res = await fetch(`https://api.apify.com/v2/key-value-stores/${store}/records/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
