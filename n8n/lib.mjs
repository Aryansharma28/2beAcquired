// Tiny DSL for building n8n workflow JSON in code.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[2].trim()) env[m[1]] = m[2].trim();
  }
  return { ...process.env, ...env };
}

export const TABLES = {
  items: "qbZymoGpQLO6LHKz",
  events: "aXQdTZoKZNsdGAgA",
  decisions: "CgbqV5RAJMCLYuDC",
  messages: "u8BPdUepl83OaYgK",
  conversations: "ykYQZnkrScB4bP1Q",
  users: "FZKmuYNuPef0MilB",
  pairings: "Rz9Kao8eYUhioeER",
};

const credFile = join(root, "n8n", "credentials.json");
export const CREDS = existsSync(credFile) ? JSON.parse(readFileSync(credFile, "utf8")) : {};
const cred = (key, type) => (CREDS[key] ? { credentials: { [type]: { id: CREDS[key].id, name: CREDS[key].name } } } : {});


export class Workflow {
  constructor(name, { errorWorkflow } = {}) {
    this.name = name;
    this.nodes = [];
    this.connections = {};
    this.x = 0;
    this.settings = errorWorkflow && errorWorkflow !== "pending" ? { errorWorkflow } : {};
  }

  add(name, [type, typeVersion, parameters, nodeExtra = {}], extra = {}) {
    const { position, y = 0, ...rest } = extra;
    const pos = position ?? [this.x, y];
    if (!position) this.x += 260;
    this.nodes.push({ id: crypto.randomUUID(), name, type, typeVersion, position: pos, parameters, ...nodeExtra, ...rest });
    return name;
  }

  // Side-branch event log under `after`: shows up as a row in the item's live agent log.
  log(after, text, { type = "step", itemId = "={{ $json.itemId }}", name } = {}) {
    const node = this.nodes.find((n) => n.name === after);
    const label = name ?? `Log · ${after}`;
    this.add(label, tableInsert("events", { itemId, ts: "={{ $now.toISO() }}", type, text, meta: "{}" }),
      { position: [node.position[0], node.position[1] - 200] });
    this.link(after, label);
    return label;
  }

  link(from, to, output = 0, input = 0) {
    const c = (this.connections[from] ??= { main: [] });
    while (c.main.length <= output) c.main.push([]);
    c.main[output].push({ node: to, type: "main", index: input });
  }

  chain(...names) {
    for (let i = 0; i < names.length - 1; i++) this.link(names[i], names[i + 1]);
    return names.at(-1);
  }

  // AI sub-node connection: sub-node `from` feeds root node `to`
  sub(from, to, kind) {
    const c = (this.connections[from] ??= {});
    (c[kind] ??= [[]])[0].push({ node: to, type: kind, index: 0 });
  }

  toJSON() {
    return {
      name: this.name,
      nodes: this.nodes,
      connections: this.connections,
      settings: { executionOrder: "v1", saveManualExecutions: true, saveDataSuccessExecution: "all", ...this.settings },
    };
  }
}

// ---------- core nodes ----------

// Every webhook requires the X-Poof-Key header (the app's shared secret) once that credential exists.
// { auth: false } only for callers that can't send our header (Stripe); such workflows must verify the payload themselves.
export const webhook = (path, method = "POST", { auth = true } = {}) => [
  "n8n-nodes-base.webhook", 2.1,
  { httpMethod: method, path, responseMode: "responseNode", ...(auth && CREDS.appKey ? { authentication: "headerAuth" } : {}), options: {} },
  { webhookId: crypto.randomUUID(), ...(auth ? cred("appKey", "httpHeaderAuth") : {}) },
];

// The calling user, forwarded by the app's proxy (n8n lower-cases header names).
export const USER = "$('%NODE%').first().json.headers['x-poof-user']";
export const userOf = (node) => USER.replace("%NODE%", node);

export const respond = (body = "={{ $json }}", code = 200) => [
  "n8n-nodes-base.respondToWebhook", 1.5,
  { respondWith: "json", responseBody: body, options: { responseCode: code } },
];

export const code = (jsCode, mode = "runOnceForAllItems") => ["n8n-nodes-base.code", 2, { mode, jsCode }];

export const codeEach = (jsCode) => code(jsCode, "runOnceForEachItem");

export const ifTrue = (leftExpr) => [
  "n8n-nodes-base.if", 2.2,
  {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
      conditions: [{ id: crypto.randomUUID(), leftValue: leftExpr, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }],
      combinator: "and",
    },
    looseTypeValidation: true,
    options: {},
  },
];

export const waitSeconds = (amount) => [
  "n8n-nodes-base.wait", 1.1, { resume: "timeInterval", amount, unit: "seconds" }, { webhookId: crypto.randomUUID() },
];

export const schedule = (minutes) => [
  "n8n-nodes-base.scheduleTrigger", 1.2,
  { rule: { interval: [{ field: "minutes", minutesInterval: minutes }] } },
];

export const errorTrigger = () => ["n8n-nodes-base.errorTrigger", 1, {}];

export const callWorkflow = (id, { wait = false, each = false } = {}) => [
  "n8n-nodes-base.executeWorkflow", 1.3,
  {
    workflowId: { __rl: true, mode: "id", value: id },
    workflowInputs: { mappingMode: "defineBelow", value: {}, matchingColumns: [], schema: [] },
    mode: each ? "each" : "once",
    options: { waitForSubWorkflow: wait },
  },
];

export const subTrigger = () => ["n8n-nodes-base.executeWorkflowTrigger", 1.1, { inputSource: "passthrough" }];

// ---------- data tables ----------

const rl = (id) => ({ __rl: true, mode: "id", value: id });

// columns: { name: expr } ; suffix a key with ":number" for numeric columns
function mapper(columns) {
  const value = {};
  const schema = [];
  for (const [k, v] of Object.entries(columns)) {
    const [id, type = "string"] = k.split(":");
    value[id] = v;
    schema.push({ id, displayName: id, required: false, defaultMatch: false, display: true, type, canBeUsedToMatch: true });
  }
  return { mappingMode: "defineBelow", value, matchingColumns: [], schema, attemptToConvertTypes: true, convertFieldsToString: false };
}

const filters = (conds) => ({
  conditions: Object.entries(conds).map(([keyName, keyValue]) => ({ keyName, condition: "eq", keyValue })),
});

export const tableInsert = (table, columns) => [
  "n8n-nodes-base.dataTable", 1.1,
  { resource: "row", operation: "insert", dataTableId: rl(TABLES[table]), columns: mapper(columns), options: {} },
];

export const tableUpsert = (table, match, columns) => [
  "n8n-nodes-base.dataTable", 1.1,
  { resource: "row", operation: "upsert", dataTableId: rl(TABLES[table]), matchType: "allConditions",
    filters: filters(match), columns: mapper(columns), options: {} },
];

export const tableUpdate = (table, match, columns) => [
  "n8n-nodes-base.dataTable", 1.1,
  { resource: "row", operation: "update", dataTableId: rl(TABLES[table]), matchType: "allConditions",
    filters: filters(match), columns: mapper(columns), options: {} },
];

export const tableGet = (table, match = null) => [
  "n8n-nodes-base.dataTable", 1.1,
  {
    resource: "row", operation: "get", dataTableId: rl(TABLES[table]),
    ...(match ? { matchType: "allConditions", filters: filters(match) } : {}),
    returnAll: true,
    orderBy: true, orderByColumn: "createdAt", orderByDirection: "ASC",
  },
  { alwaysOutputData: true },
];

// ---------- integrations ----------

// LLM via any OpenAI-compatible endpoint (Groq, OpenRouter, Together, Jev…) with JSON-schema structured output.
// Read the result with ARGS (also accepts tool-call style responses).
export const ARGS = "(() => { const m = $json.choices[0].message; const a = m.tool_calls?.[0]?.function?.arguments ?? m.content; return typeof a === 'string' ? JSON.parse(a.replace(/^```(json)?|```$/g, '')) : a; })()";

// n8n ends an expression at the first "}}", so nested object literals must never touch.
const safe = (inner) => inner.replace(/\}\}/g, "} }").replace(/\}\}/g, "} }").replace(/\{\{/g, "{ {");

// reasoning: 'low' | 'medium' | 'high' for reasoning models (gpt-oss). Their thinking counts toward maxTokens, so a tight
// budget leaves no room for the JSON answer (Groq: json_validate_failed) and burns retries.
// On OpenRouter, route to the lowest-latency provider (gpt-oss-120b: ~0.5 s on Groq/Cerebras instead of 2-3 s by default).
export const llm = (env, { system, content, tool, maxTokens = 1500, vision = false, reasoning = null }) => [
  "n8n-nodes-base.httpRequest", 4.2,
  {
    method: "POST", url: `${env.LLM_BASE_URL}/chat/completions`,
    authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json",
    jsonBody: "={{ " + safe(`JSON.stringify({ model: "${vision ? env.LLM_VISION_MODEL || env.LLM_MODEL : env.LLM_MODEL}", max_tokens: ${maxTokens}, temperature: 0.3,${reasoning ? ` reasoning_effort: "${reasoning}",` : ""}${/openrouter.ai/.test(env.LLM_BASE_URL) ? ` provider: { sort: "latency" },` : ""}
      messages: [{ role: "system", content: ${system} + ${JSON.stringify(" Respond with JSON only: " + tool.description + ".")} }, { role: "user", content: ${content} }],
      response_format: { type: "json_schema", json_schema: ${JSON.stringify({ name: tool.name, schema: tool.input_schema })} } })`) + " }}",
    options: { timeout: 120000 },
  },
  { ...cred("llmHttp", "httpHeaderAuth"), retryOnFail: true, maxTries: 5, waitBetweenTries: 5000 }, // rides out Groq free-tier per-minute limits
];

// The same LLM request sent to several OpenRouter providers at once; the first valid answer wins (a Code node, because
// n8n runs branches one after another). Same output shape as llm(), or { error } when all fail. Vision latency on one
// provider swung 3-6 s for the same photo; racing takes the fast one. Costs one call per provider (~€0.002 each).
// Code nodes can't use n8n credentials, so the key is put in at deploy time (like the Stripe key; n8n/workflows is gitignored).
// Without OpenRouter this is plain llm().
export const RACE_PROVIDERS = ["alibaba", "deepinfra", "parasail"];
export const llmRace = (env, opts, providers = RACE_PROVIDERS) => {
  if (!/openrouter.ai/.test(env.LLM_BASE_URL)) return llm(env, opts);
  const { system, content, tool, maxTokens = 1500, vision = false } = opts;
  const model = vision ? env.LLM_VISION_MODEL || env.LLM_MODEL : env.LLM_MODEL;
  return code(`
const body = { model: ${JSON.stringify(model)}, max_tokens: ${maxTokens}, temperature: 0.3,
  messages: [{ role: 'system', content: ${system} + ${JSON.stringify(" Respond with JSON only: " + tool.description + ".")} }, { role: 'user', content: ${content} }],
  response_format: { type: 'json_schema', json_schema: ${JSON.stringify({ name: tool.name, schema: tool.input_schema })} } };
const t0 = Date.now();
const ask = (p) => this.helpers.httpRequest({ method: 'POST', url: ${JSON.stringify(env.LLM_BASE_URL + "/chat/completions")}, json: true, timeout: 45000,
  headers: { Authorization: 'Bearer ' + ${JSON.stringify(env.LLM_API_KEY)} },
  body: { ...body, provider: { order: [p], allow_fallbacks: false } } }).then((r) => {
    const c = String(r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content || '');
    JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); // only a usable answer wins the race
    return { ...r, raceMs: Date.now() - t0, raceWinner: p };
  });
try {
  return [{ json: await Promise.any(${JSON.stringify(providers)}.map(ask)) }];
} catch (e) {
  return [{ json: { error: 'all providers failed', raceMs: Date.now() - t0, details: (e.errors || [e]).map((x) => String((x && x.message) || x).slice(0, 200)) } }];
}`);
};

// Our Marktplaats Apify actor, run synchronously; returns one n8n item per dataset item.
// { local: true } (actions on the user's Marktplaats session): with LOCAL_RUNNER_URL set, run on the owner's
// laptop instead (actors/marktplaats/local-runner.mjs); Marktplaats hides ads posted from the cloud server.
export const actor = (env, inputExpr, { timeout = 280, soft = false, local = false } = {}) =>
  local && env.LOCAL_RUNNER_URL
    ? [
        "n8n-nodes-base.httpRequest", 4.2,
        {
          method: "POST",
          url: `${env.LOCAL_RUNNER_URL.replace(/\/+$/, "")}/run?timeout=${timeout}`,
          sendHeaders: true, headerParameters: { parameters: [{ name: "X-Runner-Key", value: env.RUNNER_KEY || "" }] },
          sendBody: true, specifyBody: "json", jsonBody: inputExpr,
          options: { timeout: (timeout + 60) * 1000 },
        },
        soft ? { onError: "continueRegularOutput" } : {},
      ]
    : [
        "n8n-nodes-base.httpRequest", 4.2,
        {
          method: "POST",
          url: `https://api.apify.com/v2/acts/${env.APIFY_ACTOR || "USER~marktplaats"}/run-sync-get-dataset-items?timeout=${timeout}`,
          authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
          sendBody: true, specifyBody: "json", jsonBody: inputExpr,
          options: { timeout: (timeout + 30) * 1000 },
        },
        { ...cred("apify", "httpHeaderAuth"), ...(soft ? { onError: "continueRegularOutput" } : {}) },
      ];

// Post-sale delist (W5 after the pickup is booked, W1d when the owner marks it picked up & paid): take every live
// Marktplaats ad of the sold items down on the owner's session, then mark all their listings removed. Runs after
// `after`; `source` is a node whose items are { itemId, item } (item = parsed data incl. listings + mpStore).
// Nothing live → the branch stops at "Listings to remove" (no actor run, no event).
export function delistAfter(w, env, after, source) {
  w.add("Listings to remove", code(`
return $('${source}').all().filter(i => i.json.item.mpStore).flatMap(i => (i.json.item.listings || []).filter(l => l.status === 'live' && l.listingId)
  .map(l => ({ json: { itemId: i.json.itemId, platform: l.platform, listingId: l.listingId, sessionStore: i.json.item.mpStore } })));`));
  w.add("Delist on Marktplaats (Apify)", actor(env, "={{ JSON.stringify({ action: 'delist', delistReason: 'sold_on_marktplaats', useProxy: true, sessionStore: $json.sessionStore, listingId: $json.listingId, dryRun: " + (env.MP_DRY_RUN === "1") + " }) }}", { soft: true, local: true }));
  // Re-read the items: other workflows (payments) may have saved to them meanwhile.
  w.add("Fresh items", tableGet("items"), { executeOnce: true });
  w.add("All removed", code(`
const fresh = Object.fromEntries($('Fresh items').all().map(r => [r.json.itemId, r.json]));
const ids = new Set($('Listings to remove').all().map(i => i.json.itemId));
return $('${source}').all().filter(i => ids.has(i.json.itemId)).map(i => {
  const item = fresh[i.json.itemId] ? JSON.parse(fresh[i.json.itemId].data) : i.json.item;
  item.listings = (item.listings || []).map(l => ({ ...l, status: 'removed' }));
  return { json: { itemId: i.json.itemId, data: JSON.stringify(item) } };
});`));
  w.add("Save removed", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { data: "={{ $json.data }}" }));
  w.chain(after, "Listings to remove", "Delist on Marktplaats (Apify)", "Fresh items", "All removed", "Save removed");
  w.log("Save removed", "=Removed from every platform", { type: "notify" });
}

// Stripe REST call: form fields as [name, value] pairs (values may be n8n expressions). Test mode with an sk_test_ key
// from .env at deploy time.
export const stripe = (env, method, urlExpr, fields) => [
  "n8n-nodes-base.httpRequest", 4.2,
  {
    method, url: urlExpr,
    sendHeaders: true, headerParameters: { parameters: [{ name: "Authorization", value: `Bearer ${env.STRIPE_SECRET_KEY || ""}` }] },
    ...(fields ? { sendBody: true, contentType: "form-urlencoded", specifyBody: "keypair", bodyParameters: { parameters: fields.map(([name, value]) => ({ name, value })) } } : {}),
    options: { timeout: 30000 },
  },
];

// Marktplaats public search JSON (no login), straight from n8n: ~0.5 s instead of ~10-25 s for an Apify actor run.
// Pair with MP_COMPS (Code node) to turn the response into comparable listings. Same request as the actor's 'comps'.
export const mpSearch = (queryExpr) => [
  "n8n-nodes-base.httpRequest", 4.2,
  {
    method: "GET", url: "https://www.marktplaats.nl/lrp/api/search",
    sendQuery: true, queryParameters: { parameters: [
      { name: "query", value: queryExpr }, { name: "limit", value: "100" }, { name: "offset", value: "0" },
      { name: "searchInTitleAndDescription", value: "true" }, { name: "viewOptions", value: "list-view" },
    ] },
    sendHeaders: true, headerParameters: { parameters: [
      { name: "User-Agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36" },
      { name: "Accept", value: "application/json" },
    ] },
    options: { timeout: 20000 },
  },
  { retryOnFail: true, maxTries: 3, waitBetweenTries: 1000, onError: "continueRegularOutput", alwaysOutputData: true },
];

// Code for the node after mpSearch: one item per priced private listing (first 40), like the actor's mapListing.
// Always returns at least one (empty) item so the flow continues when nothing is found.
export const MP_COMPS = `
const listings = $input.all().flatMap(i => Array.isArray(i.json.listings) ? i.json.listings : []);
const seen = new Set();
const out = [];
for (const l of listings) {
  const id = String(l.itemId || '');
  if (!id || seen.has(id) || id.startsWith('a')) continue; // 'a...' = Admarkt business ads, not second-hand comps
  seen.add(id);
  const cents = l.priceInfo && l.priceInfo.priceCents;
  if (typeof cents !== 'number' || cents <= 0) continue;
  const pic = Array.isArray(l.pictures) && l.pictures[0];
  const abs = (u) => !u ? null : u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? 'https://www.marktplaats.nl' + u : u;
  out.push({ json: { itemId: id, title: String(l.title || ''), price: Math.round(cents) / 100, priceType: String((l.priceInfo && l.priceInfo.priceType) || ''),
    url: abs(l.vipUrl) || 'https://www.marktplaats.nl/' + id, image: (pic && (pic.largeUrl || pic.mediumUrl)) || abs((l.imageUrls || [])[0]) || null,
    city: (l.location && l.location.cityName) || null, platform: 'marktplaats' } });
  if (out.length >= 40) break;
}
return out.length ? out : [{ json: {} }];`;

// Comparable matching rules shared by intake and rename: generations (a name without one matched only 1st-gen listings in
// one run and 2nd/3rd-gen in the next) and knock-offs ("AirPods Pro 2 nieuw" for €20 drags the market price down).
export const FAKES = "If the item's name has no generation or version (e.g. 'Apple AirPods Pro'), every generation of that product line counts as the same product; if it names one, keep only that one. Also exclude likely replicas/fakes: listings of branded electronics priced far below the typical price for that exact product.";

// Apify REST call (generic)
export const apify = (method, url, extra = {}) => [
  "n8n-nodes-base.httpRequest", 4.2,
  { method, url, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", ...extra, options: extra.options ?? {} },
  cred("apify", "httpHeaderAuth"),
];

// n8n's own public API (used by the error handler to read failed runs)
export const n8nApi = (env, pathExpr) => [
  "n8n-nodes-base.httpRequest", 4.2,
  { method: "GET", url: `=${env.N8N_BASE_URL}/api/v1${pathExpr}`, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", options: { timeout: 30000 } },
  { ...cred("n8nApi", "httpHeaderAuth"), onError: "continueRegularOutput", alwaysOutputData: true },
];

// Push to phone via ntfy.sh JSON publishing. bodyExpr must evaluate to {title, message, tags?, click?, actions?}
export const ntfy = (env, bodyExpr) => [
  "n8n-nodes-base.httpRequest", 4.2,
  {
    method: "POST", url: "https://ntfy.sh/",
    sendBody: true, specifyBody: "json",
    jsonBody: `={{ JSON.stringify(Object.assign({ topic: "${env.NTFY_TOPIC}" }, ${bodyExpr})) }}`,
    options: {},
  },
  { onError: "continueRegularOutput" },
];

// ---------- AI agent (cluster) ----------

export const agent = ({ text, system }) => [
  "@n8n/n8n-nodes-langchain.agent", 3.1,
  { promptType: "define", text, hasOutputParser: true, options: { systemMessage: system, maxIterations: 3 } },
];

export const chatModel = (env) => [
  "@n8n/n8n-nodes-langchain.lmChatOpenAi", 1.2,
  { model: { __rl: true, mode: "id", value: env.LLM_MODEL || "set-LLM_MODEL" }, options: { baseURL: env.LLM_BASE_URL, temperature: 0.4, maxTokens: 900 } },
  cred("llm", "openAiApi"),
];

// Google Calendar (only if the owner connected one in n8n; see setup.mjs)
export const HAS_CALENDAR = !!CREDS.gcal;
export const calendarEvents = (timeMin, timeMax) => [
  "n8n-nodes-base.googleCalendar", 1.3,
  { operation: "getAll", calendar: { __rl: true, mode: "id", value: "primary" }, returnAll: true, timeMin, timeMax, options: { singleEvents: true } },
  { ...cred("gcal", "googleCalendarOAuth2Api"), alwaysOutputData: true },
];
export const calendarCreate = ({ start, end, summary, description, location }) => [
  "n8n-nodes-base.googleCalendar", 1.3,
  { operation: "create", calendar: { __rl: true, mode: "id", value: "primary" }, start, end, useDefaultReminders: true,
    additionalFields: { summary, description, location } },
  cred("gcal", "googleCalendarOAuth2Api"),
];

export const outputParser = (schema) => [
  "@n8n/n8n-nodes-langchain.outputParserStructured", 1.3,
  { schemaType: "manual", inputSchema: JSON.stringify(schema, null, 2) },
];
