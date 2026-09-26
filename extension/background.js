// poof Connector background worker (MV3 service worker; also runs as a Firefox
// background script). Owns every network call so a claim or sync finishes even if
// the popup closes. Never logs cookie values.
import { POOF_URL } from "./config.js";
import {
  DEBOUNCE_MS,
  MP_IDENTITY_URL,
  MP_SESSION_COOKIE,
  REFRESH_PERIOD_MIN,
  isMarktplaatsDomain,
  isValidCode,
  mapCookies,
  normalizePoofUrl,
  parseMpUser,
  serverMessage,
  shouldRefreshAfterChange,
} from "./lib.js";

const ALARM_PERIODIC = "poof-refresh";
const ALARM_DEBOUNCE = "poof-cookie-debounce";
const CONNECTION_KEYS = ["deviceToken", "name", "mpUserId", "lastSync", "needsRelogin", "sessionChanged"];

// ---------- storage helpers ----------

const store = chrome.storage.local;

async function getPoofUrl() {
  const { poofUrl } = await store.get("poofUrl");
  return normalizePoofUrl(poofUrl) || normalizePoofUrl(POOF_URL);
}

async function setBadge(on) {
  await chrome.action.setBadgeText({ text: on ? "!" : "" });
  if (on) await chrome.action.setBadgeBackgroundColor({ color: "#ff4f5e" });
}

// ---------- Marktplaats ----------

/** { loggedIn: true, user } | { loggedIn: false } | { loggedIn: null, error } (unknown). */
async function checkMarktplaats() {
  try {
    const res = await fetch(MP_IDENTITY_URL, {
      credentials: "include",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { loggedIn: false };
    if (!res.ok) return { loggedIn: null, error: `Marktplaats answered ${res.status}` };
    const user = parseMpUser(await res.json().catch(() => null));
    return user ? { loggedIn: true, user } : { loggedIn: false };
  } catch {
    return { loggedIn: null, error: "Couldn't reach Marktplaats" };
  }
}

async function readCookies() {
  // domain filter matches marktplaats.nl and its subdomains; mapCookies re-checks.
  return mapCookies(await chrome.cookies.getAll({ domain: "marktplaats.nl" }));
}

// ---------- poof API ----------

async function postPoof(path, body) {
  const base = await getPoofUrl();
  if (!base) return { ok: false, status: 0, error: "The poof address in Advanced isn't valid." };
  let res;
  try {
    res = await fetch(base + path, {
      method: "POST",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: `Couldn't reach poof at ${base}. Check your connection and try again.` };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.ok === false) {
    return { ok: false, status: res.status, error: serverMessage(json, res.status) };
  }
  return { ok: true, status: res.status, data: json };
}

// ---------- actions ----------

async function status() {
  const s = await store.get([...CONNECTION_KEYS, "poofUrl"]);
  const mp = await checkMarktplaats();
  const connected = !!s.deviceToken;
  let needsRelogin = !!s.needsRelogin;
  let mismatch = false;
  if (connected && mp.loggedIn === false) needsRelogin = true;
  if (connected && mp.loggedIn === true) {
    needsRelogin = false;
    mismatch = !!s.mpUserId && mp.user.id !== s.mpUserId;
  }
  if (connected) {
    await store.set({ needsRelogin });
    await setBadge(needsRelogin || mismatch);
  }
  return {
    poofUrl: await getPoofUrl(),
    poofUrlDefault: normalizePoofUrl(POOF_URL),
    customPoofUrl: s.poofUrl || null,
    connected,
    name: s.name || null,
    lastSync: s.lastSync || null,
    needsRelogin,
    mismatch,
    mp,
  };
}

async function claim(code) {
  if (!isValidCode(code)) return { ok: false, error: "Enter the 6-digit code from the poof app." };
  const mp = await checkMarktplaats();
  if (mp.loggedIn !== true) {
    return { ok: false, error: mp.error || "Log in to Marktplaats first, then try again." };
  }
  const cookies = await readCookies();
  const r = await postPoof("/api/connect/claim", {
    code,
    cookies,
    userAgent: navigator.userAgent,
    mpUser: { id: mp.user.id, name: mp.user.name },
    extVersion: chrome.runtime.getManifest().version,
  });
  if (!r.ok) return r;
  if (typeof r.data.deviceToken !== "string" || !r.data.deviceToken) {
    return { ok: false, error: "poof didn't send back a device token. Try again." };
  }
  const now = Date.now();
  await store.set({
    deviceToken: r.data.deviceToken,
    name: r.data.name || mp.user.name,
    mpUserId: mp.user.id,
    lastSync: now,
    needsRelogin: false,
    sessionChanged: false,
  });
  await ensurePeriodicAlarm();
  await setBadge(false);
  return { ok: true, name: r.data.name || mp.user.name, lastSync: now };
}

/** Push fresh cookies to poof. `reason` is only for the (value-free) console line. */
async function refresh(reason) {
  const s = await store.get(["deviceToken", "mpUserId"]);
  if (!s.deviceToken) return { ok: false, error: "Not connected." };
  const mp = await checkMarktplaats();
  if (mp.loggedIn === false) {
    await store.set({ needsRelogin: true });
    await setBadge(true);
    return { ok: false, needsRelogin: true, error: "Log in to Marktplaats again to keep poof selling." };
  }
  if (mp.loggedIn !== true) return { ok: false, error: mp.error };
  if (s.mpUserId && mp.user.id !== s.mpUserId) {
    // A different Marktplaats account is logged in: never hand its session to poof.
    await setBadge(true);
    return { ok: false, mismatch: true, error: "A different Marktplaats account is logged in. Log back in as the connected account." };
  }
  const cookies = await readCookies();
  const r = await postPoof("/api/connect/refresh", {
    deviceToken: s.deviceToken,
    cookies,
    userAgent: navigator.userAgent,
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403 || r.status === 410) {
      // poof no longer knows this device (disconnected from the app): forget it.
      await clearConnection();
      return { ok: false, disconnected: true, error: "poof disconnected this browser. Connect again with a new code." };
    }
    return r;
  }
  const now = Date.now();
  await store.set({ lastSync: now, needsRelogin: false, sessionChanged: false });
  await setBadge(false);
  console.info(`[poof] session synced (${reason}), ${cookies.length} cookies`);
  return { ok: true, lastSync: now };
}

async function clearConnection() {
  await store.remove(CONNECTION_KEYS);
  await chrome.alarms.clear(ALARM_PERIODIC);
  await chrome.alarms.clear(ALARM_DEBOUNCE);
  await setBadge(false);
}

async function disconnect() {
  const { deviceToken } = await store.get("deviceToken");
  let warning = null;
  if (deviceToken) {
    const r = await postPoof("/api/connect/disconnect", { deviceToken });
    if (!r.ok && r.status !== 401 && r.status !== 404 && r.status !== 410) {
      warning = "Disconnected here, but poof couldn't be reached. Also disconnect in the poof app.";
    }
  }
  await clearConnection();
  return { ok: true, warning };
}

async function setPoofUrl(url) {
  if (url === null || url === "") {
    await store.remove("poofUrl");
    return { ok: true, poofUrl: await getPoofUrl() };
  }
  const origin = normalizePoofUrl(url);
  if (!origin) return { ok: false, error: "Use an https:// address (http://localhost is fine for testing)." };
  await store.set({ poofUrl: origin });
  return { ok: true, poofUrl: origin };
}

async function ensurePeriodicAlarm() {
  const existing = await chrome.alarms.get(ALARM_PERIODIC);
  if (!existing) {
    await chrome.alarms.create(ALARM_PERIODIC, { periodInMinutes: REFRESH_PERIOD_MIN, delayInMinutes: REFRESH_PERIOD_MIN });
  }
}

// ---------- events ----------

chrome.runtime.onInstalled.addListener(async () => {
  const { deviceToken } = await store.get("deviceToken");
  if (deviceToken) await ensurePeriodicAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  const { deviceToken } = await store.get("deviceToken");
  if (deviceToken) {
    await ensurePeriodicAlarm();
    await status(); // updates the badge if Marktplaats logged out meanwhile
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PERIODIC) {
    await refresh("periodic");
  } else if (alarm.name === ALARM_DEBOUNCE) {
    const s = await store.get(["deviceToken", "sessionChanged", "lastSync"]);
    if (!s.deviceToken) return;
    if (shouldRefreshAfterChange({ sessionChanged: !!s.sessionChanged, lastSync: s.lastSync })) {
      await refresh(s.sessionChanged ? "session cookie changed" : "cookies changed");
    }
  }
});

chrome.cookies.onChanged.addListener(async ({ cookie }) => {
  if (!isMarktplaatsDomain(cookie.domain)) return;
  const { deviceToken } = await store.get("deviceToken");
  if (!deviceToken) return;
  // A removed MpSession may be a logout or just a rotation (remove + set); the
  // debounced refresh checks the identity endpoint and decides.
  if (cookie.name === MP_SESSION_COOKIE) await store.set({ sessionChanged: true });
  // Debounce: every change pushes the check 60 s out (alarms survive worker shutdown).
  await chrome.alarms.create(ALARM_DEBOUNCE, { when: Date.now() + DEBOUNCE_MS });
});

const handlers = {
  status: () => status(),
  claim: (m) => claim(String(m.code || "")),
  sync: () => refresh("manual"),
  disconnect: () => disconnect(),
  setPoofUrl: (m) => setPoofUrl(m.url),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const h = msg && handlers[msg.type];
  if (!h) return false;
  Promise.resolve(h(msg))
    .catch((e) => ({ ok: false, error: e?.message || "Unexpected error" }))
    .then(sendResponse);
  return true; // async response
});
