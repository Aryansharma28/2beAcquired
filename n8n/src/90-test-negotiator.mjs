import { Workflow, webhook, respond, code } from "../lib.mjs";
import { negotiate, PRICED, OFFER_JS } from "./30-inbox.mjs";

// Test harness: run a simulated buyer conversation through the exact same agent + guardrails as W3,
// without touching Marktplaats. POST /tba/test-negotiator
// { item: {title, askPrice, floorPrice, goal}, stage?, messages: [{from: 'buyer'|'seller', text}], lastOffer?, conversationId?, pickupAddress? }
// Traced to LangWatch like production, labelled "test" (conversationId = the LangWatch thread, e.g. a scenario run).
export default (env, ids) => {
  const w = new Workflow("poof · Test negotiator (no side effects)", { errorWorkflow: ids.error });
  w.add("Simulated chat", webhook("tba/test-negotiator"));
  w.add("Needs a reply", code(OFFER_JS + `
const b = $json.body || {};
const { DateTime: DT } = { DateTime };
const now = DT.now().setZone('Europe/Amsterdam');
const slots = [1, 2].flatMap(d => [14, 19].map(h => { const s = now.plus({ days: d }).set({ hour: h, minute: 0, second: 0, millisecond: 0 }); return { start: s.toISO(), end: s.plus({ minutes: 30 }).toISO(), label: s.setLocale('nl').toFormat('ccc d LLL HH:mm') }; }));
const msgs = (b.messages || []).map((m, i) => ({ from: m.from === 'seller' ? 'seller' : 'buyer', text: m.text, ts: now.plus({ seconds: i }).toISO() }));
const buyerTail = []; for (let i = msgs.length - 1; i >= 0 && msgs[i].from === 'buyer'; i--) buyerTail.unshift(msgs[i].text);
return [{ json: {
  itemId: 'test', conversationId: String(b.conversationId || 'test'), platform: 'marktplaats', buyer: b.buyer || 'Test buyer', itemStatus: 'live',
  stage: b.stage || 'open', lastOffer: b.lastOffer ?? null, slots, detectedOffer: buyerTail.map(offerIn).filter(Boolean).at(-1) ?? null,
  pushes: msgs.filter(m => m.from === 'seller' && ${PRICED}.test(m.text || '')).length,
  context: {
    item: { title: 'IKEA POÄNG schommelstoel', description: 'Gebruikt, goede staat. Ophalen in Amsterdam.', condition: 'Gebruikt', askPrice: 40, floorPrice: 30, goal: 'week', pickupCity: 'Amsterdam', ...(b.item || {}) },
    conversation: { pushedOnce: msgs.some(m => m.from === 'seller' && ${PRICED}.test(m.text || '')), stage: b.stage || 'open', agreedPrice: b.lastOffer ?? null, pickup: null, messages: msgs },
    latestBuyerMessages: buyerTail, bids: [], freeSlots: slots.map(s => ({ start: s.start, label: s.label })),
    reservedForSomeoneElse: !!b.reservedForSomeoneElse,
  },
  pickupAddress: b.pickupAddress ?? 'Teststraat 1, Amsterdam',
} }];`));
  w.chain("Simulated chat", "Needs a reply");
  const decided = negotiate(w, env, "Needs a reply", "test");
  w.add("Result", respond("={{ { decision: $json, model: $('Sales agent (AI)').first().json.output, traceId: $json.traceId } }}"), { position: [w.x, 0] });
  w.link(decided, "Result");
  return w;
};
