// A 6-digit pairing code (valid ~15 min) the user types into the poof Connector.
import { currentUserId } from "@/lib/server/auth";
import { json, n8n } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export async function POST() {
  const userId = await currentUserId();
  if (!userId) return json({ error: "No account" }, 401);
  const r = await n8n<{ code?: string | number; expiresAt?: string }>("pair/new", { method: "POST", userId, body: { userId } });
  const code = r.data?.code != null ? String(r.data.code).padStart(6, "0") : null;
  if (!r.ok || !code) return json({ error: r.error ?? "No code returned" }, 502);
  return json({ code, expiresAt: r.data?.expiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString() });
}
