// Per-user Marktplaats session in an Apify key-value store `mp-session-<userId>`, key `state`.
const API = "https://api.apify.com/v2";

function token() {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is not set on the server.");
  return t;
}

export const storeName = (userId: string) => `mp-session-${userId}`;

/** Get-or-create the named store; returns its id. */
export async function ensureStore(name: string): Promise<string> {
  const res = await fetch(`${API}/key-value-stores?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
  if (!res.ok || !body?.data?.id) throw new Error(`Apify store ${name}: ${res.status}`);
  return body.data.id;
}

export async function putState(storeId: string, state: unknown) {
  const res = await fetch(`${API}/key-value-stores/${storeId}/records/state`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(state),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Apify write failed: ${res.status}`);
}

export async function deleteState(storeId: string) {
  const res = await fetch(`${API}/key-value-stores/${storeId}/records/state`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) throw new Error(`Apify delete failed: ${res.status}`);
}

/** chrome.cookies.Cookie (from the extension) → Playwright storageState cookie. */
type ChromeCookie = {
  name?: string; value?: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean;
  sameSite?: string; expirationDate?: number; expires?: number; session?: boolean;
};
export function toPlaywrightCookies(input: unknown) {
  if (!Array.isArray(input)) return [];
  return (input as ChromeCookie[])
    .filter((c) => c && typeof c.name === "string" && typeof c.value === "string" && typeof c.domain === "string")
    .filter((c) => /(^|\.)marktplaats\.nl$/i.test(c.domain!.replace(/^\./, "")) || /marktplaats\.nl$/i.test(c.domain!))
    .map((c) => {
      const ss = (c.sameSite ?? "").toLowerCase();
      return {
        name: c.name!,
        value: c.value!,
        domain: c.domain!,
        path: c.path || "/",
        expires: c.session ? -1 : Number(c.expirationDate ?? c.expires ?? -1),
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: ss === "strict" ? "Strict" : ss === "lax" ? "Lax" : ss === "no_restriction" || ss === "none" ? "None" : "Lax",
      };
    });
}

export function storageState(cookies: unknown, meta: { userAgent?: unknown; mpUser?: unknown }) {
  return {
    cookies: toPlaywrightCookies(cookies),
    origins: [],
    meta: {
      userAgent: typeof meta.userAgent === "string" ? meta.userAgent.slice(0, 500) : undefined,
      savedAt: new Date().toISOString(),
      source: "extension",
      mpUser: meta.mpUser && typeof meta.mpUser === "object" ? meta.mpUser : undefined,
    },
  };
}
