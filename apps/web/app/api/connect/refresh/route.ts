// Called by the poof Connector (every 6 h and on cookie change) to keep the session fresh.
import { verifyDevice } from "@/lib/server/auth";
import { ensureStore, putState, storageState, storeName, toPlaywrightCookies } from "@/lib/server/apify";
import { CORS, preflight, readJson } from "@/lib/server/cors";
import { json } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return json({ error: "Send JSON" }, 415, CORS);
  const userId = verifyDevice(body.deviceToken);
  if (!userId) return json({ error: "Unknown device. Connect again with a new code." }, 401, CORS);
  if (!toPlaywrightCookies(body.cookies).length) return json({ error: "No Marktplaats cookies" }, 400, CORS);
  try {
    const storeId = await ensureStore(storeName(userId));
    await putState(storeId, storageState(body.cookies, { userAgent: body.userAgent, mpUser: body.mpUser }));
  } catch (e) {
    return json({ error: (e as Error).message }, 502, CORS);
  }
  return json({ ok: true, savedAt: new Date().toISOString() }, 200, CORS);
}
