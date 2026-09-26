// One-time setup from .env: n8n credentials (Anthropic, Apify) + Apify photo store + actor id.
// Writes n8n/credentials.json and fills APIFY_PHOTO_STORE / APIFY_ACTOR in .env. Safe to re-run.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env");
const env = loadEnv();
const n8n = async (method, path, body) => {
  const res = await fetch(`${env.N8N_BASE_URL}/api/v1${path}`, {
    method, headers: { "X-N8N-API-KEY": env.N8N_API_KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
};
const setEnv = (key, value) => {
  let s = readFileSync(envPath, "utf8");
  s = s.match(new RegExp(`^${key}=`, "m")) ? s.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`) : s + `\n${key}=${value}\n`;
  writeFileSync(envPath, s);
};

const credFile = join(here, "credentials.json");
const creds = existsSync(credFile) ? JSON.parse(readFileSync(credFile, "utf8")) : {};

async function ensureCred(key, name, type, data) {
  if (creds[key]) { console.log(`= ${name} (${creds[key].id})`); return; }
  const c = await n8n("POST", "/credentials", { name, type, data });
  creds[key] = { id: c.id, name };
  console.log(`+ ${name} (${c.id})`);
}

// Any OpenAI-compatible provider (Groq, OpenRouter, Together, Jev…): LLM_BASE_URL + LLM_API_KEY.
if (env.LLM_API_KEY && env.LLM_BASE_URL) {
  await ensureCred("llm", "TBA LLM (OpenAI-compatible)", "openAiApi", { apiKey: env.LLM_API_KEY, url: env.LLM_BASE_URL });
  await ensureCred("llmHttp", "TBA LLM bearer", "httpHeaderAuth", { name: "Authorization", value: `Bearer ${env.LLM_API_KEY}` });
} else console.log("! LLM_API_KEY / LLM_BASE_URL missing");

if (env.APIFY_TOKEN) {
  await ensureCred("apify", "TBA Apify", "httpHeaderAuth", { name: "Authorization", value: `Bearer ${env.APIFY_TOKEN}` });
  const apify = async (method, path) => {
    const r = await fetch(`https://api.apify.com/v2${path}`, { method, headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` } });
    if (!r.ok) throw new Error(`apify ${path} -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return (await r.json()).data;
  };
  const me = await apify("GET", "/users/me");
  const store = await apify("POST", "/key-value-stores?name=tba-photos");
  setEnv("APIFY_PHOTO_STORE", store.id);
  if (!env.APIFY_ACTOR) setEnv("APIFY_ACTOR", `${me.username}~marktplaats`);
  console.log(`= Apify user ${me.username}, photo store ${store.id}`);
} else console.log("! APIFY_TOKEN missing");

// Google Calendar: connect it once in the n8n UI (Credentials → Google Calendar OAuth2 → Sign in with Google); we pick it up here.
const all = (await n8n("GET", "/credentials?limit=100")).data || [];
const gcal = all.find((c) => c.type === "googleCalendarOAuth2Api");
if (gcal) { creds.gcal = { id: gcal.id, name: gcal.name }; console.log(`= Google Calendar (${gcal.id})`); }
else console.log("! No Google Calendar credential in n8n yet (pickup slots fall back to default hours)");

writeFileSync(credFile, JSON.stringify(creds, null, 2));
