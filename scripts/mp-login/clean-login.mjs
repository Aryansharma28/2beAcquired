// Log in to Marktplaats in a completely normal Chrome: no Playwright, no automation flags, no page control.
// Chrome only gets a local DevTools port so this script can READ the cookie jar (browser-level
// Storage.getCookies, never attaching to a page) once you're logged in. Then it saves the session
// to .mp-session/state.json and uploads it to the Apify KV store `mp-session` (key `state`).
//
//   node scripts/mp-login/clean-login.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = Object.fromEntries(readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const PORT = 9333;
const PROFILE = join(root, ".mp-session", "clean-profile");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devtools() {
  try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; }
}

async function getCookies(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const reply = new Promise((res) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result?.cookies ?? []); }; });
  ws.send(JSON.stringify({ id: 1, method: "Storage.getCookies" }));
  const cookies = await reply;
  ws.close();
  return cookies;
}

const toPlaywright = (c) => ({
  name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires ?? -1,
  httpOnly: !!c.httpOnly, secure: !!c.secure, sameSite: c.sameSite ?? "Lax",
});

async function valid(cookies, ua) {
  const res = await fetch("https://www.marktplaats.nl/header/messages/message-count", {
    headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "), Accept: "application/json", "X-Requested-With": "XMLHttpRequest", "User-Agent": ua },
  });
  return res.status === 200 ? await res.text() : null;
}

if (!CHROME) throw new Error("Chrome not found");
mkdirSync(PROFILE, { recursive: true });
if (!(await devtools())) {
  spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check",
    "https://www.marktplaats.nl/"], { detached: true, stdio: "ignore" }).unref();
  console.log("Opened a normal Chrome window. Log in to Marktplaats there like you always do (SMS code etc.).");
}
console.log("Waiting for the login (checking every 5 s, up to 30 min)…");

for (let i = 0; i < 360; i++) {
  await sleep(5000);
  const v = await devtools();
  if (!v) continue;
  const cookies = (await getCookies(v.webSocketDebuggerUrl)).filter((c) => c.domain.includes("marktplaats.nl"));
  if (!cookies.length) continue;
  const ua = v["User-Agent"];
  const count = await valid(cookies, ua).catch(() => null);
  if (!count) continue;

  const state = { cookies: cookies.map(toPlaywright), origins: [], meta: { userAgent: ua, savedAt: new Date().toISOString(), source: "clean-login" } };
  writeFileSync(join(root, ".mp-session", "state.json"), JSON.stringify(state, null, 2));
  console.log(`Logged in. Session valid (message-count: ${count}). ${cookies.length} cookies saved.`);
  if (env.APIFY_TOKEN) {
    const h = { Authorization: `Bearer ${env.APIFY_TOKEN}`, "Content-Type": "application/json" };
    const store = (await (await fetch("https://api.apify.com/v2/key-value-stores?name=mp-session", { method: "POST", headers: h })).json()).data.id;
    const put = await fetch(`https://api.apify.com/v2/key-value-stores/${store}/records/state`, { method: "PUT", headers: h, body: JSON.stringify(state) });
    console.log(put.ok ? `Uploaded to Apify store mp-session (${store}).` : `Upload failed: ${put.status}`);
  }
  console.log("You can keep using that Chrome window; the session stays shared.");
  process.exit(0);
}
console.log("Timed out waiting for a valid login.");
process.exit(1);
