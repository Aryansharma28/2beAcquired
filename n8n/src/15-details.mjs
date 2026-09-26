import { Workflow, webhook, respond, code, tableGet, tableUpdate, llm, ARGS } from "../lib.mjs";

// W1b · Details (screens 02–05 → 06 → 07): owner confirmed what it is, picked when it should be gone, set a minimum
// and pickup. The agent prices it for that goal, plans future price drops, and writes the ad.
export default (env, ids) => {
  const w = new Workflow("poof · 1b Details → ad", { errorWorkflow: ids.error });
  w.add("Owner details", webhook("tba/details"));
  w.add("OK", respond("={{ { ok: true } }}"));
  w.add("Get item", tableGet("items", { itemId: "={{ $('Owner details').first().json.body.itemId }}" }), { executeOnce: true });
  w.add("Apply details", code(`
const b = $('Owner details').first().json.body;
const row = $input.all().map(i => i.json).find(r => r.itemId);
if (!row) throw new Error('Item not found: ' + b.itemId);
const it = JSON.parse(row.data);
const goal = ['week', 'two_weeks', 'no_rush'].includes(b.goal) ? b.goal : 'week';
Object.assign(it, {
  status: 'writing', goal,
  name: String(b.name || it.name || '').slice(0, 120),
  condition: b.condition || it.condition,
  floorPrice: Math.max(1, Math.round(Number(b.floorPrice) || 0)),
  delivery: 'pickup', pickupCity: String(b.pickupCity || '${env.PICKUP_CITY || "Amsterdam"}').slice(0, 60),
  coverIndex: Number.isInteger(b.coverIndex) ? b.coverIndex : (it.coverIndex || 0),
});
if (it.coverIndex > 0 && it.photos[it.coverIndex]) it.photos = [it.photos[it.coverIndex], ...it.photos.filter((_, i) => i !== it.coverIndex)];
// Price for the goal: percentile of real matching listings, never below the minimum, room to negotiate.
const prices = it.compPrices || [];
const q = (p) => prices.length ? prices[Math.min(prices.length - 1, Math.floor(p * (prices.length - 1)))] : null;
const pct = { week: 0.4, two_weeks: 0.55, no_rush: 0.75 }[goal];
const nice = (x) => x >= 50 ? Math.round(x / 5) * 5 : Math.max(1, Math.round(x));
const floor = it.floorPrice;
let ask = prices.length >= 3 ? q(pct) : floor * 1.25;
ask = nice(Math.max(ask, floor * 1.1, floor + 5));
// Price plan: step down toward the minimum if nothing happens.
const every = { week: 1, two_weeks: 3, no_rush: 5 }[goal], step = { week: 0.1, two_weeks: 0.07, no_rush: 0.05 }[goal];
const plan = [{ price: ask, from: new Date().toISOString() }];
let p = ask;
for (let i = 1; i <= 3 && p > floor; i++) { p = Math.max(floor, nice(p * (1 - step))); plan.push({ price: p, from: new Date(Date.now() + i * every * 864e5).toISOString() }); }
it.askPrice = ask; it.pricePlan = plan;
it.strategy = { week: 'Sell this week: just under the typical price, first offer at or above your minimum wins',
  two_weeks: 'Two weeks: around the typical price, negotiate a little', no_rush: 'No rush: hold out for a top price' }[goal];
it.priceHistory = [{ ts: new Date().toISOString(), price: ask, reason: 'initial (' + goal + ')' }];
return [{ json: { itemId: row.itemId, data: JSON.stringify(it), item: it } }];`));
  w.add("Save writing", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "writing", data: "={{ $json.data }}" }));
  w.chain("Owner details", "OK", "Get item", "Apply details", "Save writing");
  w.log("Apply details", "=Price: start at €{{ $json.item.askPrice }}, never below €{{ $json.item.floorPrice }}");

  w.add("Write ad (LLM)", llm(env, {
    system: JSON.stringify(`You write second-hand ads that sell. Marktplaats ads are in Dutch: honest, warm, specific, no hype, no emojis, 3 short lines, mention condition and pickup city. Never use placeholders and never put the price in the title. Title under 60 characters, brand + model first (e.g. 'IKEA Poäng schommelstoel, eiken/antraciet'). Also write an English version.`),
    content: "JSON.stringify({ item: { name: $('Apply details').first().json.item.name, brand: $('Apply details').first().json.item.brand, category: $('Apply details').first().json.item.category, condition: $('Apply details').first().json.item.condition, attributes: $('Apply details').first().json.item.attributes }, pickupCity: $('Apply details').first().json.item.pickupCity, askPrice: $('Apply details').first().json.item.askPrice, comparableTitles: ($('Apply details').first().json.item.comps || []).slice(0, 8).map(c => c.title) })",
    tool: {
      name: "write_ad", description: "The finished ad",
      input_schema: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" }, titleEn: { type: "string" }, descriptionEn: { type: "string" } },
        required: ["title", "description", "titleEn", "descriptionEn"],
      },
    },
    maxTokens: 1500,
  }));
  w.add("Ad ready", code(`
const it = $('Apply details').first().json.item;
const ad = ${ARGS.replaceAll("$json", "$input.first().json")};
Object.assign(it, { status: 'ad_ready', title: ad.title, description: ad.description, titleEn: ad.titleEn, descriptionEn: ad.descriptionEn, adReadyAt: new Date().toISOString() });
return [{ json: { itemId: it.id, data: JSON.stringify(it), title: it.title } }];`));
  w.add("Save ad", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "ad_ready", data: "={{ $json.data }}" }));
  w.chain("Save writing", "Write ad (LLM)", "Ad ready", "Save ad");
  w.log("Ad ready", "=Ad written: \"{{ $json.title }}\"");
  return w;
};
