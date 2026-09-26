import { Workflow, webhook, respond, code, tableGet, tableUpdate, callWorkflow, ifTrue } from "../lib.mjs";

// Screen 07 "Approve and sell": apply the owner's edits (if any) and hand over to the agent for good.
export default (env, ids) => {
  const w = new Workflow("poof · 1c Approve → publish", { errorWorkflow: ids.error });
  w.add("Approve and sell", webhook("tba/approve"));
  w.add("OK", respond("={{ { ok: true } }}"));
  w.add("Get item", tableGet("items", { itemId: "={{ $('Approve and sell').first().json.body.itemId }}" }), { executeOnce: true });
  w.add("Owner", tableGet("users", { userId: "={{ $('Approve and sell').first().json.headers['x-poof-user'] }}" }), { executeOnce: true });
  w.add("Apply edits", code(`
const req = $('Approve and sell').first().json;
const b = req.body;
const row = $('Get item').all().map(i => i.json).find(r => r.itemId);
if (!row || !['ad_ready', 'needs_connection', 'error'].includes(row.status)) return [];
const it = JSON.parse(row.data);
if (it.ownerId && it.ownerId !== req.headers['x-poof-user']) throw new Error('Not your item');
const user = $input.all().map(i => i.json).find(r => r.userId);
const u = user ? JSON.parse(user.data || '{}') : {};
if (b.title) it.title = String(b.title).slice(0, 60);
if (b.description) it.description = String(b.description).slice(0, 4000);
if (b.askPrice && Number(b.askPrice) >= it.floorPrice) { it.askPrice = Math.round(Number(b.askPrice)); it.pricePlan = [{ price: it.askPrice, from: new Date().toISOString() }]; }
it.approvedAt = new Date().toISOString();
const edited = ['title', 'description', 'askPrice'].filter(k => b[k]);
const connected = !!(u.mpConnected && u.mpStore);
it.mpStore = u.mpStore || null;
it.pickupAddress = u.pickupAddress || '';
it.pickupHours = u.pickupHours || 'anytime';
return [{ json: { itemId: row.itemId, data: JSON.stringify(it), edited, connected, status: connected ? 'ad_ready' : 'needs_connection' } }];`));
  w.add("Save approved", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "={{ $json.status }}", data: "={{ $json.data }}" }));
  w.add("Connected?", ifTrue("={{ $('Apply edits').first().json.connected }}"));
  w.add("Publish", callWorkflow(ids.publish));
  w.chain("Approve and sell", "OK", "Get item", "Owner", "Apply edits", "Save approved", "Connected?", "Publish");
  w.log("Apply edits", "={{ $json.connected ? 'You approved the ad' + ($json.edited.length ? ' (edited: ' + $json.edited.join(', ') + ')' : '') + '. The agent takes it from here' : 'Approved. Connect Marktplaats and it goes online right away' }}");
  return w;
};
