import { Workflow, subTrigger, codeEach, code, tableGet, tableUpdate, actor, calendarCreate, HAS_CALENDAR } from "../lib.mjs";

// W5 · Close the deal: pickup booked → put it in the owner's calendar, record the sale, delist everywhere.
export default (env, ids) => {
  const w = new Workflow("poof · 5 Pickup + delist", { errorWorkflow: ids.error });
  w.add("Pickup booked", subTrigger());
  w.add("Get item", tableGet("items", { itemId: "={{ $json.itemId }}" }));
  w.add("Record sale", codeEach(`
const deal = $('Pickup booked').item.json;
const item = JSON.parse($json.data);
item.sale = { price: deal.price, platform: deal.platform, buyer: deal.buyer, conversationId: deal.conversationId, ts: new Date().toISOString() };
item.pickup = { start: deal.pickup.start, end: deal.pickup.end, label: deal.pickup.label, buyer: deal.buyer, platform: deal.platform };
return { json: { itemId: $json.itemId, item, price: deal.price, buyer: deal.buyer, pickup: deal.pickup, title: item.title } };`));
  w.chain("Pickup booked", "Get item", "Record sale");
  let last = "Record sale";

  if (HAS_CALENDAR) {
    w.add("Add to owner's calendar", calendarCreate({
      start: "={{ $json.pickup.start }}", end: "={{ $json.pickup.end }}",
      summary: "=Pickup: {{ $json.title }} → {{ $json.buyer }} (€{{ $json.price }})",
      description: "=Sold by your 2beAcquired agent on Marktplaats. Buyer: {{ $json.buyer }}. Price: €{{ $json.price }} (cash/Tikkie at pickup).",
      location: env.PICKUP_ADDRESS || "",
    }), { onError: "continueRegularOutput" });
    w.add("Calendar id", codeEach(`const r = $('Record sale').item.json; r.item.pickup.calendarEventId = $json.id || null; return { json: r };`));
    w.chain("Record sale", "Add to owner's calendar", "Calendar id");
    last = "Calendar id";
  }

  w.add("Save pickup", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "pickup_scheduled", data: "={{ JSON.stringify($json.item) }}" }));
  w.link(last, "Save pickup");
  w.log("Save pickup", `=Sold for €{{ $('${last}').item.json.price }} to {{ $('${last}').item.json.buyer }}. Pickup {{ $('${last}').item.json.pickup.label }}${HAS_CALENDAR ? ", added to your calendar" : ""}`, { type: "decision", itemId: `={{ $('${last}').item.json.itemId }}` });

  w.add("Listings to remove", code(`
return $('${last}').all().flatMap(i => (i.json.item.listings || []).filter(l => l.status === 'live' && l.listingId)
  .map(l => ({ json: { itemId: i.json.itemId, platform: l.platform, listingId: l.listingId, sessionStore: i.json.item.mpStore || 'mp-session' } })));`));
  w.add("Delist on Marktplaats (Apify)", actor(env, "={{ JSON.stringify({ action: 'delist', delistReason: 'sold_on_marktplaats', useProxy: true, sessionStore: $json.sessionStore, listingId: $json.listingId, dryRun: " + (env.MP_DRY_RUN === "1") + " }) }}", { soft: true }));
  w.add("All removed", code(`
return $('${last}').all().map(i => {
  const item = i.json.item;
  item.listings = (item.listings || []).map(l => ({ ...l, status: 'removed' }));
  return { json: { itemId: i.json.itemId, data: JSON.stringify(item) } };
});`));
  w.add("Save removed", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { data: "={{ $json.data }}" }));
  w.chain("Save pickup", "Listings to remove", "Delist on Marktplaats (Apify)", "All removed", "Save removed");
  w.log("Save removed", "=Removed from every platform", { type: "notify" });
  return w;
};
