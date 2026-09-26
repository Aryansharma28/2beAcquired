import { Workflow, webhook, respond, code, tableGet, tableUpdate, mollie } from "../lib.mjs";

// W6 · Payments: Mollie calls this when a payment link (sent by W5 after the pickup is booked) changes.
// Mollie can't send our X-Poof-Key, so the webhook is open and trusts nothing it receives: it only takes the id
// and asks Mollie itself what that payment (tr_…) or payment link (pl_…) is and whether it is paid.
export default (env, ids) => {
  const w = new Workflow("poof · 6 Payments (Mollie)", { errorWorkflow: ids.error });
  if (!env.MOLLIE_API_KEY) {
    w.add("Payment update", webhook("tba/mollie", "POST", { auth: false }));
    w.add("Not configured", respond("={{ { ok: true, note: 'MOLLIE_API_KEY not set' } }}"));
    w.link("Payment update", "Not configured");
    return w;
  }
  w.add("Payment update", webhook("tba/mollie", "POST", { auth: false }));
  w.add("OK", respond("={{ { ok: true } }}"));   // Mollie only needs a 200
  w.add("Valid id", code(`
const id = String($json.body?.id || '');
return /^(tr|pl)_[A-Za-z0-9]+$/.test(id) ? [{ json: { id } }] : [];`));
  w.add("Ask Mollie", mollie(env, "GET", "=https://api.mollie.com/v2/{{ $json.id.startsWith('tr_') ? 'payments' : 'payment-links' }}/{{ $json.id }}"));
  w.add("Items", tableGet("items"), { executeOnce: true });
  w.add("Mark paid", code(`
const m = $('Ask Mollie').first().json;
const paid = m.resource === 'payment' ? m.status === 'paid' : !!m.paidAt;
if (!paid) return [];
// Match the item: our payment link id, or the item id we put in the description.
const linkId = m.resource === 'payment-link' ? m.id : (m.paymentLinkId || null);
const rows = $input.all().map(i => i.json).filter(r => r.itemId);
const row = rows.find(r => { try { const d = JSON.parse(r.data); return d.payment && (d.payment.id === linkId || (m.description || '').includes(r.itemId)); } catch { return false; } });
if (!row) return [];
const item = JSON.parse(row.data);
if (item.payment?.status === 'paid') return [];   // Mollie retries webhooks: handle once
const amount = Number(m.amount?.value ?? item.payment?.amount ?? 0);
item.payment = { ...(item.payment || {}), status: 'paid', paidAt: m.paidAt || new Date().toISOString(), paidAmount: amount, method: m.method || 'ideal', mode: m.mode || item.payment?.mode || null };
item.sale = { ...(item.sale || {}), paid: true };
item.status = 'sold';
item.soldAt = item.soldAt || new Date().toISOString();
return [{ json: { itemId: row.itemId, data: JSON.stringify(item), amount, test: m.mode === 'test' } }];`));
  w.add("Save paid", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "sold", data: "={{ $json.data }}" }));
  w.chain("Payment update", "Valid id", "Ask Mollie", "Items", "Mark paid", "Save paid");
  w.link("Payment update", "OK");
  w.log("Save paid", "=Paid €{{ $('Mark paid').item.json.amount }} via iDEAL{{ $('Mark paid').item.json.test ? ' (Mollie test mode)' : '' }}. Sold!", { type: "notify", itemId: "={{ $('Mark paid').item.json.itemId }}" });
  return w;
};
