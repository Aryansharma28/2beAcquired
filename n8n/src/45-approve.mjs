import { Workflow, webhook, respond, code, tableGet, ifTrue, callWorkflow } from "../lib.mjs";

// Owner actions from the app or a push notification button: publish now, accept / decline / counter an offer.
export default (env, ids) => {
  const w = new Workflow("TBA · Owner actions", { errorWorkflow: ids.error });
  w.add("Owner action", webhook("tba/approve"));
  w.add("OK", respond("={{ { ok: true } }}"));
  w.add("Publish?", ifTrue("={{ $('Owner action').first().json.body.action === 'publish' }}"));
  w.chain("Owner action", "OK", "Publish?");

  w.add("Publish input", code(`return [{ json: { itemId: $('Owner action').first().json.body.itemId } }];`), { y: -160 });
  w.add("Publish", callWorkflow(ids.publish), { y: -160 });
  w.link("Publish?", "Publish input", 0);
  w.link("Publish input", "Publish");

  w.x -= 520;
  w.add("Conversation", tableGet("conversations", { conversationId: "={{ $('Owner action').first().json.body.conversationId }}" }), { y: 160, executeOnce: true });
  w.add("Owner decision", code(`
const b = $('Owner action').first().json.body;
const c = $input.all().map(i => i.json).find(r => r.conversationId) || {};
const amount = Math.round(Number(b.amount ?? c.lastOffer) || 0);
const base = { itemId: b.itemId, conversationId: b.conversationId, platform: c.platform || 'marktplaats', buyer: c.buyer || 'Buyer', lastOffer: c.lastOffer ?? null };
if (b.action === 'accept_offer') return [{ json: { ...base, text: 'Deal, €' + amount + ' is goed! Wanneer wil je het komen ophalen?', state: 'deal', deal: true, price: amount } }];
if (b.action === 'counter_offer') return [{ json: { ...base, text: 'Voor €' + amount + ' mag je hem hebben.', state: 'open', deal: false, price: amount } }];
if (b.action === 'reject_offer') return [{ json: { ...base, text: 'Bedankt voor je bod, maar daar ga ik helaas niet mee akkoord.', state: 'declined', deal: false, price: null } }];
throw new Error('Unknown action ' + b.action);`), { y: 160 });
  w.add("Act (send + save)", callWorkflow(ids.send, { wait: true }), { y: 160 });
  w.link("Publish?", "Conversation", 1);
  w.chain("Conversation", "Owner decision", "Act (send + save)");
  w.log("Owner decision", "=You decided: {{ { deal: 'accept €' + $json.price, open: 'counter €' + $json.price, declined: 'decline' }[$json.state] }}", { type: "decision" });
  return w;
};
