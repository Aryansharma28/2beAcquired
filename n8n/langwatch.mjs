// LangWatch on n8n Cloud: traces, guardrails and PII detection for the negotiator.
// The official LangWatch n8n nodes (@langwatch/n8n-nodes-langwatch) are not vetted for n8n Cloud ("not vetted for
// installation"), so these HTTP nodes make the exact calls those nodes make:
//   Evaluation node → POST /api/evaluations/{evaluator}/evaluate { name, data, settings, as_guardrail, trace_id }
//   traces          → POST /api/collector (REST collector, spans + metadata)
// Auth: the "LangWatch" n8n credential (X-Auth-Token), created by setup.mjs from LANGWATCH_API_KEY.
// Everything here fails open: if LangWatch is down, the buyer still gets an answer (the deterministic guardrails in
// 30-inbox.mjs are the hard safety net).
import { CREDS } from "./lib.mjs";

const cred = CREDS.langwatch ? { credentials: { httpHeaderAuth: { id: CREDS.langwatch.id, name: CREDS.langwatch.name } } } : {};
const base = (env) => (env.LANGWATCH_ENDPOINT || "https://app.langwatch.ai").replace(/\/+$/, "");

// POST $json[field] to LangWatch. The body is built in the Code node before it, so no object literals in expressions.
const post = (env, path, field) => [
  "n8n-nodes-base.httpRequest", 4.2,
  {
    method: "POST", url: base(env) + path,
    authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    sendBody: true, specifyBody: "json", jsonBody: `={{ JSON.stringify($json.${field}) }}`,
    options: { timeout: 10000 },
  },
  { ...cred, onError: "continueRegularOutput", alwaysOutputData: true },
];

// Run a LangWatch evaluator as a guardrail. The Code node before it puts { name, data, settings, as_guardrail, trace_id }
// in $json.lwEval; the result is { status, passed, score, details, raw_response }.
export const lwEvaluate = (env, evaluator) => post(env, `/api/evaluations/${encodeURIComponent(evaluator)}/evaluate`, "lwEval");

// Send the trace built in $json.lwTrace to the collector.
export const lwTrace = (env) => post(env, "/api/collector", "lwTrace");

// Presidio (English NLP) misses Dutch phone numbers ("06-12345678", "+31 6 1234 5678"), so this deterministic pass
// runs next to it. Code-node snippet: defines piiFind(text) (Dutch patterns), piiSpans(text, presidioResult) and piiMask(text, spans).
export const PII_JS = `
const PII_RX = [
  ['PHONE_NUMBER', /(?:\\+|00)31[\\s-]?(?:\\(0\\)[\\s-]?)?[1-9](?:[\\s-]?\\d){8}|\\b0[1-9](?:[\\s-]?\\d){8}\\b/g],
  ['EMAIL_ADDRESS', /[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+/g],
  ['IBAN_CODE', /\\b[A-Z]{2}\\d{2}[\\s]?[A-Z]{4}(?:[\\s]?\\d){10}\\b/gi],
];
const piiFind = (text) => PII_RX.flatMap(([type, rx]) => [...String(text || '').matchAll(rx)].map(m => ({ type, start: m.index, end: m.index + m[0].length })));
// Replace spans (Presidio results or piiFind) with a typed placeholder, right to left so offsets stay valid.
const piiMask = (text, spans) => spans.slice().sort((a, b) => b.start - a.start)
  .reduce((t, s) => t.slice(0, s.start) + '<' + s.type + '>' + t.slice(s.end), String(text || ''));
const piiSpans = (text, ev) => {
  const presidio = ((ev && ev.raw_response && ev.raw_response.results) || []).map(r => ({ type: r.entity_type, start: r.start, end: r.end }));
  const all = [...presidio, ...piiFind(text)].sort((a, b) => a.start - b.start);
  return all.filter((s, i) => !all.slice(0, i).some(o => s.start < o.end && s.end > o.start)); // drop overlaps
};`;
