// Show the latest executions with per-node status and errors.  node n8n/runs.mjs [workflowKey] [count]
import { readFileSync } from "node:fs";
import { loadEnv } from "./lib.mjs";

const env = loadEnv();
const ids = JSON.parse(readFileSync(new URL("./ids.json", import.meta.url), "utf8"));
const [key, n = "2"] = process.argv.slice(2);
const q = new URLSearchParams({ limit: n, includeData: "true", ...(key ? { workflowId: ids[key] ?? key } : {}) });
const res = await fetch(`${env.N8N_BASE_URL}/api/v1/executions?${q}`, { headers: { "X-N8N-API-KEY": env.N8N_API_KEY } });
for (const e of (await res.json()).data) {
  const rd = e.data?.resultData ?? {};
  console.log(`#${e.id} ${e.status} last=${rd.lastNodeExecuted} ${rd.error ? "ERR " + rd.error.message + " " + (rd.error.description ?? "") : ""}`);
  for (const [node, runs] of Object.entries(rd.runData ?? {})) {
    const r = runs.at(-1);
    const out = r.data?.main?.[0] ?? [];
    const sample = process.env.V ? " " + JSON.stringify(out[0]?.json ?? null).slice(0, Number(process.env.V)) : "";
    console.log(`   ${r.executionStatus.padEnd(7)} ${node} (${out.length} items)${r.error ? " ERR " + r.error.message + " " + (r.error.description ?? "").slice(0, 400) : ""}${sample}`);
  }
}
