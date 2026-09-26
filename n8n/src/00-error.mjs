import { Workflow, errorTrigger, code, tableInsert, tableUpdate, ntfy, ifTrue, apify, n8nApi } from "../lib.mjs";

// W0 · Error handler: every TBA workflow reports here. Classifies the failure, tells the item log, and
// only pings a human when a human is actually needed (expired Marktplaats session / captcha).
export default (env) => {
  const w = new Workflow("poof · 0 Error handler");
  w.add("On any failure", errorTrigger());
  // Apify's run-sync error hides the actor's reason; fetch the run's status message (e.g. SESSION_EXPIRED).
  w.add("Actor run?", code(`
const e = $('On any failure').first().json.execution || {};
const msg = String(e.error?.message || '') + ' ' + String(e.error?.description || '');
const runId = (msg.match(/run ID: ([A-Za-z0-9]+)/) || [])[1] || null;
return [{ json: { runId, raw: $('On any failure').first().json } }];`));
  w.add("Fetch actor reason", apify("GET", "=https://api.apify.com/v2/actor-runs/{{ $json.runId || 'none' }}"), { onError: "continueRegularOutput", alwaysOutputData: true });
  w.add("Classify", code(`
const raw = $('Actor run?').first().json.raw;
const e = raw.execution || {};
const reason = $input.first().json?.data?.statusMessage || '';
const msg = (reason || String(e.error?.message || e.error?.description || 'Unknown error')).trim();
const lastNode = e.lastNodeExecuted || '';
const run = JSON.stringify($('Failed run').first().json || {});
const m = (run.match(/"itemId":"(itm_[a-z0-9]{8,14})"/) || run.match(/(itm_[a-z0-9]{8,14})/) || JSON.stringify(raw).match(/(itm_[a-z0-9]{8,14})/) || [])[1];
const itemId = m || 'system';
let kind = 'transient', human = false;
if (/SESSION_EXPIRED|login/i.test(msg)) { kind = 'session_expired'; human = true; }
else if (/CAPTCHA/i.test(msg)) { kind = 'captcha'; human = true; }
else if (/429|rate|too many requests|tokens per minute/i.test(msg)) kind = 'rate_limited';
return [{ json: { itemId, kind, human, msg: msg.slice(0, 300), workflow: raw.workflow?.name, lastNode, url: e.url } }];`));
  // The error event carries no run data, so read the failed execution to find which item it was about.
  w.add("Failed run", n8nApi(env, "/executions/{{ $('On any failure').first().json.execution.id }}?includeData=true"));
  w.chain("On any failure", "Failed run", "Actor run?", "Fetch actor reason", "Classify");
  w.add("Log to item", tableInsert("events", {
    itemId: "={{ $json.itemId }}", ts: "={{ $now.toISO() }}", type: "error",
    text: "={{ $json.human ? ($json.kind === 'captcha' ? 'Marktplaats asked for a captcha: log in once to continue' : 'Marktplaats login expired: log in once to continue') : 'Could not finish \"' + $json.lastNode + '\": ' + $json.msg.slice(0, 120) }}",
    meta: "={{ JSON.stringify({ msg: $json.msg, url: $json.url, step: $json.lastNode, workflow: $json.workflow, kind: $json.kind }) }}",
  }));
  w.add("Human needed?", ifTrue("={{ $('Classify').first().json.human }}"));
  w.add("Tell owner", ntfy(env, `{ title: 'Your selling agent needs you', message: $('Classify').first().json.kind === 'captcha' ? 'Marktplaats showed a captcha. Log in once in the helper to continue.' : 'Marktplaats session expired. Log in once and I will carry on.', tags: ['warning'], priority: 4 }`));
  w.chain("Classify", "Log to item", "Human needed?", "Tell owner");
  // A failed publish must not leave the app on "publishing" forever.
  w.add("Publish failed?", ifTrue("={{ $('Classify').first().json.itemId !== 'system' && /Publish|Intake|Details|Approve/.test($('Classify').first().json.workflow || '') }}"), { position: [780, 220] });
  w.add("Mark item error", tableUpdate("items", { itemId: "={{ $('Classify').first().json.itemId }}" }, { status: "error" }), { position: [1040, 220] });
  w.link("Log to item", "Publish failed?");
  w.link("Publish failed?", "Mark item error", 0);
  return w;
};
