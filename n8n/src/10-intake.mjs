import { Workflow, webhook, respond, code, tableInsert, tableUpdate, tableGet, llm, ARGS, actor, apify, ifTrue, waitSeconds, callWorkflow } from "../lib.mjs";

// W1 · Intake: photo + minimum price → recognise → real comparables → sell-ASAP price → full ad → publish by itself.
export default (env, ids) => {
  const w = new Workflow("TBA · 1 Intake", { errorWorkflow: ids.error });
  const photoUrl = `https://api.apify.com/v2/key-value-stores/${env.APIFY_PHOTO_STORE}/records/`;

  w.add("Photo + minimum", webhook("tba/intake"));
  w.add("New item", code(`
const b = $json.body || {};
const photos = (b.photos || []).filter(Boolean).slice(0, 6).map(p => p.replace(/^data:[^,]+,/, ''));
if (!photos.length) throw new Error('No photos in request');
const itemId = 'itm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const item = {
  id: itemId, status: 'analyzing', createdAt: new Date().toISOString(), goal: 'fast',
  floorPrice: Math.max(1, Math.round(Number(b.floorPrice) || 0)),
  notes: String(b.notes || '').slice(0, 500),
  photos: photos.map((_, i) => '${photoUrl}' + itemId + '-' + i + '.jpg'),
  listings: [], priceHistory: [],
};
return [{ json: { itemId, status: 'analyzing', data: JSON.stringify(item), item, photosB64: photos } }];`));
  w.add("Save item", tableInsert("items", { itemId: "={{ $json.itemId }}", status: "={{ $json.status }}", data: "={{ $json.data }}" }));
  w.add("Reply with itemId", respond("={{ { itemId: $('New item').first().json.itemId } }}"));
  w.chain("Photo + minimum", "New item", "Save item", "Reply with itemId");
  w.log("Save item", "=Photo received. Minimum €{{ $('New item').first().json.item.floorPrice }}, goal: sell as fast as possible", { itemId: "={{ $('New item').first().json.itemId }}" });

  // Store photos in an Apify key-value store so the posting actor (and the app) can fetch them.
  w.add("Photos as files", code(`
const n = $('New item').first().json;
return n.photosB64.map((b64, i) => ({ json: { key: n.itemId + '-' + i + '.jpg' }, binary: { data: { data: b64, mimeType: 'image/jpeg', fileName: n.itemId + '-' + i + '.jpg' } } }));`));
  w.add("Store photos (Apify)", apify("PUT", `=${photoUrl}{{ $json.key }}`, { sendBody: true, contentType: "binaryData", inputDataFieldName: "data" }));
  w.chain("Reply with itemId", "Photos as files", "Store photos (Apify)");

  w.add("Recognise item (vision LLM)", llm(env, {
    vision: true,
    system: JSON.stringify("You identify second-hand items from photos for a Dutch reseller. Be specific (brand, model, material, era) but never invent facts you cannot see. Search queries must be what a Dutch buyer types on Marktplaats (usually Dutch, 2-4 words)."),
    content: "[{ type: 'text', text: 'Identify this item. Owner notes: ' + ($('New item').first().json.item.notes || 'none') }, ...$('New item').first().json.photosB64.slice(0, 2).map(d => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + d } }))]",
    tool: {
      name: "record_item", description: "Record what the item is",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short English name, e.g. 'Vintage oak dining chair'" },
          brand: { type: "string" },
          category: { type: "string", description: "Marktplaats category path in Dutch, e.g. 'Huis en Inrichting > Stoelen'" },
          condition: { type: "string", enum: ["Nieuw", "Zo goed als nieuw", "Gebruikt", "Niet werkend"] },
          attributes: { type: "array", items: { type: "string" }, description: "Visible features: material, colour, size, defects" },
          searchQuery: { type: "string", description: "Marktplaats search query for comparable listings" },
          searchQueryBroad: { type: "string", description: "Broader fallback query" },
        },
        required: ["name", "category", "condition", "searchQuery", "searchQueryBroad", "attributes"],
      },
    },
  }), { executeOnce: true });
  w.link("Store photos (Apify)", "Recognise item (vision LLM)");
  w.add("Recognised", code(`return [{ json: { itemId: $('New item').first().json.itemId, recognition: ${ARGS.replaceAll("$json", "$input.first().json")} } }];`));
  w.link("Recognise item (vision LLM)", "Recognised");
  w.log("Recognised", "=Recognised: {{ $json.recognition.name }} ({{ $json.recognition.condition }})");

  w.add("Comparables (Apify)", actor(env, `={{ JSON.stringify({ action: 'comps', query: $json.recognition.searchQuery, fallbackQuery: $json.recognition.searchQueryBroad, limit: 40 }) }}`, { timeout: 120, soft: true }), { alwaysOutputData: true });
  w.link("Recognised", "Comparables (Apify)");

  // Sell ASAP: price just under the typical market price, never below the owner's minimum, leave a little room to negotiate.
  w.add("Price strategy", code(`
const n = $('New item').first().json;
const comps = $input.all().map(i => i.json).filter(c => typeof c.price === 'number' && c.price > 0);
const sorted = comps.map(c => c.price).sort((a, b) => a - b);
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))] : null;
const lo = q(sorted, 0.25), hi = q(sorted, 0.75), iqr = (hi ?? 0) - (lo ?? 0);
const clean = sorted.filter(p => lo == null || (p >= lo - 1.5 * iqr && p <= hi + 1.5 * iqr));
const nice = (x) => x >= 50 ? Math.round(x / 5) * 5 : Math.max(1, Math.round(x));
const floor = n.item.floorPrice;
const range = clean.length >= 3 ? { low: q(clean, 0.25), mid: q(clean, 0.5), high: q(clean, 0.8) } : null;
let ask = range ? range.mid * 0.95 : floor * 1.25;
ask = nice(Math.max(ask, floor * 1.1, floor + 5));
const strategy = range && range.mid < floor
  ? 'Market is below your minimum: listed just above it, will hold at the minimum'
  : 'Sell fast: just under the typical price, accept the first offer at or above your minimum';
return [{ json: {
  itemId: n.itemId, askPrice: ask, priceRange: range, strategy, compsCount: clean.length,
  comps: comps.filter(c => clean.includes(c.price)).slice(0, 12).map(c => ({ title: c.title, price: c.price, url: c.url, image: c.image, platform: 'marktplaats' })),
} }];`));
  w.link("Comparables (Apify)", "Price strategy");
  w.log("Price strategy", "={{ $json.priceRange ? $json.compsCount + ' comparable listings (€' + $json.priceRange.low + '–€' + $json.priceRange.high + ')' : 'Few comparables found, priced from your minimum' }}. Asking €{{ $json.askPrice }}");

  w.add("Write ad (LLM)", llm(env, {
    system: JSON.stringify("You write second-hand ads that sell fast. Marktplaats ads are in Dutch: honest, warm, specific, no hype, no emojis, mention condition and pickup. Title under 60 characters, brand/type first. Also write an English version."),
    content: "JSON.stringify({ item: $('Recognised').first().json.recognition, askPrice: $json.askPrice, ownerNotes: $('New item').first().json.item.notes, comparableTitles: $json.comps.slice(0, 8).map(c => c.title) })",
    tool: {
      name: "write_ad", description: "The finished ad",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" }, description: { type: "string" },
          titleEn: { type: "string" }, descriptionEn: { type: "string" },
        },
        required: ["title", "description", "titleEn", "descriptionEn"],
      },
    },
    maxTokens: 1800,
  }));
  w.link("Price strategy", "Write ad (LLM)");

  w.add("Ad ready", code(`
const n = $('New item').first().json;
const r = $('Recognised').first().json.recognition;
const p = $('Price strategy').first().json;
const ad = ${ARGS.replaceAll("$json", "$input.first().json")};
const item = { ...n.item, status: 'ad_ready',
  title: ad.title, description: ad.description, titleEn: ad.titleEn, descriptionEn: ad.descriptionEn, delivery: 'Ophalen',
  name: r.name, brand: r.brand, category: r.category, condition: r.condition, attributes: r.attributes, searchQuery: r.searchQuery,
  askPrice: p.askPrice, priceRange: p.priceRange, strategy: p.strategy, comps: p.comps,
  priceHistory: [{ ts: new Date().toISOString(), price: p.askPrice, reason: 'initial' }],
  adReadyAt: new Date().toISOString() };
return [{ json: { itemId: n.itemId, status: 'ad_ready', data: JSON.stringify(item) } }];`));
  w.add("Update item", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "={{ $json.status }}", data: "={{ $json.data }}" }));
  w.chain("Write ad (LLM)", "Ad ready", "Update item");
  w.log("Update item", "=Ad ready: \"{{ JSON.parse($('Ad ready').first().json.data).title }}\". Going live", { itemId: "={{ $('New item').first().json.itemId }}" });

  w.add("Short pause for the app", waitSeconds(Number(env.AUTO_PUBLISH_SECONDS || 10)));
  w.add("Current status", tableGet("items", { itemId: "={{ $('New item').first().json.itemId }}" }));
  w.add("Still ad_ready?", ifTrue("={{ $json.status === 'ad_ready' }}"));
  w.add("Publish", callWorkflow(ids.publish));
  w.chain("Update item", "Short pause for the app", "Current status", "Still ad_ready?", "Publish");
  return w;
};
