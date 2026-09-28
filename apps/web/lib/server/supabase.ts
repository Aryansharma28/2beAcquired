// Supabase is only the login (Google + 6-digit email code). Server-only, plain fetch against the Auth (GoTrue) and
// REST APIs: the browser never holds a Supabase session. Once Supabase says who someone is, lib/server/login.ts
// links them to a poof account and the usual poof_uid cookie takes over.
import { createHash, randomBytes } from "node:crypto";

export type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string; given_name?: string };
};
type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function env() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anon && service ? { url, anon, service } : null;
}

export const supabaseReady = () => env() !== null;

async function call<T>(path: string, { method = "POST", body, admin }: { method?: string; body?: unknown; admin?: boolean } = {}): Promise<Result<T>> {
  const e = env();
  if (!e) return { ok: false, status: 503, error: "Login is not set up on the server (SUPABASE_URL / keys)." };
  const key = admin ? e.service : e.anon;
  let res: Response;
  try {
    res = await fetch(`${e.url}${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 502, error: "Couldn't reach the login service." };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data as { msg?: string; message?: string; error_description?: string; error?: string; code?: string } | null;
    return { ok: false, status: res.status, error: d?.msg || d?.message || d?.error_description || d?.error || `Login service error (${res.status})` };
  }
  return { ok: true, data: data as T };
}

/** Email a 6-digit code (Supabase "magic link" template, which shows {{ .Token }}). Creates the login if new. */
export const sendEmailCode = (email: string) => call("/auth/v1/otp", { body: { email, create_user: true } });

/** Check the code; on success Supabase returns the session, of which we only keep the user. */
export async function verifyEmailCode(email: string, token: string): Promise<Result<AuthUser>> {
  const r = await call<{ user?: AuthUser }>("/auth/v1/verify", { body: { type: "email", email, token } });
  if (!r.ok) return r;
  return r.data.user?.id ? { ok: true, data: r.data.user } : { ok: false, status: 502, error: "The login service sent no user." };
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

export async function exchangeGoogleCode(code: string, verifier: string): Promise<Result<AuthUser>> {
  const r = await call<{ user?: AuthUser }>("/auth/v1/token?grant_type=pkce", { body: { auth_code: code, code_verifier: verifier } });
  if (!r.ok) return r;
  return r.data.user?.id ? { ok: true, data: r.data.user } : { ok: false, status: 502, error: "The login service sent no user." };
}

// poof_accounts (supabase/migrations): one login ↔ one poof account.
export async function linkedPoofId(authId: string): Promise<Result<string | null>> {
  const r = await call<{ poof_uid: string }[]>(`/rest/v1/poof_accounts?auth_id=eq.${encodeURIComponent(authId)}&select=poof_uid`, { method: "GET", admin: true });
  return r.ok ? { ok: true, data: r.data[0]?.poof_uid ?? null } : r;
}

/** Link; fails with 409 when that poof id already belongs to another login. */
export const linkPoofId = (authId: string, poofUid: string) =>
  call("/rest/v1/poof_accounts", { body: { auth_id: authId, poof_uid: poofUid }, admin: true });
