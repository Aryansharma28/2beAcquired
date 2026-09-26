// Owner shortcut for the poof Connector: log in to Marktplaats in a completely normal Chrome window (no automation,
// only a local DevTools port used to READ cookies afterwards), then link that session to a poof account through the
// live app's claim endpoint, exactly like the extension does.
//
//   node scripts/mp-login/link-to-poof.mjs usr_xxxxxxxx [https://poof-lovat.vercel.app]
//   node scripts/mp-login/link-to-poof.mjs usr_xxxxxxxx --from-state   # link .mp-session/state.json (mp-login --cloak) instead
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = Object.fromEntries(readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
const FROM_STATE = process.argv.includes("--from-state");
const [userId, POOF = "https://poof-lovat.vercel.app"] = process.argv.slice(2).filter((a) => a !== "--from-state");
if (!/^usr_[a-z0-9]+$/.test(userId || "")) { console.error("Usage: node link-to-poof.mjs usr_xxxx [poofUrl]"); process.exit(1); }

const PORT = 9333;
const PROFILE = join(root, ".mp-session", "clean-profile");
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const devtools = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { return null; } };

async function cookiesOf(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const out = new Promise((res) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result?.cookies ?? []); }; });
  ws.send(JSON.stringify({ id: 1, method: "Storage.getCookies" }));
  const all = await out; ws.close();
  return all.filter((c) => c.domain.includes("marktplaats.nl"));
}
const toPlaywright = (c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires ?? -1,
  httpOnly: !!c.httpOnly, secure: !!c.secure, sameSite: ({ Strict: "Strict", Lax: "Lax", None: "None" })[c.sameSite] ?? "Lax" });

async function whoAmI(cookies, ua) {
  const res = await fetch("https://www.marktplaats.nl/identity/v2/api/user", { headers: {
    Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "), Accept: "application/json", "User-Agent": ua,
    "X-Requested-With": "XMLHttpRequest", Referer: "https://www.marktplaats.nl/" } });
  if (res.status !== 200) return null;
  const j = await res.json().catch(() => ({}));
  const u = j.user ?? j.data ?? j;
  return { id: String(u.id ?? u.userId ?? ""), name: u.name ?? u.displayName ?? u.firstName ?? "Marktplaats" };
}

async function link(cookies, ua, mpUser) {
  console.log(`Logged in to Marktplaats as ${mpUser.name}. Linking to poof account ${userId}…`);

  // 1) pairing code for this poof account (server-to-server, same as the app's "Connect Marktplaats" screen)
  const pair = await (await fetch(`${env.N8N_BASE_URL}/webhook/tba/pair/new`, { method: "POST",
    headers: { "X-Poof-Key": env.POOF_APP_KEY, "X-Poof-User": userId } })).json();
  // 2) claim it through the live app exactly like the Connector extension does
  const res = await fetch(`${POOF}/api/connect/claim`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: pair.code, cookies: cookies.map(toPlaywright), userAgent: ua, mpUser, extVersion: "owner-link" }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) { console.error("Linking failed:", res.status, out.error ?? out); process.exit(1); }
  console.log(`Connected: poof account ${userId} now sells as "${out.name}" on Marktplaats. Keep this Chrome profile; don't log out.`);
}

if (FROM_STATE) {
  const state = JSON.parse(readFileSync(join(root, ".mp-session", "state.json"), "utf8"));
  const cookies = state.cookies.filter((c) => c.domain.includes("marktplaats.nl"));
  const ua = state.meta?.userAgent ?? "Mozilla/5.0";
  const mpUser = await whoAmI(cookies, ua);
  if (!mpUser) { console.error("The saved session is not logged in; run: npx tsx scripts/mp-login/index.ts --cloak"); process.exit(1); }
  await link(cookies, ua, mpUser);
  process.exit(0);
}

if (!CHROME) throw new Error("Chrome not found");
mkdirSync(PROFILE, { recursive: true });
if (!(await devtools())) {
  spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check",
    "https://www.marktplaats.nl/identity/v2/login"], { detached: true, stdio: "ignore" }).unref();
}
console.log("A normal Chrome window is open. Log in to Marktplaats there (password + SMS code). Waiting up to 2 hours…");

for (let i = 0; i < 1440; i++) {
  await sleep(5000);
  const v = await devtools();
  if (!v) continue;
  const cookies = await cookiesOf(v.webSocketDebuggerUrl).catch(() => []);
  if (!cookies.some((c) => c.name === "MpSession")) continue;
  const mpUser = await whoAmI(cookies, v["User-Agent"]).catch(() => null);
  if (!mpUser) continue;
  await link(cookies, v["User-Agent"], mpUser);
  process.exit(0);
}
console.log("Timed out waiting for a Marktplaats login.");
process.exit(1);
