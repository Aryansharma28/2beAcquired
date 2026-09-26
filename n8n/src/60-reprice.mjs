import { Workflow, schedule, code, codeEach, tableGet, tableUpdate, actor, ifTrue } from "../lib.mjs";

// W4 · Reprice: hourly, look at time online, views and interest vs the goal; lower the price (never below floor) or hold.
export default (env, ids) => {
  const w = new Workflow("TBA · 4 Reprice", { errorWorkflow: ids.error });
  const fastH = Number(env.REPRICE_FAST_HOURS || 6), slowH = Number(env.REPRICE_SLOW_HOURS || 24);
  w.add("Every hour", schedule(Number(env.REPRICE_MINUTES || 60)));
  w.add("Items", tableGet("items"));
  w.add("Conversations", tableGet("conversations"), { executeOnce: true });
  w.add("Candidates", code(`
const convs = $('Conversations').all().map(i => i.json);
const now = Date.now(), H = 3600e3;
return $('Items').all().map(i => i.json).filter(r => r.status === 'live').flatMap(r => {
  const it = JSON.parse(r.data);
  const mp = (it.listings || []).find(l => l.platform === 'marktplaats' && l.status === 'live');
  if (!mp) return [];
  const lastChange = Date.parse((it.priceHistory || []).at(-1)?.ts || it.liveAt || it.createdAt);
  const every = it.goal === 'fast' ? ${fastH} : ${slowH};
  if ((now - lastChange) < every * H) return [];
  if (it.askPrice <= it.floorPrice) return [];
  return [{ json: { itemId: r.itemId, item: it, listing: mp, conversations: convs.filter(c => c.itemId === r.itemId).length, hoursSinceChange: Math.round((now - lastChange) / H) } }];
});`));
  w.chain("Every hour", "Items", "Conversations", "Candidates");

  w.add("Views (Apify)", actor(env, "={{ JSON.stringify({ action: 'stats', listingUrl: $json.listing.url }) }}", { timeout: 60, soft: true }));
  w.add("Decide", codeEach(`
const c = $('Candidates').item.json, it = c.item;
const views = Number($json.views) || 0, favs = Number($json.favorites) || 0;
// many views but nobody writes → price is the problem → bigger step
const step = it.goal === 'fast' ? (views > 40 && !c.conversations ? 0.12 : 0.08) : (views > 60 && !c.conversations ? 0.07 : 0.05);
let next = Math.max(it.floorPrice, Math.round(it.askPrice * (1 - step)));
if (next >= 50) next = Math.max(it.floorPrice, Math.round(next / 5) * 5);
const change = next < it.askPrice;
const reason = views + ' views, ' + favs + ' saves, ' + c.conversations + ' chats in ' + c.hoursSinceChange + 'h';
return { json: { itemId: c.itemId, listingId: c.listing.listingId, old: it.askPrice, next, change, reason, item: it } };`));
  w.add("Lower price?", ifTrue("={{ $json.change }}"));
  w.chain("Candidates", "Views (Apify)", "Decide", "Lower price?");

  w.add("Update price (Apify)", actor(env, "={{ JSON.stringify({ action: 'update_price', listingId: $json.listingId, price: $json.next, dryRun: " + (env.MP_DRY_RUN === "1") + " }) }}"));
  w.add("New price", codeEach(`
const d = $('Decide').item.json, it = d.item;
it.askPrice = d.next;
it.listings = it.listings.map(l => l.platform === 'marktplaats' ? { ...l, price: d.next } : l);
(it.priceHistory ??= []).push({ ts: new Date().toISOString(), price: d.next, reason: d.reason });
return { json: { itemId: d.itemId, data: JSON.stringify(it), old: d.old, next: d.next, reason: d.reason } };`));
  w.add("Save price", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { data: "={{ $json.data }}" }));
  w.link("Lower price?", "Update price (Apify)", 0);
  w.chain("Update price (Apify)", "New price", "Save price");
  w.log("Save price", "=Lowered price €{{ $('New price').item.json.old }} → €{{ $('New price').item.json.next }} ({{ $('New price').item.json.reason }})", { type: "decision", itemId: "={{ $('New price').item.json.itemId }}" });
  return w;
};
