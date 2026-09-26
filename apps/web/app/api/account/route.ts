// The poof account (no passwords): a signed httpOnly cookie holds the userId;
// the profile lives in n8n (`poof_users`).
import { currentUserId, newUserId, setSessionCookie } from "@/lib/server/auth";
import { fetchAccount, normalizeAccount, profileFrom } from "@/lib/server/account";
import { json, n8n } from "@/lib/server/n8n";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return json({ account: null });
  const r = await fetchAccount(userId);
  if (r.status === 404 || (r.ok && !r.account)) return json({ account: null });
  if (!r.ok) return json({ error: r.error }, 502);
  return json({ account: r.account });
}

/** Create the account. Idempotent: a valid existing cookie is reused. */
export async function POST(req: Request) {
  const profile = profileFrom(await req.json().catch(() => ({})));
  const existing = await currentUserId();
  if (existing) {
    const r = await fetchAccount(existing);
    if (r.ok && r.account) {
      if (Object.keys(profile).length) await n8n("me", { method: "POST", userId: existing, body: profile });
      return json({ account: { ...r.account, ...profile } });
    }
    if (!r.ok && r.status !== 404) return json({ error: r.error }, 502);
  }
  const userId = existing ?? newUserId();
  const created = await n8n("users", { method: "POST", userId, body: { userId, ...profile } });
  if (!created.ok) return json({ error: created.error ?? "Could not create the account" }, 502);
  await setSessionCookie(userId);
  const data = created.data && typeof created.data === "object" ? created.data : {};
  return json({ account: normalizeAccount(userId, { ...data, ...profile }) }, 201);
}

/** Update profile fields (name, pickup city/address/hours, onboarded). */
export async function PATCH(req: Request) {
  const userId = await currentUserId();
  if (!userId) return json({ error: "No account" }, 401);
  const profile = profileFrom(await req.json().catch(() => ({})));
  const r = await n8n("me", { method: "POST", userId, body: profile });
  if (!r.ok) return json({ error: r.error }, 502);
  const now = await fetchAccount(userId);
  const data = r.data && typeof r.data === "object" ? r.data : {};
  return json({ account: now.account ?? normalizeAccount(userId, { ...data, ...profile }) });
}
