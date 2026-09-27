// Local runner: runs this actor on the owner's laptop instead of Apify, for the Marktplaats-session actions.
// Posts made from the cloud server get hidden by Marktplaats within seconds; the same code from a normal
// laptop + home connection stays online. n8n calls this through a tunnel (scripts/local/start.mjs).
//
//   POST /run?timeout=280   X-Runner-Key: <RUNNER_KEY>   body: actor input
//   -> answers like Apify's run-sync-get-dataset-items (a JSON array of the dataset items).
//   GET /unread             X-Runner-Key: <RUNNER_KEY>
//   -> { unread: <Marktplaats unread-message count> | null }; n8n polls this every 15 s (n8n/src/31-chat-check.mjs).
//
// Headers are sent right away and a space every 10 s, so tunnels with a first-byte timeout (Cloudflare: 100 s)
// don't cut long runs. Jobs run one at a time. The session store is pulled from Apify before a run and pushed
// back after, so Apify stays the single source of truth for the login.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
const PORT = Number(process.env.RUNNER_PORT || 8787);
const KEY = process.env.RUNNER_KEY;
const TOKEN = process.env.APIFY_TOKEN;
if (!KEY || KEY.length < 16) throw new Error("Set RUNNER_KEY (16+ chars) in .env");
if (!TOKEN) throw new Error("Set APIFY_TOKEN in .env");
const API = "https://api.apify.com/v2";
const apifyHeaders = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function storeId(name) {
  const r = await fetch(`${API}/key-value-stores?name=${encodeURIComponent(name)}`, { method: "POST", headers: apifyHeaders });
  return (await r.json()).data.id;
}
async function pullSession(name, dir) {
  const r = await fetch(`${API}/key-value-stores/${await storeId(name)}/records/state`, { headers: apifyHeaders });
  if (!r.ok) return false;
  mkdirSync(join(dir, "key_value_stores", name), { recursive: true });
  writeFileSync(join(dir, "key_value_stores", name, "state.json"), await r.text());
  return true;
}
async function pushSession(name, dir) {
  const file = join(dir, "key_value_stores", name, "state.json");
  if (!existsSync(file)) return;
  await fetch(`${API}/key-value-stores/${await storeId(name)}/records/state`, { method: "PUT", headers: apifyHeaders, body: readFileSync(file) });
}

function runActor(input, dir, timeoutSec) {
  mkdirSync(join(dir, "key_value_stores", "default"), { recursive: true });
  writeFileSync(join(dir, "key_value_stores", "default", "INPUT.json"), JSON.stringify(input));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, "dist", "main.js")], {
      cwd: here,
      env: { ...process.env, APIFY_LOCAL_STORAGE_DIR: dir, CRAWLEE_STORAGE_DIR: dir, APIFY_TOKEN: TOKEN },
      stdio: ["ignore", "inherit", "inherit"],
    });
    const timer = setTimeout(() => child.kill(), timeoutSec * 1000);
    child.on("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
}

function readResult(dir) {
  const ds = join(dir, "datasets", "default");
  const items = existsSync(ds)
    ? readdirSync(ds).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(ds, f), "utf8")))
    : [];
  const outFile = join(dir, "key_value_stores", "default", "OUTPUT.json");
  const output = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null;
  return { items, output };
}

// Marktplaats has no push for sellers. Its unread-message counter (the bell on the site) is one small request; we make it
// from this laptop with the owner's session so the session never shows up from a cloud IP.
const WATCH_STORE = process.env.WATCH_MP_STORE || process.env.DEMO_MP_STORE;
let session = null, loadedAt = 0;
async function unreadCount() {
  if (!WATCH_STORE) return null;
  if (!session || Date.now() - loadedAt > 5 * 60_000) { // runs write refreshed cookies back
    const r = await fetch(`${API}/key-value-stores/${await storeId(WATCH_STORE)}/records/state`, { headers: apifyHeaders });
    if (r.ok) { session = await r.json(); loadedAt = Date.now(); }
  }
  if (!session) return null;
  const cookie = session.cookies.filter((c) => c.domain.includes("marktplaats.nl")).map((c) => `${c.name}=${c.value}`).join("; ");
  const r = await fetch("https://www.marktplaats.nl/header/messages/message-count", {
    headers: { Cookie: cookie, Accept: "application/json", "X-Requested-With": "XMLHttpRequest", Referer: "https://www.marktplaats.nl/",
      "User-Agent": session.meta?.userAgent || "Mozilla/5.0" },
  });
  if (r.status !== 200) throw new Error(`message-count HTTP ${r.status}`);
  return Number((await r.json()).unreadMessagesCount ?? 0);
}

let queue = Promise.resolve();
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") return void res.writeHead(200).end("ok");
  if (req.headers["x-runner-key"] !== KEY) return void res.writeHead(403).end("Forbidden");
  if (url.pathname === "/unread" && req.method === "GET") {
    return void unreadCount()
      .then((unread) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ unread })))
      .catch((e) => res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: e.message })));
  }
  if (url.pathname !== "/run" || req.method !== "POST") return void res.writeHead(404).end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let input;
    try { input = JSON.parse(body || "{}"); } catch { return void res.writeHead(400).end("Bad JSON"); }
    // Laptop = the owner's own connection: no proxy. Browser actions open a visible window so people can watch.
    input = { ...input, useProxy: false, headful: true };
    const timeoutSec = Math.min(Number(url.searchParams.get("timeout")) || 280, 600);
    res.writeHead(200, { "Content-Type": "application/json" });
    const keepAlive = setInterval(() => res.write(" "), 10_000);
    const job = queue.then(async () => {
      const dir = mkdtempSync(join(tmpdir(), "mp-run-"));
      const started = Date.now();
      console.log(`\n▶ ${input.action} ${input.listingId ?? input.title ?? ""}`);
      try {
        if (input.sessionStore) await pullSession(input.sessionStore, dir);
        const code = await runActor(input, dir, timeoutSec);
        if (input.sessionStore) await pushSession(input.sessionStore, dir).catch((e) => console.warn("session push failed", e.message));
        const { items, output } = readResult(dir);
        console.log(`■ ${input.action} exit ${code} in ${Math.round((Date.now() - started) / 1000)}s`);
        if (code === 0) return items.length ? items : Array.isArray(output) ? output : output ? [output] : [];
        return { error: { type: "run-failed", message: output?.error ?? `local run failed (exit ${code})` } };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
    queue = job.catch(() => undefined);
    job
      .then((out) => res.end(JSON.stringify(out)))
      .catch((e) => res.end(JSON.stringify({ error: { type: "runner", message: e.message } })))
      .finally(() => clearInterval(keepAlive));
  });
});
server.listen(PORT, () => console.log(`poof local runner on http://localhost:${PORT}${WATCH_STORE ? ` (unread counter for '${WATCH_STORE}')` : ""}`));

// Chat watcher: check the unread counter every WATCH_SECONDS (default 1) right here on the laptop and run the n8n inbox
// (tba/inbox-now) as soon as it rises. Local, so a 1 s check costs no n8n executions (n8n's own chat check is off).
// One inbox run at a time: a message that lands within 20 s of the last run is not dropped, it gets its own run as soon
// as that window has passed. If Marktplaats pushes back, wait longer (up to 60 s) and speed up again once it answers.
const N8N = process.env.N8N_BASE_URL;
const APP_KEY = process.env.POOF_APP_KEY;
if (WATCH_STORE && N8N && APP_KEY) {
  const EVERY = Math.max(1, Number(process.env.WATCH_SECONDS) || 1) * 1000;
  let lastCount = null, lastPoke = 0, pending = false, wait = EVERY, warned = 0;
  const tick = async () => {
    let count;
    try { count = await unreadCount(); }
    catch (e) {
      wait = Math.min(60_000, Math.max(wait * 2, 5_000));
      if (/HTTP 40[13]/.test(e.message)) session = null; // a run may have refreshed the cookies: reload them
      if (Date.now() - warned > 60_000) { warned = Date.now(); console.warn(`watcher: ${e.message}, next check in ${wait / 1000} s`); }
      return;
    }
    wait = EVERY;
    if (typeof count !== "number") return;
    // First check: messages already waiting count as new.
    if ((lastCount === null && count > 0) || (lastCount !== null && count > lastCount)) pending = true;
    lastCount = count;
    if (pending && Date.now() - lastPoke > 20_000) {
      lastPoke = Date.now(); pending = false;
      console.log(`
✉ ${count} unread on Marktplaats → running the inbox now`);
      await fetch(`${N8N}/webhook/tba/inbox-now`, { method: "POST", headers: { "X-Poof-Key": APP_KEY, "Content-Type": "application/json" }, body: "{}" })
        .catch((e) => console.warn("watcher: inbox poke failed", e.message));
    }
  };
  const loop = () => tick().finally(() => setTimeout(loop, wait));
  loop();
  console.log(`chat watcher on for '${WATCH_STORE}' (every ${EVERY / 1000} s)`);
}
