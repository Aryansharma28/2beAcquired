// DELETE /api/connect — the app's "Disconnect" (user cookie).
import { currentUserId } from "@/lib/server/auth";
import { disconnectUser } from "@/lib/server/disconnect";
import { json } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return json({ error: "No account" }, 401);
  const r = await disconnectUser(userId);
  return json(r, r.ok ? 200 : 502);
}
