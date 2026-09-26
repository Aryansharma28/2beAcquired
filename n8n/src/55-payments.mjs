import { Workflow, webhook, respond, code, tableGet, tableUpdate, stripe } from "../lib.mjs";

// W6 · Payments: the payment provider calls this when the payment link W5 sent (after the pickup was booked) is paid.
// Stripe can't send our X-Poof-Key, so the webhook is open and trusts nothing it receives: it only takes the event id
// and fetches that event from Stripe itself (STRIPE_SECRET_KEY; test mode needs no KvK).
const MARK_PAID = `
const p = $('Paid?').first().json;
if (!p.paid) return [];
const rows = $input.all().map(i => i.json).filter(r => r.itemId);
const row = rows.find(r => { try { const d = JSON.parse(r.data); return d.payment && (d.payment.id === p.linkId || r.itemId === p.itemId); } catch { return false; } });
if (!row) return [];
const item = JSON.parse(row.data);
if (item.payment?.status === 'paid') return [];   // providers retry webhooks: handle once
item.payment = { ...(item.payment || {}), status: 'paid', paidAt: new Date().toISOString(), paidAmount: p.amount, method: p.method, test: p.test };
item.sale = { ...(item.sale || {}), paid: true };
item.status = 'sold';
item.soldAt = item.soldAt || new Date().toISOString();
return [{ json: { itemId: row.itemId, data: JSON.stringify(item), amount: p.amount, method: p.method, test: p.test } }];`;

export default (env, ids) => {
  const w = new Workflow("poof · 6 Payments", { errorWorkflow: ids.error });
  w.add("Items", tableGet("items"), { executeOnce: true, position: [1300, 0] });
  w.add("Mark paid", code(MARK_PAID), { position: [1560, 0] });
  w.add("Save paid", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "sold", data: "={{ $json.data }}" }), { position: [1820, 0] });
  w.link("Items", "Mark paid");
  w.link("Mark paid", "Save paid");
  w.log("Save paid", "=Paid €{{ $('Mark paid').item.json.amount }} via {{ $('Mark paid').item.json.method }}{{ $('Mark paid').item.json.test ? ' (test mode)' : '' }}. Sold!", { type: "notify", itemId: "={{ $('Mark paid').item.json.itemId }}" });

  // Stripe: event → fetch the event from Stripe → paid Checkout Session of one of our payment links.
  w.add("Stripe event", webhook("tba/stripe", "POST", { auth: false }), { position: [0, -300] });
  w.add("Stripe OK", respond("={{ { received: true } }}"), { position: [260, -450] });
  w.link("Stripe event", "Stripe OK");
  if (env.STRIPE_SECRET_KEY) {
    w.add("Stripe event id", code(`const id = String($json.body?.id || ''); return /^evt_[A-Za-z0-9]+$/.test(id) ? [{ json: { id } }] : [];`), { position: [260, -300] });
    w.add("Ask Stripe", stripe(env, "GET", "=https://api.stripe.com/v1/events/{{ $json.id }}"), { position: [520, -300] });
    w.add("Paid?", code(`
const e = $json, s = e.data?.object || {};
const ok = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(e.type) && s.payment_status === 'paid' && !!s.payment_link;
return [{ json: { paid: ok, linkId: s.payment_link || null, itemId: s.metadata?.itemId || null, amount: (s.amount_total || 0) / 100,
  method: (s.payment_method_types || []).includes('ideal') ? 'iDEAL/card' : 'card', test: e.livemode === false } }];`), { position: [780, -300] });
    w.chain("Stripe event", "Stripe event id", "Ask Stripe", "Paid?", "Items");
  }

  return w;
};
