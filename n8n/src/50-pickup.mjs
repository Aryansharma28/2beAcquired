import { Workflow, subTrigger, codeEach, code, tableGet, tableUpdate, tableInsert, actor, stripe, calendarCreate, HAS_CALENDAR } from "../lib.mjs";

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
return $('${last}').all().filter(i => i.json.item.mpStore).flatMap(i => (i.json.item.listings || []).filter(l => l.status === 'live' && l.listingId)
  .map(l => ({ json: { itemId: i.json.itemId, platform: l.platform, listingId: l.listingId, sessionStore: i.json.item.mpStore } })));`));
  w.add("Delist on Marktplaats (Apify)", actor(env, "={{ JSON.stringify({ action: 'delist', delistReason: 'sold_on_marktplaats', useProxy: true, sessionStore: $json.sessionStore, listingId: $json.listingId, dryRun: " + (env.MP_DRY_RUN === "1") + " }) }}", { soft: true, local: true }));
  // Re-read the items: the payment branch may have saved to them meanwhile.
  w.add("Fresh items", tableGet("items"), { executeOnce: true });
  w.add("All removed", code(`
const fresh = Object.fromEntries($('Fresh items').all().map(r => [r.json.itemId, r.json]));
return $('${last}').all().map(i => {
  const item = fresh[i.json.itemId] ? JSON.parse(fresh[i.json.itemId].data) : i.json.item;
  item.listings = (item.listings || []).map(l => ({ ...l, status: 'removed' }));
  return { json: { itemId: i.json.itemId, data: JSON.stringify(item) } };
});`));
  w.add("Save removed", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { data: "={{ $json.data }}" }));
  w.chain("Save pickup", "Listings to remove", "Delist on Marktplaats (Apify)", "Fresh items", "All removed", "Save removed");
  w.log("Save removed", "=Removed from every platform", { type: "notify" });

  // Payment: once the pickup is booked the buyer gets a payment link for the agreed price (cash at pickup stays
  // possible). Stripe Payment Links (STRIPE_SECRET_KEY; test mode needs no KvK). Paid → W6 marks it sold.
  if (env.STRIPE_SECRET_KEY) {
      w.add("Price (Stripe)", stripe(env, "POST", "https://api.stripe.com/v1/prices",
        `={{ 'currency=eur&unit_amount=' + Math.round(Number($('${last}').item.json.price) * 100) + '&product_data[name]=' + encodeURIComponent($('${last}').item.json.title.slice(0, 80)) + '&metadata[itemId]=' + $('${last}').item.json.itemId }}`),
        { onError: "continueRegularOutput" });
      w.add("Payment link (Stripe)", stripe(env, "POST", "https://api.stripe.com/v1/payment_links",
        `={{ 'line_items[0][price]=' + $json.id + '&line_items[0][quantity]=1&metadata[itemId]=' + $('${last}').item.json.itemId + '&after_completion[type]=hosted_confirmation&after_completion[hosted_confirmation][custom_message]=' + encodeURIComponent('Betaald! Tot bij het ophalen.') }}`),
        { onError: "continueRegularOutput" });
      w.link("Save pickup", "Price (Stripe)");
      w.link("Price (Stripe)", "Payment link (Stripe)");
    const linkNode = "Payment link (Stripe)";
    w.add("Pay message", code(`
const deals = $('${last}').all();
return $input.all().map((i, k) => {
  const r = deals[k] ? deals[k].json : null;
  const url = i.json.url;
  if (!r || !url) return null;   // provider failed: no link, cash at pickup still works
  const item = r.item;
  item.payment = { provider: 'stripe', id: i.json.id, url, amount: r.price, status: 'open', test: i.json.livemode === false, createdAt: new Date().toISOString() };
  return { json: { itemId: r.itemId, data: JSON.stringify(item), sessionStore: item.mpStore, conversationId: item.sale.conversationId,
    platform: item.sale.platform, buyer: item.sale.buyer, price: r.price, url,
    text: 'Betalen kan contant bij het ophalen, of alvast online (iDEAL of kaart): ' + url } };
}).filter(Boolean);`));
    w.add("Save payment link", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { data: "={{ $json.data }}" }));
    w.add("Send pay link", actor(env, "={{ JSON.stringify({ action: 'reply', useProxy: true, sessionStore: $('Pay message').item.json.sessionStore, conversationId: $('Pay message').item.json.conversationId, text: $('Pay message').item.json.text }) }}", { timeout: 90, soft: true, local: true }));
    w.add("Store pay message", tableInsert("messages", {
      itemId: "={{ $('Pay message').item.json.itemId }}", conversationId: "={{ $('Pay message').item.json.conversationId }}", platform: "={{ $('Pay message').item.json.platform }}",
      buyer: "={{ $('Pay message').item.json.buyer }}", msgId: "={{ 'agent_pay_' + Date.now() }}", from: "agent", text: "={{ $('Pay message').item.json.text }}",
      ts: "={{ $now.toISO() }}", "offer:number": "={{ $('Pay message').item.json.price }}",
    }));
    w.chain(linkNode, "Pay message", "Save payment link", "Send pay link", "Store pay message");
    w.log("Save payment link", "=Payment link sent to the buyer (€{{ $('Pay message').item.json.price }})", { itemId: "={{ $('Pay message').item.json.itemId }}" });
  }
  return w;
};
