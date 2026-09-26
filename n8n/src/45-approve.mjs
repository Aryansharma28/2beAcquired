import { Workflow, webhook, respond, code, tableGet, tableUpdate, callWorkflow } from "../lib.mjs";

// Screen 07 "Approve and sell": apply the owner's edits (if any) and hand over to the agent for good.
export default (env, ids) => {
  const w = new Workflow("TBA · 1c Approve → publish", { errorWorkflow: ids.error });
  w.add("Approve and sell", webhook("tba/approve"));
  w.add("OK", respond("={{ { ok: true } }}"));
  w.add("Get item", tableGet("items", { itemId: "={{ $('Approve and sell').first().json.body.itemId }}" }), { executeOnce: true });
  w.add("Apply edits", code(`
const b = $('Approve and sell').first().json.body;
const row = $input.all().map(i => i.json).find(r => r.itemId);
if (!row || row.status !== 'ad_ready') return [];
const it = JSON.parse(row.data);
if (b.title) it.title = String(b.title).slice(0, 60);
if (b.description) it.description = String(b.description).slice(0, 4000);
if (b.askPrice && Number(b.askPrice) >= it.floorPrice) { it.askPrice = Math.round(Number(b.askPrice)); it.pricePlan = [{ price: it.askPrice, from: new Date().toISOString() }]; }
it.approvedAt = new Date().toISOString();
const edited = ['title', 'description', 'askPrice'].filter(k => b[k]);
return [{ json: { itemId: row.itemId, data: JSON.stringify(it), edited } }];`));
  w.add("Save approved", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { data: "={{ $json.data }}" }));
  w.add("Publish", callWorkflow(ids.publish));
  w.chain("Approve and sell", "OK", "Get item", "Apply edits", "Save approved", "Publish");
  w.log("Apply edits", "=You approved the ad{{ $json.edited.length ? ' (edited: ' + $json.edited.join(', ') + ')' : '' }}. The agent takes it from here");
  return w;
};
