// Email login, last step: the browser checked the 6-digit code with Supabase and hands us the access token. We ask
// Supabase whose it is (never trusting the browser), sign them in to poof, then end the Supabase session.
import { completeLogin, sameOrigin } from "@/lib/server/login";
import { json } from "@/lib/server/n8n";
import { endSupabaseSession, userFromToken } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Forbidden" }, 403);
  const b = (await req.json().catch(() => ({}))) as { accessToken?: unknown };
  const token = typeof b.accessToken === "string" ? b.accessToken : "";
  if (!token || token.length > 4096) return json({ error: "Not a valid login." }, 401);

  const user = await userFromToken(token);
  if (!user.ok) return json({ error: user.status === 401 || user.status === 403 ? "Not a valid login." : user.error }, user.status === 401 || user.status === 403 ? 401 : 502);
  const done = await completeLogin(user.data);
  await endSupabaseSession(token);
  return done.ok ? json({ ok: true, onboarded: done.onboarded }) : json({ error: done.error }, done.status);
}
