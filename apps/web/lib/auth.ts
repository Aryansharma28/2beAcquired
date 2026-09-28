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

export async function sendEmailCode(email: string): Promise<void> {
  if (MOCK) return void (await new Promise((r) => setTimeout(r, 500)));
  await post("/api/auth/email", { email });
}

/** Demo mode takes any 6 digits except 000000 (to show the error state). */
export async function verifyEmailCode(email: string, code: string): Promise<Landing> {
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 500));
    if (code === "000000") throw new Error("That code isn't right, or it expired. Check it or send a new one.");
    const a = (await mock.getAccount()) ?? (await mock.createAccount({}));
    return a.onboarded ? "home" : "welcome";
  }
  const r = await post<{ onboarded: boolean }>("/api/auth/email", { email, code });
  return r.onboarded ? "home" : "welcome";
}

export async function logout(): Promise<void> {
  if (MOCK) { try { localStorage.removeItem("tba-mock-account"); } catch { /* ignore */ } return; }
  await post("/api/auth/logout");
}
