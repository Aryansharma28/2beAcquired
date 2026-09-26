// Called by the poof Connector: pairs the code with a user and saves the
// Marktplaats session (Playwright storageState) in the user's Apify KV store.
import { deviceToken } from "@/lib/server/auth";
import { ensureStore, putState, storageState, storeName, toPlaywrightCookies } from "@/lib/server/apify";
import { CORS, preflight, readJson } from "@/lib/server/cors";
import { json, n8n } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ error: "Send JSON" }, 415, CORS);
  const code = String(body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return json({ error: "Enter the 6-digit code from the poof app." }, 400, CORS);
  if (!toPlaywrightCookies(body.cookies).length) {
    return json({ error: "No Marktplaats cookies found. Log in to marktplaats.nl first." }, 400, CORS);
  }

  const claim = await n8n<{ userId?: string }>("pair/claim", { method: "POST", body: { code } });
  const userId = claim.data?.userId;
  if (!claim.ok || !userId) {
    const status = claim.status >= 400 && claim.status < 500 ? claim.status : claim.ok ? 404 : 502;
    const error = claim.ok || status < 500 ? "That code is unknown or expired. Get a new one in the poof app." : claim.error;
    return json({ error }, status, CORS);
  }

  const mpUser = body.mpUser && typeof body.mpUser === "object" ? (body.mpUser as { id?: unknown; name?: unknown }) : {};
  const name = typeof mpUser.name === "string" && mpUser.name.trim() ? mpUser.name.trim().slice(0, 80) : "Marktplaats";
  const store = storeName(userId);
  try {
    const storeId = await ensureStore(store);
    await putState(storeId, storageState(body.cookies, { userAgent: body.userAgent, mpUser: { id: mpUser.id, name } }));
    const done = await n8n("mp-connected", {
      method: "POST",
      userId,
      body: { userId, name, store, storeId, mpUserId: mpUser.id ?? null, extVersion: body.extVersion ?? null },
    });
    if (!done.ok) return json({ error: done.error }, 502, CORS);
  } catch (e) {
    return json({ error: (e as Error).message }, 502, CORS);
  }
  return json({ ok: true, name, deviceToken: deviceToken(userId) }, 200, CORS);
}
