import { Workflow, subTrigger, code, tableGet, tableUpdate } from "../lib.mjs";

// W7 · Push: an agent event (live, offer answered, deal, pickup, paid, sold…) → a notification on the owner's phone.
// Called by log() in every workflow for events of type notify/decision (lib.mjs). Finds the item's owner and their
// push subscriptions (saved by tba/push-subscribe, 05-users), asks the app to send (POST /api/push/send, web-push with
// the VAPID key on Vercel) and forgets subscriptions the push service reports gone. Fails quietly: a push never blocks
// the agent.
const TITLE = `
const title = (type, text, name) => {
  const t = String(text || '');
  if (/^Live on/i.test(t)) return '🟢 ' + name + ' is live';
  if (/^Paid/i.test(t)) return '💶 Paid: ' + name;
  if (/sold|picked up/i.test(t)) return '🎉 Sold: ' + name;
  if (/offered/i.test(t)) return '💬 New offer: ' + name;
  if (/wrote/i.test(t)) return '💬 New message: ' + name;
  if (/removed/i.test(t)) return '👋 ' + name + ' is offline';
  if (/lowered price/i.test(t)) return '🏷️ Price lowered: ' + name;
  return name;
};`;

export default (env, ids) => {
  const w = new Workflow("poof · 7 Push", { errorWorkflow: ids.error });
  const appUrl = String(env.APP_URL || "https://poof-lovat.vercel.app").split("/").filter((s, i, a) => s || i < a.length - 1).join("/");
  w.add("Event", subTrigger());
  w.add("Items", tableGet("items"), { executeOnce: true });
  w.add("Users", tableGet("users"), { executeOnce: true });
  w.add("Who gets it", code(TITLE + `
const items = $('Items').all().map(i => i.json);
const users = $('Users').all().map(i => i.json);
const out = [];
for (const ev of $('Event').all().map(i => i.json)) {
  const row = items.find(r => r.itemId === ev.itemId);
  if (!row) continue;
  const item = JSON.parse(row.data || '{}');
  const user = users.find(u => u.userId === item.ownerId);
  const subs = user ? (JSON.parse(user.data || '{}').push || []) : [];
  if (!subs.length) continue;
  const name = String(item.title || item.name || 'Your item').slice(0, 60);
  out.push({ json: { userId: user.userId, subscriptions: subs, title: title(ev.type, ev.text, name),
    body: String(ev.text || '').slice(0, 180), url: '/item/' + ev.itemId, tag: ev.itemId } });
}
return out;`));
  w.add("Send (app)", ["n8n-nodes-base.httpRequest", 4.2, {
    method: "POST", url: `${appUrl}/api/push/send`,
    sendHeaders: true, headerParameters: { parameters: [{ name: "X-Poof-Key", value: env.POOF_APP_KEY || "" }] },
    sendBody: true, specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ subscriptions: $json.subscriptions, title: $json.title, body: $json.body, url: $json.url, tag: $json.tag }) }}",
    options: { timeout: 30000 },
  }, { onError: "continueRegularOutput" }]);
  w.add("Forget gone phones", code(`
const sent = $input.all();
const users = $('Users').all().map(i => i.json);
return $('Who gets it').all().map((w, k) => {
  const gone = (sent[k] && sent[k].json && sent[k].json.gone) || [];
  if (!gone.length) return null;
  const u = users.find(x => x.userId === w.json.userId);
  if (!u) return null;
  const d = JSON.parse(u.data || '{}');
  d.push = (d.push || []).filter(s => !gone.includes(s.endpoint));
  return { json: { userId: u.userId, data: JSON.stringify(d) } };
}).filter(Boolean);`));
  w.add("Save phones", tableUpdate("users", { userId: "={{ $json.userId }}" }, { data: "={{ $json.data }}" }));
  w.chain("Event", "Items", "Users", "Who gets it", "Send (app)", "Forget gone phones", "Save phones");
  return w;
};
