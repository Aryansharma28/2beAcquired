// Disconnect from the extension ({deviceToken}) or from the app (user cookie).
import { currentUserId, verifyDevice } from "@/lib/server/auth";
import { CORS, preflight, readJson } from "@/lib/server/cors";
import { disconnectUser } from "@/lib/server/disconnect";
import { json } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const body = await readJson(req);
  const userId = verifyDevice(body?.deviceToken) ?? (await currentUserId());
  if (!userId) return json({ error: "Unknown device or account" }, 401, CORS);
  const r = await disconnectUser(userId);
  return json(r, r.ok ? 200 : 502, CORS);
}
