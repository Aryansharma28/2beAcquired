// Log in with email: POST {email} sends a 6-digit code; POST {email, code} checks it and signs in.
import { completeLogin } from "@/lib/server/login";
import { json } from "@/lib/server/n8n";
import { sendEmailCode, verifyEmailCode } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) return json({ error: "That doesn't look like an email address." }, 400);

  if (b.code === undefined) {
    const r = await sendEmailCode(email);
    if (!r.ok) return json({ error: r.status === 429 ? "Too many codes asked for. Wait a minute and try again." : r.error }, r.status === 429 ? 429 : 502);
    return json({ ok: true });
  }

  const code = String(b.code).replace(/\D/g, "");
  if (code.length !== 6) return json({ error: "The code has 6 digits." }, 400);
  const user = await verifyEmailCode(email, code);
  if (!user.ok) {
    const wrong = user.status === 400 || user.status === 401 || user.status === 403;
    return json({ error: wrong ? "That code isn't right, or it expired. Check it or send a new one." : user.error }, wrong ? 401 : 502);
  }
  const done = await completeLogin(user.data);
  return done.ok ? json({ ok: true, onboarded: done.onboarded }) : json({ error: done.error }, done.status);
}
