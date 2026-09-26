import { Workflow, webhook, respond, code, tableInsert, tableUpdate, tableGet, claude, actor, apify, ifTrue, waitSeconds, callWorkflow } from "../lib.mjs";

// W1 · Intake: photo + goal + floor → recognise → real comparables → price strategy → full ad → auto-publish.
export default (env, ids) => {
  const w = new Workflow("TBA · 1 Intake", { errorWorkflow: ids.error });
  const photoUrl = (key) => `https://api.apify.com/v2/key-value-stores/${env.APIFY_PHOTO_STORE}/records/${key}`;

  w.add("Photo + goal", webhook("tba/intake"));
  w.add("New item", code(`
const b = $json.body || {};
const photos = (b.photos || []).filter(Boolean).slice(0, 6).map(p => p.replace(/^data:[^,]+,/, ''));
if (!photos.length) throw new Error('No photos in request');
const itemId = 'itm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const item = {
  id: itemId, status: 'analyzing', createdAt: new Date().toISOString(),
  goal: b.goal === 'fast' ? 'fast' : 'max_price',
  floorPrice: Math.max(0, Math.round(Number(b.floorPrice) || 0)),
  notes: String(b.notes || '').slice(0, 500),
  photos: photos.map((_, i) => '${photoUrl("")}' + itemId + '-' + i + '.jpg'),
  listings: [], priceHistory: [],
};
return [{ json: { itemId, status: 'analyzing', data: JSON.stringify(item), item, photosB64: photos } }];`));
  w.add("Save item", tableInsert("items", { itemId: "={{ $json.itemId }}", status: "={{ $json.status }}", data: "={{ $json.data }}" }));
  w.add("Reply with itemId", respond("={{ { itemId: $('New item').first().json.itemId } }}"));
  w.chain("Photo + goal", "New item", "Save item", "Reply with itemId");
  w.log("Save item", "=Photo received. Goal: {{ $('New item').first().json.item.goal === 'fast' ? 'gone this week' : 'highest price' }}, floor €{{ $('New item').first().json.item.floorPrice }}", { itemId: "={{ $('New item').first().json.itemId }}" });

  // Store photos in Apify key-value store so the posting actor (and the app) can fetch them.
  w.add("Photos as files", code(`
const n = $('New item').first().json;
return n.photosB64.map((b64, i) => ({ json: { key: n.itemId + '-' + i + '.jpg' }, binary: { data: { data: b64, mimeType: 'image/jpeg', fileName: n.itemId + '-' + i + '.jpg' } } }));`));
  w.add("Store photos (Apify)", apify("PUT", `=${photoUrl("")}{{ $json.key }}`, {
    sendBody: true, contentType: "binaryData", inputDataFieldName: "data",
  }));
  w.chain("Reply with itemId", "Photos as files", "Store photos (Apify)");

  // Recognise with Claude vision
  w.add("Recognise item (Claude)", claude({
    system: JSON.stringify("You identify second-hand items from photos for a Dutch reseller. Be specific (brand, model, material, era) but never invent facts you cannot see. The search queries must be what a Dutch buyer would type on Marktplaats (usually Dutch, 2-4 words)."),
    content: "[...$('New item').first().json.photosB64.slice(0, 3).map(d => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d } })), { type: 'text', text: 'Identify this item. Owner notes: ' + ($('New item').first().json.item.notes || 'none') }]",
    tool: {
      name: "record_item",
      description: "Record what the item is",
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
          confidence: { type: "number" },
        },
        required: ["name", "category", "condition", "searchQuery", "searchQueryBroad", "attributes"],
      },
    },
  }), { executeOnce: true });
  w.link("Store photos (Apify)", "Recognise item (Claude)");
  w.add("Recognised", code(`
const r = $input.first().json.content.find(c => c.type === 'tool_use').input;
return [{ json: { itemId: $('New item').first().json.itemId, recognition: r } }];`));
  w.link("Recognise item (Claude)", "Recognised");
  w.log("Recognised", "=Recognised: {{ $json.recognition.name }} ({{ $json.recognition.condition }})");

  // Real comparables via our Apify actor (Marktplaats search)
  w.add("Comparables (Apify)", actor(env, `={{ JSON.stringify({ action: 'comps', query: $json.recognition.searchQuery, fallbackQuery: $json.recognition.searchQueryBroad, limit: 40 }) }}`, { timeout: 120, soft: true }), { alwaysOutputData: true });
  w.link("Recognised", "Comparables (Apify)");

  w.add("Price strategy", code(`
const n = $('New item').first().json;
const r = $('Recognised').first().json.recognition;
const comps = $input.all().map(i => i.json).filter(c => typeof c.price === 'number' && c.price > 0);
const prices = comps.map(c => c.price).sort((a, b) => a - b);
const q = (p) => prices.length ? prices[Math.min(prices.length - 1, Math.floor(p * (prices.length - 1)))] : null;
// drop outliers outside 1.5 IQR
const lo = q(0.25), hi = q(0.75), iqr = (hi ?? 0) - (lo ?? 0);
const clean = prices.filter(p => lo == null || (p >= lo - 1.5 * iqr && p <= hi + 1.5 * iqr));
const cq = (p) => clean.length ? clean[Math.min(clean.length - 1, Math.floor(p * (clean.length - 1)))] : null;
const nice = (x) => x >= 50 ? Math.round(x / 5) * 5 : Math.max(1, Math.round(x));
const floor = n.item.floorPrice;
let range = clean.length >= 3 ? { low: cq(0.25), mid: cq(0.5), high: cq(0.8) } : null;
let ask;
if (range) ask = n.item.goal === 'fast' ? Math.round(range.mid * 0.95) : range.high;
else ask = Math.max(floor * 1.4, floor + 10);
ask = nice(Math.max(ask, Math.ceil(floor * 1.1)));
const strategy = n.item.goal === 'fast'
  ? 'Gone this week: ask just under the median, accept quickly at or above floor'
  : 'Highest price: ask near the top of the market, negotiate down slowly';
return [{ json: {
  itemId: n.itemId, askPrice: ask, priceRange: range, strategy, compsCount: clean.length,
  comps: comps.filter(c => clean.includes(c.price)).slice(0, 12).map(c => ({ title: c.title, price: c.price, url: c.url, image: c.image, platform: 'marktplaats' })),
} }];`));
  w.link("Comparables (Apify)", "Price strategy");
  w.log("Price strategy", "={{ $json.priceRange ? $json.compsCount + ' comparable listings (€' + $json.priceRange.low + '–€' + $json.priceRange.high + ')' : 'Few comparables found, priced from your floor' }}. Asking €{{ $json.askPrice }}");

  w.add("Write ad (Claude)", claude({
    system: JSON.stringify("You write second-hand ads that sell. Marktplaats ads are in Dutch: honest, warm, specific, no hype, no emojis, mention condition and pickup/shipping. Keep the title under 60 characters with brand/type first. Also write an English version for eBay."),
    content: "JSON.stringify({ item: $('Recognised').first().json.recognition, askPrice: $json.askPrice, goal: $('New item').first().json.item.goal, ownerNotes: $('New item').first().json.item.notes, comparableTitles: $json.comps.slice(0, 8).map(c => c.title) })",
    tool: {
      name: "write_ad",
      description: "The finished ad",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" }, description: { type: "string" },
          titleEn: { type: "string" }, descriptionEn: { type: "string" },
          delivery: { type: "string", enum: ["Ophalen", "Ophalen of Verzenden"] },
        },
        required: ["title", "description", "titleEn", "descriptionEn", "delivery"],
      },
    },
    maxTokens: 1800,
  }));
  w.link("Price strategy", "Write ad (Claude)");

  w.add("Ad ready", code(`
const n = $('New item').first().json;
const r = $('Recognised').first().json.recognition;
const p = $('Price strategy').first().json;
const ad = $input.first().json.content.find(c => c.type === 'tool_use').input;
const item = { ...n.item, status: 'ad_ready',
  title: ad.title, description: ad.description, titleEn: ad.titleEn, descriptionEn: ad.descriptionEn, delivery: ad.delivery,
  name: r.name, brand: r.brand, category: r.category, condition: r.condition, attributes: r.attributes, searchQuery: r.searchQuery,
  askPrice: p.askPrice, priceRange: p.priceRange, strategy: p.strategy, comps: p.comps,
  priceHistory: [{ ts: new Date().toISOString(), price: p.askPrice, reason: 'initial' }],
  adReadyAt: new Date().toISOString() };
return [{ json: { itemId: n.itemId, status: 'ad_ready', data: JSON.stringify(item) } }];`));
  w.add("Update item", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "={{ $json.status }}", data: "={{ $json.data }}" }));
  w.chain("Write ad (Claude)", "Ad ready", "Update item");
  w.log("Update item", "=Ad ready: \"{{ JSON.parse($('Ad ready').first().json.data).title }}\". Going live unless you edit it", { itemId: "={{ $('New item').first().json.itemId }}" });

  // Autonomy: if the owner doesn't intervene, publish by itself.
  w.add("Owner window", waitSeconds(Number(env.AUTO_PUBLISH_SECONDS || 20)));
  w.add("Still ad_ready?", tableGet("items", { itemId: "={{ $('New item').first().json.itemId }}" }));
  w.add("Untouched?", ifTrue("={{ $json.status === 'ad_ready' }}"));
  w.add("Publish", callWorkflow(ids.publish), { });
  w.chain("Update item", "Owner window", "Still ad_ready?", "Untouched?", "Publish");
  return w;
};
