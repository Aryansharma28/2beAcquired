import { MOCK } from "./api";
import * as mock from "./mock";

/** Where to go once signed in: straight home, or the pickup details first. */
export type Landing = "home" | "welcome";

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Full-page trip: Google's account picker, back via /api/auth/google/callback → /login?done=… */
export function loginWithGoogle() {
  location.href = MOCK ? "/login?done=welcome" : "/api/auth/google";
}

// The browser asks Supabase for the code and checks it itself (Supabase rate-limits per person this way). The anon key
// is public by design; it can't read any data (row level security) and only the server's check of the token counts.
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function supabase<T>(path: string, body: unknown): Promise<T> {
  if (!SB_URL || !SB_KEY) throw new Error("Login isn't set up yet. Try again later.");
  let res: Response;
  try {
    res = await fetch(`${SB_URL}${path}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("Couldn't reach the login service. Check your connection.");
  }
  const data = (await res.json().catch(() => null)) as (T & { error_code?: string; msg?: string }) | null;
  if (res.status === 429) throw new Error("Too many tries. Wait a minute and try again.");
  if (!res.ok) {
    if (path.startsWith("/auth/v1/verify") && (res.status === 400 || res.status === 401 || res.status === 403)) throw new Error(WRONG_CODE);
    throw new Error(data?.msg ?? `Login service error (${res.status})`);
  }
  return data as T;
}

const WRONG_CODE = "That code isn't right, or it expired. Check it or send a new one.";

export async function sendEmailCode(email: string): Promise<void> {
  if (MOCK) return void (await new Promise((r) => setTimeout(r, 500)));
  await supabase("/auth/v1/otp", { email, create_user: true });
}

/** Demo mode takes any 6 digits except 000000 (to show the error state). */
export async function verifyEmailCode(email: string, code: string): Promise<Landing> {
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    if (code === "000000") throw new Error(WRONG_CODE);
    const a = (await mock.getAccount()) ?? (await mock.createAccount({}));
    return a.onboarded ? "home" : "welcome";
  }
  const { access_token } = await supabase<{ access_token: string }>("/auth/v1/verify", { type: "email", email, token: code });
  const r = await post<{ onboarded: boolean }>("/api/auth/session", { accessToken: access_token });
  return r.onboarded ? "home" : "welcome";
}

export async function logout(): Promise<void> {
  if (MOCK) { try { localStorage.removeItem("tba-mock-account"); } catch { /* ignore */ } return; }
  await post("/api/auth/logout");
}
