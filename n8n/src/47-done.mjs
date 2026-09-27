import { Workflow, webhook, respond, code, tableGet, tableUpdate, ifTrue, stripe, delistAfter } from "../lib.mjs";

// W1d · "Mark as picked up & paid": the buyer came by and paid cash, so the agreed deal becomes a sale.
// POST /tba/done { itemId } (X-Poof-Key + X-Poof-User). Only the owner, only from negotiating / deal /
// pickup_scheduled. Already sold → ok without side effects (idempotent). Stripe payments mark sold in W6 instead.
// Answers { ok: true, status: 'sold', alreadySold } or { ok: false, error } with 400 / 404 / 409.
const CHECK = `
const req = $('Picked up & paid').first().json;
const me = req.headers['x-poof-user'];
const itemId = String(req.body?.itemId || '');
const fail = (code, error) => [{ json: { ok: false, changed: false, code, response: { ok: false, error } } }];
if (!itemId) return fail(400, 'itemId is required');
const row = $('Get item').all().map(i => i.json).find(r => r.itemId === itemId);
if (!row || !me) return fail(404, 'not_found');
const item = JSON.parse(row.data || '{}');
if (item.ownerId && item.ownerId !== me) return fail(404, 'not_found');
if (['sold', 'delisted'].includes(row.status))
  return [{ json: { ok: true, changed: false, code: 200, itemId, response: { ok: true, status: 'sold', alreadySold: true } } }];
if (!['deal', 'pickup_scheduled', 'negotiating'].includes(row.status))
  return fail(409, "Can't mark this item as sold from status " + row.status);

const now = new Date().toISOString();
const convs = $('Conversations').all().map(i => i.json).filter(c => c.conversationId);
const conv = convs.find(c => c.state === 'pickup_scheduled') || convs.find(c => c.state === 'deal');
if (!item.sale || item.sale.price == null) {
  item.sale = { ...(item.sale || {}), price: Number(conv?.lastOffer ?? item.askPrice) || 0, platform: conv?.platform || item.pickup?.platform || 'marktplaats',
    buyer: item.pickup?.buyer || conv?.buyer, conversationId: conv?.conversationId, ts: now };
}
item.sale.paid = true;
const openLink = item.payment?.provider === 'stripe' && item.payment.status !== 'paid' && item.payment.id ? item.payment.id : null;
if (item.payment?.status !== 'paid') item.payment = { ...(item.payment || {}), status: 'paid', method: 'cash', paidAt: now };
item.soldAt = item.soldAt || now;
return [{ json: { ok: true, changed: true, code: 200, itemId, item, data: JSON.stringify(item), openLink,
  price: item.sale.price, buyer: item.sale.buyer || 'the buyer', response: { ok: true, status: 'sold', alreadySold: false } } }];`;

export default (env, ids) => {
  const w = new Workflow("poof · 1d Picked up & paid → sold", { errorWorkflow: ids.error });
  w.add("Picked up & paid", webhook("tba/done"));
  w.add("Get item", tableGet("items", { itemId: "={{ $('Picked up & paid').first().json.body.itemId || 'none' }}" }), { executeOnce: true });
  w.add("Conversations", tableGet("conversations", { itemId: "={{ $('Picked up & paid').first().json.body.itemId || 'none' }}" }), { executeOnce: true });
  w.add("Check", code(CHECK));
  w.add("Changed?", ifTrue("={{ $json.changed }}"));
  w.chain("Picked up & paid", "Get item", "Conversations", "Check", "Changed?");

  w.add("Save sold", tableUpdate("items", { itemId: "={{ $('Check').first().json.itemId }}" }, { status: "sold", data: "={{ $('Check').first().json.data }}" }), { executeOnce: true });
  w.add("Respond", respond("={{ $('Check').first().json.response }}", "={{ $('Check').first().json.code }}"), { y: 200 });
  w.link("Changed?", "Save sold", 0);
  w.link("Changed?", "Respond", 1);
  w.link("Save sold", "Respond");
  w.log("Save sold", "=Marked as picked up & paid: sold for €{{ $('Check').first().json.price }} to {{ $('Check').first().json.buyer }}",
    { type: "notify", itemId: "={{ $('Check').first().json.itemId }}" });

  // The ad may still be live (sold before a pickup was booked): take it down like W5 does after a booking.
  delistAfter(w, env, "Save sold", "Check");

  // Paid in cash: close the Stripe payment link W5 sent, so the buyer can't pay a second time.
  if (env.STRIPE_SECRET_KEY) {
    w.add("Open pay link?", code(`const id = $('Check').first().json.openLink; return id ? [{ json: { id } }] : [];`), { y: 400 });
    w.add("Close pay link (Stripe)", stripe(env, "POST", "=https://api.stripe.com/v1/payment_links/{{ $json.id }}", [["active", "false"]]),
      { y: 400, onError: "continueRegularOutput" });
    w.chain("Save sold", "Open pay link?", "Close pay link (Stripe)");
  }
  return w;
};
