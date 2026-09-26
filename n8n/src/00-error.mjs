import { Workflow, errorTrigger, code, tableInsert, tableUpdate, ntfy } from "../lib.mjs";

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
    text: "={{ $json.human ? 'Needs you: ' : 'Hit a snag, will retry: ' }}{{ $json.kind }} in {{ $json.workflow }} → {{ $json.lastNode }}",
    meta: "={{ JSON.stringify({ msg: $json.msg, url: $json.url }) }}",
  }));
  w.add("Tell owner", ntfy(env, `$json.human
    ? { title: 'Your selling agent needs you', message: $json.kind === 'captcha' ? 'Marktplaats showed a captcha. Open the login helper once to continue.' : 'Marktplaats session expired. Log in once and I will carry on.', tags: ['warning'], priority: 4 }
    : { title: 'Agent hit a snag (handling it)', message: $json.workflow + ': ' + $json.msg, tags: ['hammer_and_wrench'], priority: 2 }`));
  w.chain("On any failure", "Classify", "Log to item", "Tell owner");
  return w;
};
