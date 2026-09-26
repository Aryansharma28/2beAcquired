import { Workflow, errorTrigger, code, tableInsert, tableUpdate, ntfy, ifTrue } from "../lib.mjs";

// W0 · Error handler: every TBA workflow reports here. Classifies the failure, tells the item log, and
// only pings a human when a human is actually needed (expired Marktplaats session / captcha).
export default (env) => {
  const w = new Workflow("TBA · 0 Error handler");
  w.add("On any failure", errorTrigger());
  w.add("Classify", code(`
const e = $json.execution || {};
const msg = String(e.error?.message || e.error?.description || 'Unknown error');
const lastNode = e.lastNodeExecuted || '';
// find an itemId anywhere in the failing run's data we were given
const blob = JSON.stringify($json).slice(0, 200000);
const m = blob.match(/itm_[a-z0-9]{8,14}/);
const itemId = m ? m[0] : 'system';
let kind = 'transient', human = false;
if (/SESSION_EXPIRED|login/i.test(msg)) { kind = 'session_expired'; human = true; }
else if (/CAPTCHA/i.test(msg)) { kind = 'captcha'; human = true; }
else if (/429|rate/i.test(msg)) kind = 'rate_limited';
return [{ json: { itemId, kind, human, msg: msg.slice(0, 300), workflow: $json.workflow?.name, lastNode, url: e.url } }];`));
  w.add("Log to item", tableInsert("events", {
    itemId: "={{ $json.itemId }}", ts: "={{ $now.toISO() }}", type: "error",
    text: "={{ $json.human ? ($json.kind === 'captcha' ? 'Marktplaats asked for a captcha: log in once to continue' : 'Marktplaats login expired: log in once to continue') : 'Could not finish \"' + $json.lastNode + '\": ' + $json.msg.slice(0, 120) }}",
    meta: "={{ JSON.stringify({ msg: $json.msg, url: $json.url }) }}",
  }));
  w.add("Human needed?", ifTrue("={{ $('Classify').first().json.human }}"));
  w.add("Tell owner", ntfy(env, `{ title: 'Your selling agent needs you', message: $('Classify').first().json.kind === 'captcha' ? 'Marktplaats showed a captcha. Log in once in the helper to continue.' : 'Marktplaats session expired. Log in once and I will carry on.', tags: ['warning'], priority: 4 }`));
  w.chain("On any failure", "Classify", "Log to item", "Human needed?", "Tell owner");
  // A failed publish must not leave the app on "publishing" forever.
  w.add("Publish failed?", ifTrue("={{ $('Classify').first().json.itemId !== 'system' && /Publish|Intake/.test($('Classify').first().json.workflow || '') }}"), { position: [780, 220] });
  w.add("Mark item error", tableUpdate("items", { itemId: "={{ $('Classify').first().json.itemId }}" }, { status: "error" }), { position: [1040, 220] });
  w.link("Log to item", "Publish failed?");
  w.link("Publish failed?", "Mark item error", 0);
  return w;
};
