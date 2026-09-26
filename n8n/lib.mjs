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

export const webhook = (path, method = "POST") => [
  "n8n-nodes-base.webhook", 2.1,
  { httpMethod: method, path, responseMode: "responseNode", options: {} },
  { webhookId: crypto.randomUUID() },
];

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

export const llm = (env, { system, content, tool, maxTokens = 1500, vision = false }) => [
  "n8n-nodes-base.httpRequest", 4.2,
  {
    method: "POST", url: `${env.LLM_BASE_URL}/chat/completions`,
    authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json",
    jsonBody: "={{ " + safe(`JSON.stringify({ model: "${vision ? env.LLM_VISION_MODEL || env.LLM_MODEL : env.LLM_MODEL}", max_tokens: ${maxTokens}, temperature: 0.3,
      messages: [{ role: "system", content: ${system} + ${JSON.stringify(" Respond with JSON only: " + tool.description + ".")} }, { role: "user", content: ${content} }],
      response_format: { type: "json_schema", json_schema: ${JSON.stringify({ name: tool.name, schema: tool.input_schema })} } })`) + " }}",
    options: { timeout: 120000 },
  },
  { ...cred("llmHttp", "httpHeaderAuth"), retryOnFail: true, maxTries: 3, waitBetweenTries: 3000 },
];

// Our Marktplaats Apify actor, run synchronously; returns one n8n item per dataset item.
export const actor = (env, inputExpr, { timeout = 280, soft = false } = {}) => [
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

// Apify REST call (generic)
export const apify = (method, url, extra = {}) => [
  "n8n-nodes-base.httpRequest", 4.2,
  { method, url, authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", ...extra, options: extra.options ?? {} },
  cred("apify", "httpHeaderAuth"),
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
