import { Workflow, subTrigger, codeEach, code, tableGet, tableUpdate, actor, ntfy } from "../lib.mjs";

// W5 · Sold: record the sale, delist on every platform, tell the owner.
export default (env, ids) => {
  const w = new Workflow("TBA · 5 Sold + delist", { errorWorkflow: ids.error });
  w.add("Deal closed", subTrigger());
  w.add("Get item", tableGet("items", { itemId: "={{ $json.itemId }}" }));
  w.add("Mark sold", codeEach(`
const deal = $('Deal closed').item.json;
const item = JSON.parse($json.data);
item.sale = { price: deal.price, platform: deal.platform, buyer: deal.buyer, conversationId: deal.conversationId, ts: new Date().toISOString() };
item.status = 'sold';
return { json: { itemId: $json.itemId, data: JSON.stringify(item), item, price: deal.price, buyer: deal.buyer } };`));
  w.add("Save sold", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "sold", data: "={{ $json.data }}" }));
  w.chain("Deal closed", "Get item", "Mark sold", "Save sold");
  w.log("Save sold", "=Deal at €{{ $('Mark sold').item.json.price }} with {{ $('Mark sold').item.json.buyer }}. Removing the ad everywhere", { type: "decision", itemId: "={{ $('Mark sold').item.json.itemId }}" });

  w.add("Listings to remove", code(`
return $('Mark sold').all().flatMap(i => (i.json.item.listings || []).filter(l => l.status === 'live' && l.listingId)
  .map(l => ({ json: { itemId: i.json.itemId, platform: l.platform, listingId: l.listingId } })));`));
  w.add("Delist on Marktplaats (Apify)", actor(env, "={{ JSON.stringify({ action: 'delist', listingId: $json.listingId, dryRun: " + (env.MP_DRY_RUN === "1") + " }) }}", { soft: true }));
  w.add("All removed", code(`
return $('Mark sold').all().map(i => {
  const item = i.json.item;
  item.listings = (item.listings || []).map(l => ({ ...l, status: 'removed' }));
  return { json: { itemId: i.json.itemId, data: JSON.stringify(item), title: item.title, price: i.json.price, platforms: item.listings.length } };
});`));
  w.add("Save removed", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "sold", data: "={{ $json.data }}" }));
  w.chain("Save sold", "Listings to remove", "Delist on Marktplaats (Apify)", "All removed", "Save removed");
  w.log("Save removed", "=Sold for €{{ $('All removed').item.json.price }}. Removed from every platform", { type: "notify", itemId: "={{ $('All removed').item.json.itemId }}" });
  w.add("Push: sold", ntfy(env, `{ title: 'Sold for €' + $('All removed').item.json.price, message: '"' + $('All removed').item.json.title + '" is sold. Removed everywhere.', tags: ['tada', 'moneybag'], priority: 4 }`));
  w.link("Save removed", "Push: sold");
  return w;
};
