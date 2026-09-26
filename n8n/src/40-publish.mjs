import { Workflow, subTrigger, code, tableGet, tableUpdate, actor } from "../lib.mjs";

// W2 · Publish: put the ad live on Marktplaats with our own Apify actor (logged-in browser), and show it in the app.
export default (env, ids) => {
  const w = new Workflow("TBA · 2 Publish", { errorWorkflow: ids.error });
  w.add("Called with itemId", subTrigger());
  w.add("Get item", tableGet("items", { itemId: "={{ $json.itemId }}" }), { executeOnce: true });
  w.add("Mark publishing", code(`
const row = $input.all().map(i => i.json).find(r => r.itemId);
if (!row) throw new Error('Item not found');
if (!['ad_ready', 'publishing'].includes(row.status)) return [];   // already live / sold: nothing to do
const item = JSON.parse(row.data);
item.status = 'publishing';
return [{ json: { itemId: row.itemId, status: 'publishing', data: JSON.stringify(item), item } }];`));
  w.add("Save publishing", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "publishing", data: "={{ $json.data }}" }));
  w.chain("Called with itemId", "Get item", "Mark publishing", "Save publishing");
  w.log("Save publishing", "=Publishing on Marktplaats…", { itemId: "={{ $('Mark publishing').first().json.itemId }}" });

  w.add("Post on Marktplaats (Apify)", actor(env, `={{ JSON.stringify((() => { const it = $('Mark publishing').first().json.item; return {
    action: 'post', title: it.title, description: it.description, price: it.askPrice, categoryHint: it.category,
    condition: it.condition, delivery: 'pickup', priceType: 'Vraagprijs', allowBids: true, minBid: it.floorPrice, photoUrls: it.photos, useProxy: true, dryRun: ${env.MP_DRY_RUN === "1"} }; })()) }}`), { executeOnce: true });
  w.link("Save publishing", "Post on Marktplaats (Apify)");

  w.add("Live", code(`
const src = $('Mark publishing').first().json;
const res = $input.first().json;
const item = src.item;
item.listings = (item.listings || []).filter(l => l.platform !== 'marktplaats');
item.listings.push({ platform: 'marktplaats', status: res.url ? 'live' : 'error', url: res.url, listingId: String(res.listingId ?? ''), price: item.askPrice, dryRun: !!res.dryRun });
item.status = 'live';
item.liveAt = new Date().toISOString();
return [{ json: { itemId: src.itemId, status: 'live', data: JSON.stringify(item), title: item.title, url: res.url, price: item.askPrice, count: item.listings.filter(l => l.status === 'live').length } }];`));
  w.add("Save live", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "live", data: "={{ $json.data }}" }));
  w.chain("Post on Marktplaats (Apify)", "Live", "Save live");
  w.log("Save live", "=Live on Marktplaats at €{{ $('Live').first().json.price }}", { type: "notify", itemId: "={{ $('Live').first().json.itemId }}" });
  return w;
};
