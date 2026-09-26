import { Workflow, schedule, code, codeEach, tableGet, tableInsert, actor, agent, chatModel, outputParser, ifTrue, callWorkflow, ntfy } from "../lib.mjs";

const SYSTEM = `You are the seller's autonomous negotiating agent for one second-hand item listed on Marktplaats (Netherlands).
You decide what to do with the buyer's latest message(s) and write the reply the seller would send.

Rules:
- Goal "max_price": hold firm, concede slowly (small steps), highlight value. Goal "fast": be flexible, close quickly at or above the floor.
- NEVER agree to a price below floorPrice. NEVER reveal the floor price or that you are an AI.
- An offer is any price the buyer proposes (e.g. "50?", "wil je 40 voor", "bod 60", a Marktplaats bid). Put it in "offer".
- Counter-offers must be >= floorPrice and <= askPrice. Put the number you ask for in "price".
- Accept when the offer is >= floorPrice and fits the goal (fast: accept quickly; max_price: accept once close to your last counter). Use action "accept" and set price to the agreed amount.
- If the buyer's final offer is below floorPrice and they will not move, use "ask_owner" (the owner decides). Write no reply text in that case.
- Scam signals (pays via a link / Tikkie from them, courier "pickup" arranged by them, wants WhatsApp/phone/email early, asks for bank details, overpaying) → action "decline", buyerType "scam", short polite reply without details.
- Questions (still available? dimensions? pickup?) → action "answer" using ONLY facts from the ad; if unknown say you will check.
- Lowballers (< 50% of ask): counter firmly but friendly.
- Reply in the buyer's language (usually Dutch), 1-3 short sentences, friendly and human, like a real Marktplaats seller. Pickup location: the seller's city (don't invent an address).`;

const SCHEMA = {
  type: "object",
  properties: {
    buyerType: { type: "string", enum: ["serious", "lowballer", "scam", "question"] },
    offer: { type: ["number", "null"], description: "Price the buyer offered in their latest message(s), else null" },
    action: { type: "string", enum: ["answer", "counter", "accept", "decline", "ask_owner", "wait"] },
    price: { type: ["number", "null"], description: "Counter or agreed price" },
    reply: { type: "string", description: "Message to send to the buyer (empty for ask_owner/wait)" },
    reasoning: { type: "string", description: "One sentence: why" },
  },
  required: ["buyerType", "offer", "action", "price", "reply", "reasoning"],
};

// W3 · Inbox: every few minutes read Marktplaats chats, let the negotiator agent decide, act, and log.
export default (env, ids) => {
  const w = new Workflow("TBA · 3 Inbox + negotiate", { errorWorkflow: ids.error });
  w.add("Every 2 min", schedule(Number(env.INBOX_MINUTES || 2)));
  w.add("Items", tableGet("items"));
  w.add("Active listings", code(`
const active = $input.all().map(i => i.json).filter(r => ['live', 'negotiating', 'needs_you'].includes(r.status))
  .map(r => ({ itemId: r.itemId, listings: (JSON.parse(r.data).listings || []).filter(l => l.platform === 'marktplaats' && l.listingId) }))
  .filter(a => a.listings.length);
if (!active.length) return [];
return [{ json: { listingIds: active.flatMap(a => a.listings.map(l => l.listingId)), count: active.length } }];`));
  w.add("Known messages", tableGet("messages"), { executeOnce: true });
  w.add("Conversations", tableGet("conversations"), { executeOnce: true });
  w.add("Read inbox (Apify)", actor(env, "={{ JSON.stringify({ action: 'inbox', listingIds: $('Active listings').first().json.listingIds, sinceHours: 72 }) }}", { timeout: 120 }), { executeOnce: true });
  w.chain("Every 2 min", "Items", "Active listings", "Known messages", "Conversations", "Read inbox (Apify)");

  const common = `
const rows = $('Items').all().map(i => i.json).filter(r => r.itemId);
const items = Object.fromEntries(rows.map(r => [r.itemId, { ...JSON.parse(r.data), status: r.status }]));
const byListing = {};
for (const it of Object.values(items)) for (const l of it.listings || []) if (l.listingId) byListing[String(l.listingId)] = it;
const known = new Set($('Known messages').all().map(i => String(i.json.msgId)).filter(Boolean));
const conv = Object.fromEntries($('Conversations').all().map(i => i.json).filter(c => c.conversationId).map(c => [c.conversationId, c]));
const threads = $('Read inbox (Apify)').all().map(i => i.json).filter(c => c.conversationId && byListing[String(c.listingId)]);
const sorted = (c) => (c.messages || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
const offerIn = (t) => { const m = String(t).replace(/\\./g, '').match(/(?:€|eur|euro|bod|bied|voor|for)\\s*(\\d{1,5})|(\\d{1,5})\\s*(?:€|euro|eur)|^\\s*(\\d{1,5})\\s*\\??\\s*$/i); return m ? Number(m[1] || m[2] || m[3]) : null; };`;

  // Branch A: store every new buyer message (so the app shows the full chat)
  w.add("New buyer messages", code(common + `
const out = [];
for (const c of threads) {
  const it = byListing[String(c.listingId)];
  for (const m of sorted(c)) if (m.from === 'buyer' && !known.has(String(m.id)))
    out.push({ json: { itemId: it.id, conversationId: c.conversationId, platform: 'marktplaats', buyer: c.buyer?.name || 'Buyer',
      msgId: String(m.id), from: 'buyer', text: m.text, ts: m.ts, offer: offerIn(m.text) } });
}
return out;`), { y: -220, position: [w.x, -220] });
  w.add("Store buyer messages", tableInsert("messages", {
    itemId: "={{ $json.itemId }}", conversationId: "={{ $json.conversationId }}", platform: "={{ $json.platform }}",
    buyer: "={{ $json.buyer }}", msgId: "={{ $json.msgId }}", from: "buyer", text: "={{ $json.text }}", ts: "={{ $json.ts }}",
    "offer:number": "={{ $json.offer }}",
  }), { position: [w.x, -220] });
  w.link("Read inbox (Apify)", "New buyer messages");
  w.link("New buyer messages", "Store buyer messages");

  // Branch B: conversations whose latest message is an unanswered buyer message → agent
  w.add("Needs a reply", code(common + `
const out = [];
for (const c of threads) {
  const it = byListing[String(c.listingId)];
  if (!['live', 'negotiating'].includes(it.status)) continue;
  const prev = conv[c.conversationId];
  if (prev && ['deal', 'declined', 'needs_you'].includes(prev.state)) continue;
  const msgs = sorted(c);
  const fresh = msgs.filter(m => m.from === 'buyer' && !known.has(String(m.id)));
  if (!fresh.length || msgs.at(-1).from !== 'buyer') continue;
  const bidOffers = (c.bids || []).map(b => Number(b.amount)).filter(Boolean);
  out.push({ json: {
    itemId: it.id, conversationId: c.conversationId, platform: 'marktplaats', buyer: c.buyer?.name || 'Buyer',
    lastOffer: prev?.lastOffer ?? null, detectedOffer: fresh.map(m => offerIn(m.text)).filter(Boolean).at(-1) ?? (bidOffers.length ? Math.max(...bidOffers) : null),
    context: {
      item: { title: it.title, description: it.description, condition: it.condition, askPrice: it.askPrice, floorPrice: it.floorPrice,
              goal: it.goal, marketRange: it.priceRange, delivery: it.delivery, listedAt: it.liveAt },
      conversation: msgs.map(m => ({ from: m.from === 'buyer' ? 'buyer' : 'seller', text: m.text, ts: m.ts })),
      latestBuyerMessages: fresh.map(m => m.text), bids: c.bids || [], lastOfferOnRecord: prev?.lastOffer ?? null,
    } } });
}
return out;`));
  w.link("Read inbox (Apify)", "Needs a reply");

  w.add("Negotiator (AI agent)", agent({ text: "={{ JSON.stringify($json.context) }}", system: SYSTEM }));
  w.add("Claude", chatModel(), { position: [w.x - 260, 240] });
  w.add("Decision format", outputParser(SCHEMA), { position: [w.x - 60, 240] });
  w.sub("Claude", "Negotiator (AI agent)", "ai_languageModel");
  w.sub("Decision format", "Negotiator (AI agent)", "ai_outputParser");
  w.link("Needs a reply", "Negotiator (AI agent)");

  // Deterministic guardrails on top of the model: the floor is law.
  w.add("Guardrails", codeEach(`
const ctx = $('Needs a reply').item.json;
const d = $json.output || {};
const floor = Number(ctx.context.item.floorPrice) || 0;
const ask = Number(ctx.context.item.askPrice) || floor;
const offer = d.offer ?? ctx.detectedOffer ?? null;
let action = d.action, price = d.price != null ? Math.round(d.price) : null, reply = d.reply || '', guard = null;
if (action === 'accept') {
  const deal = price ?? offer;
  if (deal == null || deal < floor) { action = 'ask_owner'; reply = ''; guard = 'accept below floor blocked (' + deal + ' < ' + floor + ')'; }
  else price = deal;
}
if (action === 'counter' && (price == null || price < floor)) { action = 'ask_owner'; reply = ''; guard = 'counter below floor blocked'; }
if (action === 'counter' && price > ask) price = ask;
if (action === 'wait') reply = '';
const state = action === 'accept' ? 'deal' : action === 'ask_owner' ? 'needs_you' : action === 'decline' ? 'declined' : 'open';
return { json: {
  itemId: ctx.itemId, conversationId: ctx.conversationId, platform: ctx.platform, buyer: ctx.buyer,
  action, price, offer, text: reply, state, deal: action === 'accept', lastOffer: offer ?? ctx.lastOffer,
  buyerType: d.buyerType, reasoning: d.reasoning + (guard ? ' [guardrail: ' + guard + ']' : ''),
  buyerMessage: ctx.context.latestBuyerMessages.join(' / '), title: ctx.context.item.title, floor,
} };`));
  w.link("Negotiator (AI agent)", "Guardrails");

  w.add("Log decision", tableInsert("decisions", {
    itemId: "={{ $json.itemId }}", conversationId: "={{ $json.conversationId }}", platform: "={{ $json.platform }}",
    buyerMessage: "={{ $json.buyerMessage }}", "offer:number": "={{ $json.offer }}", action: "={{ $json.action }}",
    reply: "={{ $json.text }}", reasoning: "={{ $json.reasoning }}",
  }), { position: [w.x - 260, -220] });
  w.link("Guardrails", "Log decision");
  w.log("Guardrails", "={{ $json.buyer }}{{ $json.offer ? ' offered €' + $json.offer : ' wrote' }} → {{ { answer: 'answered', counter: 'countered €' + $json.price, accept: 'deal at €' + $json.price, decline: 'declined (' + $json.buyerType + ')', ask_owner: 'asking you', wait: 'waiting' }[$json.action] }}", { type: "decision" });

  w.add("Act (send + save)", callWorkflow(ids.send, { wait: true }));
  w.link("Guardrails", "Act (send + save)");

  w.add("Owner needed?", ifTrue("={{ $json.state === 'needs_you' }}"));
  w.link("Guardrails", "Owner needed?");
  const approve = `${env.N8N_BASE_URL}/webhook/tba/approve`;
  w.add("Push: your call", ntfy(env, `{ title: 'Offer below your floor: €' + $json.offer, message: $json.buyer + ' offers €' + $json.offer + ' for "' + $json.title + '" (your floor is €' + $json.floor + '). Accept?', tags: ['moneybag'], priority: 4,
    actions: [
      { action: 'http', label: 'Accept €' + $json.offer, url: '${approve}', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: $json.itemId, conversationId: $json.conversationId, action: 'accept_offer', amount: $json.offer }), clear: true },
      { action: 'http', label: 'Decline', url: '${approve}', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: $json.itemId, conversationId: $json.conversationId, action: 'reject_offer' }), clear: true }
    ] }`));
  w.link("Owner needed?", "Push: your call", 0);
  return w;
};
