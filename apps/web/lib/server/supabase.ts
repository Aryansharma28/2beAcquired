// Supabase is only the login (Google + 6-digit email code). The browser asks Supabase for the email code and checks it
// itself (so Supabase's per-IP limits apply to each person, not to our server); the server never trusts the browser's
// word: it checks the resulting access token with Supabase, links the login to a poof account (lib/server/login.ts)
// and sets the usual poof_uid cookie. Then the Supabase session is thrown away. Plain fetch, no SDK.
import { createHash, randomBytes } from "node:crypto";

export type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
};
type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anon && service ? { url, anon, service } : null;
}

async function call<T>(path: string, { method = "POST", body, admin, bearer }: { method?: string; body?: unknown; admin?: boolean; bearer?: string } = {}): Promise<Result<T>> {
  const e = env();
  if (!e) return { ok: false, status: 503, error: "Login is not set up on the server (Supabase URL / keys)." };
  const key = admin ? e.service : e.anon;
  let res: Response;
  try {
    res = await fetch(`${e.url}${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${bearer ?? key}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, error: "Couldn't reach the login service." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data as { msg?: string; message?: string; error_description?: string; error?: string } | null;
    return { ok: false, status: res.status, error: d?.msg || d?.message || d?.error_description || d?.error || `Login service error (${res.status})` };
  }
  return { ok: true, data: data as T };
}

/** Who this Supabase access token belongs to, according to Supabase itself (checks signature, expiry, revocation). */
export async function userFromToken(accessToken: string): Promise<Result<AuthUser>> {
  const r = await call<AuthUser>("/auth/v1/user", { method: "GET", bearer: accessToken });
  if (!r.ok) return r;
  return r.data?.id ? r : { ok: false, status: 401, error: "Not a valid login." };
}

/** We only needed the Supabase session to learn who it is: end it so no Supabase token outlives the login. */
export async function endSupabaseSession(accessToken: string) {
  await call("/auth/v1/logout?scope=local", { bearer: accessToken });
}

export const PKCE_COOKIE = "poof_pkce";

/** PKCE pair for the Google redirect: the verifier stays in an httpOnly cookie, the challenge goes to Supabase. */
export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function googleAuthorizeUrl(redirectTo: string, challenge: string) {
  const e = env();
  if (!e) return null;
  const q = new URLSearchParams({ provider: "google", redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: "s256" });
  return `${e.url}/auth/v1/authorize?${q}`;
}

export async function exchangeGoogleCode(code: string, verifier: string): Promise<Result<{ user: AuthUser; accessToken: string }>> {
  const r = await call<{ user?: AuthUser; access_token?: string }>("/auth/v1/token?grant_type=pkce", { body: { auth_code: code, code_verifier: verifier } });
  if (!r.ok) return r;
  return r.data.user?.id && r.data.access_token
    ? { ok: true, data: { user: r.data.user, accessToken: r.data.access_token } }
    : { ok: false, status: 502, error: "The login service sent no user." };
}

// poof_accounts (supabase/migrations): one login ↔ one poof account.
export async function linkedPoofId(authId: string): Promise<Result<string | null>> {
  const r = await call<{ poof_uid: string }[]>(`/rest/v1/poof_accounts?auth_id=eq.${encodeURIComponent(authId)}&select=poof_uid`, { method: "GET", admin: true });
  return r.ok ? { ok: true, data: r.data[0]?.poof_uid ?? null } : r;
}

/** Link; fails with 409 when that poof id already belongs to another login. */
export const linkPoofId = (authId: string, poofUid: string) =>
  call("/rest/v1/poof_accounts", { body: { auth_id: authId, poof_uid: poofUid }, admin: true });
