import { Workflow, schedule, code, codeEach, tableGet, tableInsert, actor, agent, chatModel, outputParser, callWorkflow, calendarEvents, HAS_CALENDAR } from "../lib.mjs";

export const SYSTEM = `You are an autonomous agent selling one second-hand item on Marktplaats (Netherlands) for its owner. The owner is never asked anything: you handle the whole sale yourself, from first message to pickup.
The owner set a minimum price (floorPrice, never go below it, never reveal it) and a goal:
- goal "week": sell fast. Accept ANY offer >= floorPrice immediately.
- goal "two_weeks": accept offers >= (floorPrice + askPrice) / 2 immediately; lower offers (still >= floorPrice) get a counter halfway, accept on the second round.
- goal "no_rush": hold out; accept offers >= 90% of askPrice; otherwise counter close to askPrice, conceding slowly.

Stages (conversation.stage):
- "open": negotiate.
  - Offer acceptable for the goal → ACCEPT (action "accept", price = the offer). In the same reply propose 2 or 3 pickup times picked from freeSlots (use their "label").
  - Offer below floorPrice → action "counter" with price between floorPrice and askPrice (first time you can meet halfway; if they push back, go to floorPrice). Never reveal the floor.
  - Questions (still available? size? condition?) → action "answer" using ONLY facts stated in the ad. If the ad does not say (stains, exact size, smoke-free…), never guess: say you will check and that they are welcome to look at it at pickup. Invite an offer.
  - Buyer says they want it at the asking price → "accept" with price = askPrice and propose pickup times.
- "deal": price is agreed, you need a pickup time.
  - Buyer picks or suggests a time that matches one of freeSlots → action "confirm_pickup", pickupStart = that slot's "start" (copy exactly). Reply confirming day and time and give the pickup address (pickupAddress).
  - Otherwise → action "propose_pickup" with 2-3 labels from freeSlots.
- "pickup_scheduled": answer logistics briefly (action "answer"); never change the price.
- If reservedForSomeoneElse is true: politely say it is already sold/reserved (action "decline").

Scam signals (buyer's own payment link / Tikkie trick, courier arranged by buyer, asks for WhatsApp/phone/email/bank details early, overpaying) → action "decline", buyerType "scam", short reply without details.
Write like a real, friendly Dutch Marktplaats seller: buyer's language (usually Dutch), 1-3 short sentences, no emojis, never mention being an AI.`;

export const SCHEMA = {
  type: "object",
  properties: {
    buyerType: { type: "string", enum: ["serious", "lowballer", "scam", "question"] },
    offer: { type: ["number", "null"], description: "Price the buyer offered in their latest message(s), else null" },
    action: { type: "string", enum: ["answer", "counter", "accept", "propose_pickup", "confirm_pickup", "decline", "wait"] },
    price: { type: ["number", "null"], description: "Counter or agreed price" },
    pickupStart: { type: ["string", "null"], description: "For confirm_pickup: the exact 'start' of the chosen free slot" },
    reply: { type: "string", description: "Message to send to the buyer" },
    reasoning: { type: "string", description: "One sentence: why" },
  },
  required: ["buyerType", "offer", "action", "price", "pickupStart", "reply", "reasoning"],
};

// Deterministic guardrails on top of the model (shared with the test harness).
export const GUARDRAILS = `
const ctx = $('Needs a reply').item.json;
const d = $json.output || {};
const floor = Number(ctx.context.item.floorPrice) || 0;
const ask = Number(ctx.context.item.askPrice) || floor;
const offer = d.offer ?? ctx.detectedOffer ?? null;
let action = d.action, price = d.price != null ? Math.round(d.price) : null, reply = d.reply || '', guard = null, pickup = null;
if (action === 'accept') {
  price = price ?? offer;
  if (price == null || price < floor) { action = 'counter'; price = floor; reply = 'Voor €' + floor + ' mag je hem hebben, lager ga ik helaas niet.'; guard = 'accept below minimum turned into counter at minimum'; }
}
if (action === 'counter') {
  if (price == null || price < floor) { price = floor; reply = 'Voor €' + floor + ' mag je hem hebben, lager ga ik helaas niet.'; guard = guard || 'counter raised to minimum'; }
  if (price > ask) price = ask;
  if (offer != null && offer >= floor && (ctx.context.item.goal || 'week') === 'week') { action = 'accept'; price = offer; guard = 'sell-this-week: offer at/above minimum → accepted'; }
}
if (action === 'confirm_pickup') {
  const s = ctx.slots.find(s => s.start === d.pickupStart) || ctx.slots.find(s => Math.abs(Date.parse(s.start) - Date.parse(d.pickupStart)) < 31 * 60e3);
  if (!s || ctx.stage === 'open') { action = 'propose_pickup'; guard = 'pickup time not in free slots'; reply = 'Ik kan ' + ctx.slots.slice(0, 3).map(s => s.label).join(', of ') + '. Wat past jou?'; }
  else pickup = { start: s.start, end: s.end, label: s.label };
}
if (ctx.context.reservedForSomeoneElse && ['accept', 'confirm_pickup', 'counter'].includes(action)) { action = 'decline'; reply = 'Sorry, hij is helaas al verkocht.'; guard = 'already sold to another buyer'; }
if (action === 'wait') reply = '';
const state = action === 'accept' ? 'deal' : action === 'confirm_pickup' ? 'pickup_scheduled' : action === 'decline' ? 'declined'
  : ['deal', 'pickup_scheduled'].includes(ctx.stage) ? ctx.stage : 'open';
return { json: {
  itemId: ctx.itemId, conversationId: ctx.conversationId, platform: ctx.platform, buyer: ctx.buyer, itemStatus: ctx.itemStatus, sessionStore: ctx.sessionStore,
  action, price, offer, text: reply, state, pickup, lastOffer: action === 'accept' ? price : (offer ?? ctx.lastOffer),
  buyerType: d.buyerType, reasoning: (d.reasoning || '') + (guard ? ' [guardrail: ' + guard + ']' : ''),
  buyerMessage: ctx.context.latestBuyerMessages.join(' / '),
} };`;

// W3 · Inbox: every few minutes read Marktplaats chats, let the agent decide and act, log everything.
export default (env, ids) => {
  const w = new Workflow("poof · 3 Inbox + negotiate", { errorWorkflow: ids.error });
  w.add("Every 2 min", schedule(Number(env.INBOX_MINUTES || 2)));
  w.add("Items", tableGet("items"));
  w.add("Active listings", code(`
const active = $input.all().map(i => i.json).filter(r => ['live', 'negotiating', 'deal', 'pickup_scheduled'].includes(r.status))
  .map(r => ({ itemId: r.itemId, listings: (JSON.parse(r.data).listings || []).filter(l => l.platform === 'marktplaats' && l.listingId) }))
  .filter(a => a.listings.length);
const byStore = {};
for (const r of $('Items').all().map(i => i.json)) {
  if (!['live', 'negotiating', 'deal', 'pickup_scheduled'].includes(r.status)) continue;
  const it = JSON.parse(r.data);
  const ids = (it.listings || []).filter(l => l.platform === 'marktplaats' && l.listingId).map(l => l.listingId);
  if (!ids.length) continue;
  const store = it.mpStore || 'mp-session';
  (byStore[store] ??= []).push(...ids);
}
return Object.entries(byStore).map(([store, listingIds]) => ({ json: { store, listingIds } }));`));
  w.add("Known messages", tableGet("messages"), { executeOnce: true });
  w.add("Conversations", tableGet("conversations"), { executeOnce: true });
  w.add("Read inbox (Apify)", actor(env, "={{ JSON.stringify({ action: 'inbox', useProxy: true, sellingOnly: true, includeBids: true, sessionStore: $json.store, listingIds: $json.listingIds, sinceHours: 72 }) }}", { timeout: 120 }));
  w.add("Users", tableGet("users"), { executeOnce: true });
  w.chain("Every 2 min", "Items", "Known messages", "Conversations", "Users", "Active listings", "Read inbox (Apify)");

  const common = `
const rows = $('Items').all().map(i => i.json).filter(r => r.itemId);
const items = Object.fromEntries(rows.map(r => [r.itemId, { ...JSON.parse(r.data), status: r.status }]));
const byListing = {};
for (const it of Object.values(items)) for (const l of it.listings || []) if (l.listingId) byListing[String(l.listingId)] = it;
const known = new Set($('Known messages').all().map(i => String(i.json.msgId)).filter(Boolean));
const convRows = $('Conversations').all().map(i => i.json).filter(c => c.conversationId);
const conv = Object.fromEntries(convRows.map(c => [c.conversationId, c]));
const threads = $('Read inbox (Apify)').all().map(i => i.json).filter(c => c.conversationId && byListing[String(c.listingId)]);
const sorted = (c) => (c.messages || []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
const offerIn = (t) => { const m = String(t).replace(/\\./g, '').match(/(?:€|eur|euro|bod|bied|voor|for)\\s*(\\d{1,5})|(\\d{1,5})\\s*(?:€|euro|eur)|^\\s*(\\d{1,5})\\s*\\??\\s*$/i); return m ? Number(m[1] || m[2] || m[3]) : null; };`;

  // Branch A: store every new buyer message so the app shows the full chat
  w.add("New buyer messages", code(common + `
const out = [];
for (const c of threads) {
  const it = byListing[String(c.listingId)];
  for (const m of sorted(c)) if (m.from === 'buyer' && !known.has(String(m.id)))
    out.push({ json: { itemId: it.id, conversationId: c.conversationId, platform: 'marktplaats', buyer: c.buyer?.name || 'Buyer',
      msgId: String(m.id), text: m.text, ts: m.ts, offer: offerIn(m.text) } });
}
return out;`), { position: [w.x, -240] });
  w.add("Store buyer messages", tableInsert("messages", {
    itemId: "={{ $json.itemId }}", conversationId: "={{ $json.conversationId }}", platform: "={{ $json.platform }}",
    buyer: "={{ $json.buyer }}", msgId: "={{ $json.msgId }}", from: "buyer", text: "={{ $json.text }}", ts: "={{ $json.ts }}",
    "offer:number": "={{ $json.offer }}",
  }), { position: [w.x, -240] });
  w.link("Read inbox (Apify)", "New buyer messages");
  w.link("New buyer messages", "Store buyer messages");

  // Owner's free pickup slots: Google Calendar if connected, else default evening/weekend windows.
  if (HAS_CALENDAR) {
    w.add("Owner calendar", calendarEvents("={{ $now.toISO() }}", "={{ $now.plus({ days: 4 }).toISO() }}"), { executeOnce: true });
    w.link("Read inbox (Apify)", "Owner calendar");
  }
  w.add("Free pickup slots", code(`
const zone = 'Europe/Amsterdam';
const busy = ${HAS_CALENDAR ? "$('Owner calendar').all().map(i => i.json).filter(e => e.start)" : "[]"}
  .map(e => [DateTime.fromISO(e.start.dateTime || e.start.date, { zone }), DateTime.fromISO(e.end.dateTime || e.end.date, { zone })]);
const now = DateTime.now().setZone(zone);
// Pickup windows per preference: [allowed weekdays (1=Mon..7=Sun), fromHour, toHour]
const WINDOWS = { weekday_evenings: [[1, 2, 3, 4, 5], 18, 21], weekend: [[6, 7], 10, 18], anytime: [[1, 2, 3, 4, 5, 6, 7], 10, 21] };
// The app sends labels like "Weekday evenings", "Weekend daytime", "Anytime 10–21" (multi-select).
const keyOf = (l) => /evening/i.test(l) ? 'weekday_evenings' : /weekend/i.test(l) ? 'weekend' : 'anytime';
const slotsFor = (prefs, useCalendar) => {
  const list = (Array.isArray(prefs) ? prefs : prefs ? [prefs] : ['anytime']).map(keyOf);
  const wins = (list.length ? list : ['anytime']).map(k => WINDOWS[k]);
  const out = [];
  for (let d = 0; d < 7 && out.length < 8; d++) {
    const day = now.plus({ days: d }).startOf('day');
    const w = wins.find(([days]) => days.includes(day.weekday));
    if (!w) continue;
    const [, h0, h1] = w;
    let perDay = 0;
    for (let h = h0; h < h1 && perDay < 3; h += 0.5) {
      const s = day.plus({ minutes: h * 60 }), e = s.plus({ minutes: 30 });
      if (s < now.plus({ hours: 2 })) continue;
      if (useCalendar && busy.some(([bs, be]) => s < be && e > bs)) continue;
      out.push({ start: s.toISO(), end: e.toISO(), label: s.setLocale('nl').toFormat('ccc d LLL HH:mm') });
      perDay++; h += 2.5; // spread the options over the day
    }
  }
  return out;
};
const users = Object.fromEntries($('Users').all().map(i => i.json).filter(u => u.userId).map(u => [u.userId, JSON.parse(u.data || '{}')]));
const byOwner = {};
for (const [id, u] of Object.entries(users)) byOwner[id] = slotsFor(u.pickupHours, ${HAS_CALENDAR} && id === '${env.OWNER_USER_ID || ""}');
return [{ json: { byOwner, fallback: slotsFor('anytime', ${HAS_CALENDAR}), users } }];`), { position: [w.x + 260, -240] });
  w.link(HAS_CALENDAR ? "Owner calendar" : "Read inbox (Apify)", "Free pickup slots");

  // Branch B: conversations whose last message is an unanswered buyer message → agent
  w.add("Needs a reply", code(common + `
const fs = $('Free pickup slots').first().json;
const out = [];
for (const c of threads) {
  const it = byListing[String(c.listingId)];
  const slots = fs.byOwner[it.ownerId] || fs.fallback;
  const owner = fs.users[it.ownerId] || {};
  const prev = conv[c.conversationId];
  if (prev && prev.state === 'declined') continue;
  const msgs = sorted(c);
  const fresh = msgs.filter(m => m.from === 'buyer' && !known.has(String(m.id)));
  if (!fresh.length || msgs.at(-1).from !== 'buyer') continue;
  const reservedForSomeoneElse = convRows.some(o => o.itemId === it.id && o.conversationId !== c.conversationId && ['deal', 'pickup_scheduled'].includes(o.state));
  const bidOffers = (c.bids || []).map(b => Number(b.amount)).filter(Boolean);
  out.push({ json: {
    itemId: it.id, conversationId: c.conversationId, platform: 'marktplaats', buyer: c.buyer?.name || 'Buyer', itemStatus: it.status, sessionStore: it.mpStore || 'mp-session',
    stage: prev?.state || 'open', lastOffer: prev?.lastOffer ?? null, slots,
    detectedOffer: fresh.map(m => offerIn(m.text)).filter(Boolean).at(-1) ?? (bidOffers.length ? Math.max(...bidOffers) : null),
    context: {
      item: { title: it.title, description: it.description, condition: it.condition, askPrice: it.askPrice, floorPrice: it.floorPrice, goal: it.goal || 'week', marketRange: it.priceRange, pickupCity: it.pickupCity },
      conversation: { stage: prev?.state || 'open', agreedPrice: it.sale?.price ?? prev?.lastOffer ?? null, pickup: it.pickup || null,
        messages: msgs.map(m => ({ from: m.from === 'buyer' ? 'buyer' : 'seller', text: m.text, ts: m.ts })) },
      latestBuyerMessages: fresh.map(m => m.text), bids: c.bids || [],
      freeSlots: slots.map(s => ({ start: s.start, label: s.label })),
      pickupAddress: owner.pickupAddress || it.pickupAddress || ('in ' + (it.pickupCity || 'Amsterdam') + ', exact address follows'),
      reservedForSomeoneElse,
    } } });
}
return out;`));
  w.link("Free pickup slots", "Needs a reply");

  w.add("Sales agent (AI)", agent({ text: "={{ JSON.stringify($json.context) }}", system: SYSTEM }));
  w.add("Model", chatModel(env), { position: [w.x - 260, 240] });
  w.add("Decision format", outputParser(SCHEMA), { position: [w.x - 60, 240] });
  w.sub("Model", "Sales agent (AI)", "ai_languageModel");
  w.sub("Decision format", "Sales agent (AI)", "ai_outputParser");
  w.link("Needs a reply", "Sales agent (AI)");

  // Deterministic guardrails on top of the model: the minimum price is law, pickup slots must be real.
  w.add("Guardrails", codeEach(GUARDRAILS));
  w.link("Sales agent (AI)", "Guardrails");

  w.add("Log decision", tableInsert("decisions", {
    itemId: "={{ $json.itemId }}", conversationId: "={{ $json.conversationId }}", platform: "={{ $json.platform }}",
    buyerMessage: "={{ $json.buyerMessage }}", "offer:number": "={{ $json.offer }}", action: "={{ $json.action }}",
    reply: "={{ $json.text }}", reasoning: "={{ $json.reasoning }}",
  }), { position: [w.x - 260, -240] });
  w.link("Guardrails", "Log decision");
  w.log("Guardrails", "={{ $json.buyer }}{{ $json.offer ? ' offered €' + $json.offer : ' wrote' }} → {{ { answer: 'answered', counter: 'countered €' + $json.price, accept: 'deal at €' + $json.price + ', proposing pickup times', propose_pickup: 'proposed pickup times', confirm_pickup: 'pickup booked ' + ($json.pickup ? $json.pickup.label : ''), decline: 'declined (' + $json.buyerType + ')', wait: 'waiting' }[$json.action] }}", { type: "decision" });

  w.add("Act (send + save)", callWorkflow(ids.send, { wait: true }));
  w.link("Guardrails", "Act (send + save)");
  return w;
};
