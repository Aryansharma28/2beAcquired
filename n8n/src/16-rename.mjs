import { Workflow, webhook, respond, code, tableGet, tableUpdate, llm, ARGS, mpSearch, MP_COMPS, FAKES } from "../lib.mjs";

// W1a · Rename (screen 02 "Fix it"): recognition got the item wrong, the owner typed what it really is.
// Re-run the market check for the corrected name so the price range, comparables and later the ad match the
// real product. Answers synchronously with the new market picture (the wizard waits on it).
export default (env, ids) => {
  const w = new Workflow("poof · 1a Rename → re-price", { errorWorkflow: ids.error });
  w.add("Corrected name", webhook("tba/rename"));
  w.add("Get item", tableGet("items", { itemId: "={{ $('Corrected name').first().json.body.itemId }}" }), { executeOnce: true });
  w.add("Check", code(`
const req = $('Corrected name').first().json;
const b = req.body;
const row = $input.all().map(i => i.json).find(r => r.itemId);
if (!row) throw new Error('Item not found: ' + b.itemId);
const it = JSON.parse(row.data);
if (it.ownerId && it.ownerId !== req.headers['x-poof-user']) throw new Error('Not your item');
if (row.status !== 'needs_details') throw new Error('Too late to rename: ' + row.status);
const name = String(b.name || '').trim().slice(0, 120);
if (name.length < 2) throw new Error('Name too short');
return [{ json: { itemId: row.itemId, name, item: it } }];`));
  w.chain("Corrected name", "Get item", "Check");

  w.add("Search Marktplaats", mpSearch("={{ $json.name }}"), { executeOnce: true });
  w.add("Comparables", code(MP_COMPS));
  w.add("Same product? (LLM)", llm(env, {
    system: JSON.stringify("You are pricing a second-hand item. The owner typed exactly what they are selling: match THAT, literally. Select only listings for the same product in the same form: if they sell a part or accessory (e.g. only a charging case), exclude complete sets; if they sell a complete product, exclude parts and accessories. Also exclude bundles, children's versions and different/luxury models. " + FAKES),
    content: "JSON.stringify({ item: { name: $('Check').first().json.name }, candidates: $input.all().map((c, i) => ({ i, title: c.json.title, price: c.json.price })).filter(c => typeof c.price === 'number').slice(0, 40) })",
    tool: { name: "select_matches", description: "Indexes of candidates that are the same product",
      input_schema: { type: "object", properties: { matches: { type: "array", items: { type: "integer" } }, note: { type: "string" } }, required: ["matches"] } },
    maxTokens: 2000,
    reasoning: "low",
  }), { executeOnce: true, onError: "continueRegularOutput" });

  // Same market math as intake (10-intake "Market"), on the corrected product.
  w.add("Market", code(`
const c = $('Check').first().json;
const all = $('Comparables').all().map(i => i.json).filter(x => x && x.title);
let picked = null;
try { picked = ${ARGS.replaceAll("$json", "$input.first().json")}.matches; } catch (e) { picked = null; }
const matched = Array.isArray(picked) && picked.length >= 3 ? picked.map(i => all[i]).filter(Boolean) : all;
const comps = matched.filter(x => typeof x.price === 'number' && x.price > 0);
const sorted = comps.map(x => x.price).sort((a, b) => a - b);
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))] : null;
const lo = q(sorted, 0.25), hi = q(sorted, 0.75), iqr = (hi ?? 0) - (lo ?? 0);
const clean = sorted.filter(p => lo == null || (p >= lo - 1.5 * iqr && p <= hi + 1.5 * iqr));
const priceRange = clean.length >= 3 ? { low: q(clean, 0.25), mid: q(clean, 0.5), high: q(clean, 0.8) } : null;
const it = c.item;
const wrongName = it.recognition?.name || it.name;
Object.assign(it, {
  name: c.name, searchQuery: c.name, renamedFrom: wrongName, pricing: false,
  recognition: { ...(it.recognition || {}), name: c.name, brand: '', category: it.category },
  brand: '', priceRange, compsCount: clean.length, compPrices: clean,
  comps: comps.filter(x => clean.includes(x.price)).slice(0, 12).map(x => ({ title: x.title, price: x.price, url: x.url, image: x.image, platform: 'marktplaats' })),
});
return [{ json: { itemId: c.itemId, data: JSON.stringify(it), name: c.name, wrongName, priceRange, compsCount: clean.length, comps: it.comps } }];`));
  w.chain("Check", "Search Marktplaats", "Comparables", "Same product? (LLM)", "Market");
  w.add("Save market", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { data: "={{ $json.data }}" }));
  w.add("Respond", respond("={{ { ok: true, name: $('Market').first().json.name, priceRange: $('Market').first().json.priceRange, compsCount: $('Market').first().json.compsCount, comps: $('Market').first().json.comps } }}"));
  w.chain("Market", "Save market", "Respond");
  w.log("Market", "=Corrected to {{ $json.name }} (was {{ $json.wrongName }}): {{ $json.priceRange ? $json.compsCount + ' similar listings (€' + $json.priceRange.low + '–€' + $json.priceRange.high + ')' : 'few similar listings' }}");
  return w;
};
