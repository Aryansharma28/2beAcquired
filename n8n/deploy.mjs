// Build every workflow in n8n/src, write JSON to n8n/workflows, and upsert + activate on n8n Cloud.
// Usage: node n8n/deploy.mjs [fileFilter]
import { readdirSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv, setPushWorkflow } from "./lib.mjs";
import { lintWorkflow } from "./lint.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const env = loadEnv();
const API = `${env.N8N_BASE_URL}/api/v1`;
const headers = { "X-N8N-API-KEY": env.N8N_API_KEY, "content-type": "application/json" };

export async function api(method, path, body) {
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
}

const filter = process.argv[2];
const existing = (await api("GET", "/workflows?limit=250")).data;
mkdirSync(join(here, "workflows"), { recursive: true });

const files = readdirSync(join(here, "src")).filter((f) => f.endsWith(".mjs")).sort();
const mods = [];
for (const file of files) mods.push({ file, build: (await import(pathToFileURL(join(here, "src", file)))).default });
const key = (file) => file.replace(/^\d+-/, "").replace(/\.mjs$/, "");

// Pass 1: make sure every workflow exists so sub-workflow calls can reference real ids.
// Match by the id we deployed before (ids.json) so renames update in place; fall back to the name.
const known = existsSync(join(here, "ids.json")) ? JSON.parse(readFileSync(join(here, "ids.json"), "utf8")) : {};
const ids = {};
for (const { file, build } of mods) {
  const { name } = build(env, new Proxy({}, { get: () => "pending" }));
  let found = existing.find((w) => w.id === known[key(file)]) ?? existing.find((w) => w.name === name);
  if (!found) {
    found = await api("POST", "/workflows", { name, nodes: [], connections: {}, settings: { executionOrder: "v1" } });
    existing.push(found);
  }
  ids[key(file)] = found.id;
}

setPushWorkflow(ids.push); // log() events of type notify/decision also push to the owner's phone

// Pass 2: build with real ids, write JSON, update + activate. Retry until sub-workflows are published first.
let queue = mods.filter(({ file }) => !filter || file.includes(filter));
let errors = [];
for (let round = 0; queue.length && round < 5; round++) {
  const next = [];
  errors = [];
  for (const m of queue) {
    const wf = m.build(env, ids);
    const json = wf.toJSON();
    const problems = lintWorkflow(json);
    if (problems.length) { console.log(problems.map((p) => `LINT ${p}`).join("\n")); process.exit(1); }
    writeFileSync(join(here, "workflows", m.file.replace(".mjs", ".json")), JSON.stringify(json, null, 2));
    const found = existing.find((w) => w.id === ids[key(m.file)]);
    try {
      if (round === 0) {
        if (found.active) await api("POST", `/workflows/${found.id}/deactivate`).catch(() => {});
        await api("PUT", `/workflows/${found.id}`, json);
      }
      if (wf.active !== false) await api("POST", `/workflows/${found.id}/activate`);
      console.log(`ok  ${json.name} -> ${found.id}${wf.active !== false ? " (active)" : ""}`);
    } catch (e) {
      next.push(m);
      errors.push(`ERR ${json.name}: ${e.message}`);
    }
  }
  if (next.length === queue.length) break;
  queue = next;
}
errors.forEach((e) => console.log(e));
const failed = errors.length;
writeFileSync(join(here, "ids.json"), JSON.stringify(ids, null, 2));
process.exit(failed ? 1 : 0);
