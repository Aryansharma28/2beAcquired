// Pure logic shared by the popup and the background worker. No chrome.* here, so it
// can be unit-tested with plain node (see scripts/test-lib.mjs).

export const MP_ORIGIN = "https://www.marktplaats.nl";
export const MP_LOGIN_URL = "https://www.marktplaats.nl/account/login.html";
export const MP_IDENTITY_URL = "https://www.marktplaats.nl/identity/v2/api/user";
export const MP_SESSION_COOKIE = "MpSession";

export const REFRESH_PERIOD_MIN = 6 * 60; // chrome.alarms periodic sync
export const DEBOUNCE_MS = 60 * 1000; // wait after a cookie change
export const MIN_GAP_MS = 10 * 60 * 1000; // non-session cookie changes: at most once / 10 min

/** Strip everything but digits and cap at 6. */
export function normalizeCode(input) {
  return String(input ?? "").replace(/\D/g, "").slice(0, 6);
}

/** Exactly six ASCII digits. */
export function isValidCode(code) {
  return typeof code === "string" && /^[0-9]{6}$/.test(code);
}

/** Is this cookie domain marktplaats.nl or a subdomain of it? */
export function isMarktplaatsDomain(domain) {
  const d = String(domain ?? "").toLowerCase().replace(/^\./, "");
  return d === "marktplaats.nl" || d.endsWith(".marktplaats.nl");
}

/** chrome sameSite -> Playwright sameSite. */
export function mapSameSite(s) {
  switch (s) {
    case "strict":
      return "Strict";
    case "no_restriction":
      return "None";
    case "lax":
    case "unspecified":
    default:
      return "Lax";
  }
}

/** One chrome.cookies.Cookie -> Playwright storageState cookie. */
export function toPlaywrightCookie(c) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || "/",
    expires: typeof c.expirationDate === "number" && !c.session ? c.expirationDate : -1,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: mapSameSite(c.sameSite),
  };
}

/** Only marktplaats.nl cookies, mapped. Anything else is dropped defensively. */
export function mapCookies(cookies) {
  return (cookies || []).filter((c) => c && isMarktplaatsDomain(c.domain)).map(toPlaywrightCookie);
}

/**
 * Validate and normalise the poof base URL. https anywhere; http only for localhost
 * (dev). Returns the origin (no trailing slash, no path) or null if not allowed.
 */
export function normalizePoofUrl(input) {
  let u;
  try {
    u = new URL(String(input ?? "").trim());
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol === "https:") return u.origin;
  if (u.protocol === "http:" && localHost) return u.origin;
  return null;
}

/** Host-permission match pattern for an origin, e.g. "https://x.vercel.app/*". */
export function originPattern(origin) {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}

/**
 * Pull {id, name} out of the Marktplaats identity response. The shape is not
 * documented, so accept the common variants. Returns null when there's no id.
 */
export function parseMpUser(json) {
  if (!json || typeof json !== "object") return null;
  const src = json.user && typeof json.user === "object" ? json.user : json;
  const id = src.id ?? src.userId ?? src.user_id ?? src.accountId;
  if (id === undefined || id === null || id === "") return null;
  const first = src.firstName ?? src.firstname;
  const name =
    src.name ?? src.displayName ?? src.nickname ?? src.userName ?? src.username ?? first ?? src.email ?? `User ${id}`;
  return { id: String(id), name: String(name) };
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function relativeTime(then, now = Date.now()) {
  if (!then) return "never";
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

/**
 * After the debounce window: should a cookie change trigger a refresh?
 * Yes if the session cookie changed; otherwise only if the last sync is >= 10 min old.
 */
export function shouldRefreshAfterChange({ sessionChanged, lastSync, now = Date.now() }) {
  if (sessionChanged) return true;
  return !lastSync || now - lastSync >= MIN_GAP_MS;
}

/** Best human message from a poof error response body. */
export function serverMessage(body, status) {
  if (body && typeof body === "object") {
    const m = body.error ?? body.message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  if (status === 404 || status === 410) return "That code has expired or was already used. Get a new one in the poof app.";
  if (status === 429) return "Too many tries. Wait a minute and try again.";
  if (status >= 500) return "poof is having a moment. Try again shortly.";
  return `Something went wrong (${status || "network"}). Try again.`;
}
