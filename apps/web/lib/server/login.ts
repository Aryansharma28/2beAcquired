// After Supabase has confirmed who someone is: find (or make) their poof account and set the poof_uid cookie.
import { currentUserId, newUserId, setSessionCookie } from "./auth";
import { fetchAccount } from "./account";
import { n8n } from "./n8n";
import { linkPoofId, linkedPoofId, type AuthUser } from "./supabase";

type Done = { ok: true; onboarded: boolean } | { ok: false; status: number; error: string };

export async function completeLogin(user: AuthUser): Promise<Done> {
  const known = await linkedPoofId(user.id);
  if (!known.ok) return known;
  let userId = known.data;

  if (!userId) {
    // First login. A poof account already on this device (made before logins existed) becomes theirs, unless another
    // login owns it already; otherwise a fresh one.
    for (const candidate of [await currentUserId(), newUserId()]) {
      if (!candidate) continue;
      const linked = await linkPoofId(user.id, candidate);
      if (linked.ok) { userId = candidate; break; }
      if (linked.status !== 409) return linked;
      const raced = await linkedPoofId(user.id); // same login finishing twice at once
      if (raced.ok && raced.data) { userId = raced.data; break; }
    }
    if (!userId) return { ok: false, status: 409, error: "Couldn't set up your account. Try again." };
  }

  // Idempotent: makes the n8n profile row if it isn't there yet, with their Google name as a head start.
  const name = (user.user_metadata?.full_name || user.user_metadata?.name || "").trim().slice(0, 60);
  const created = await n8n("users", { method: "POST", userId, body: { userId, ...(name ? { name } : {}) } });
  if (!created.ok) return { ok: false, status: 502, error: created.error ?? "Couldn't load your account." };

  await setSessionCookie(userId);
  const account = await fetchAccount(userId);
  return { ok: true, onboarded: !!account.account?.onboarded };
}
