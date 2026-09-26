import { Workflow, webhook, respond, code, tableInsert, tableUpdate, llm, ARGS, actor, apify, ifTrue } from "../lib.mjs";

// W1 · Intake (screens 01→02): photos → Google Lens + vision → real comparables → "Is this it?" + market range.
export default (env, ids) => {
  const w = new Workflow("poof · 1 Intake", { errorWorkflow: ids.error });
  const photoUrl = `https://api.apify.com/v2/key-value-stores/${env.APIFY_PHOTO_STORE}/records/`;

  w.add("Photos in", webhook("tba/intake"));
  w.add("New item", code(`
const b = $json.body || {};
const ownerId = $json.headers['x-poof-user'];
if (!ownerId) throw new Error('No user');
const photos = (b.photos || []).filter(Boolean).slice(0, 6).map(p => p.replace(/^data:[^,]+,/, ''));
if (!photos.length) throw new Error('No photos in request');
const itemId = 'itm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const item = {
  id: itemId, ownerId, status: 'recognizing', createdAt: new Date().toISOString(),
  notes: String(b.notes || '').slice(0, 500),
  photos: photos.map((_, i) => '${photoUrl}' + itemId + '-' + i + '.jpg'),
  listings: [], priceHistory: [],
};
return [{ json: { itemId, status: 'recognizing', data: JSON.stringify(item), item, photosB64: photos } }];`));
  w.add("Save item", tableInsert("items", { itemId: "={{ $json.itemId }}", status: "={{ $json.status }}", data: "={{ $json.data }}" }));
  w.add("Reply with itemId", respond("={{ { itemId: $('New item').first().json.itemId } }}"));
  w.chain("Photos in", "New item", "Save item", "Reply with itemId");
  w.log("Save item", "={{ $('New item').first().json.photosB64.length }} photo(s) received", { itemId: "={{ $('New item').first().json.itemId }}" });

  // Store photos in an Apify key-value store so the posting actor (and the app) can fetch them.
  w.add("Photos as files", code(`
const n = $('New item').first().json;
return n.photosB64.map((b64, i) => ({ json: { key: n.itemId + '-' + i + '.jpg' }, binary: { data: { data: b64, mimeType: 'image/jpeg', fileName: n.itemId + '-' + i + '.jpg' } } }));`));
  w.add("Store photos (Apify)", apify("PUT", `=${photoUrl}{{ $json.key }}`, { sendBody: true, contentType: "binaryData", inputDataFieldName: "data" }));
  w.chain("Reply with itemId", "Photos as files", "Store photos (Apify)");

  // Identify the exact product with Google Lens (Apify actor): open vision models can't tell a Poäng from a Wegner.
  w.add("Identify product (Google Lens · Apify)", apify("POST", "https://api.apify.com/v2/acts/borderline~google-lens/run-sync-get-dataset-items?timeout=150", {
    sendBody: true, specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ searchTypes: ['visual-match', 'products'], language: 'nl', imagesBase64: [$('New item').first().json.photosB64[0]] }) }}",
    options: { timeout: 170000 },
  }), { executeOnce: true, onError: "continueRegularOutput", alwaysOutputData: true });
  w.add("Lens matches", code(`
const s = JSON.stringify($input.all().map(i => i.json));
const titles = [...s.matchAll(/"title":"([^"]{5,120})"/g)].map(m => m[1]).filter((t, i, a) => a.indexOf(t) === i).slice(0, 15);
return [{ json: { itemId: $('New item').first().json.itemId, lensTitles: titles } }];`), { executeOnce: true });
  w.link("Store photos (Apify)", "Identify product (Google Lens · Apify)");
  w.log("Store photos (Apify)", "=Looking it up with Google Lens…", { itemId: "={{ $('New item').first().json.itemId }}" });
  w.link("Identify product (Google Lens · Apify)", "Lens matches");
  w.add("Lens found it?", ifTrue("={{ $json.lensTitles.length > 0 }}"));
  w.link("Lens matches", "Lens found it?");
  w.add("Google Lens retry (broader)", apify("POST", "https://api.apify.com/v2/acts/borderline~google-lens/run-sync-get-dataset-items?timeout=150", {
    sendBody: true, specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ searchTypes: ['visual-match', 'products', 'all'], language: 'nl', imagesBase64: [$('New item').first().json.photosB64.at(-1)] }) }}",
    options: { timeout: 170000 },
  }), { executeOnce: true, onError: "continueRegularOutput", alwaysOutputData: true, position: [w.x, 220] });
  w.link("Lens found it?", "Google Lens retry (broader)", 1);
  w.log("Lens found it?", "=Google Lens needs a second look…", { itemId: "={{ $('New item').first().json.itemId }}", name: "Log · Lens retry" });
  w.connections["Lens found it?"].main[0] = w.connections["Lens found it?"].main[0].filter((c) => c.node !== "Log · Lens retry");
  w.link("Lens found it?", "Log · Lens retry", 1);
  w.add("Lens result", code(`
const titlesFrom = (items) => { const s = JSON.stringify(items.map(i => i.json)); return [...s.matchAll(/"title":"([^"]{5,120})"/g)].map(m => m[1]).filter((t, i, a) => a.indexOf(t) === i).slice(0, 15); };
const first = $('Lens matches').first().json.lensTitles;
const retry = $('Google Lens retry (broader)').isExecuted ? titlesFrom($('Google Lens retry (broader)').all()) : [];
return [{ json: { itemId: $('New item').first().json.itemId, lensTitles: first.length ? first : retry } }];`), { executeOnce: true });
  w.link("Lens found it?", "Lens result", 0);
  w.link("Google Lens retry (broader)", "Lens result");
  w.log("Lens result", "={{ $json.lensTitles.length ? 'Google Lens: looks like ' + $json.lensTitles[0] : 'Google Lens found no exact match, going by the photo' }}");

  w.add("Recognise item (vision LLM)", llm(env, {
    vision: true,
    system: JSON.stringify("You identify second-hand items from photos for a Dutch reseller. Most items are mass-market products: first ask yourself which well-known product this is (IKEA, HEMA, Philips, Gazelle, Apple, Lego, ...) and name the exact model if you recognise it (e.g. 'IKEA POÄNG armchair'). Only call something vintage/designer if it clearly is. If the owner gives a hint, trust it. Google Lens matches are strong evidence for brand/model: if several agree, use that product. Use the photo itself for condition, colour and defects. searchQuery = what a Dutch buyer types on Marktplaats for THIS product (brand + model, 2-4 words, e.g. 'ikea poang'); searchQueryBroad = the generic category in Dutch (e.g. 'fauteuil')."),
    content: "[{ type: 'text', text: 'Identify this item. Owner hint: ' + ($('New item').first().json.item.notes || 'none') + '. Google Lens visual matches (most reliable for brand/model, ignore outliers): ' + $('Lens result').first().json.lensTitles.join(' | ') }].concat($('New item').first().json.photosB64.slice(0, 2).map(d => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + d } })))",
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
    maxTokens: 600, // Groq free tier: 1000 output tokens/min on the vision model
  }), { executeOnce: true, onError: "continueRegularOutput", alwaysOutputData: true });
  w.link("Lens result", "Recognise item (vision LLM)");
  w.add("Vision worked?", ifTrue("={{ !!($json.choices && $json.choices.length) }}"));
  w.link("Recognise item (vision LLM)", "Vision worked?");
  w.add("Recognise from Lens (text LLM)", llm(env, {
    system: JSON.stringify("You identify a second-hand item for a Dutch reseller from Google Lens matches of its photo (the photo itself is unavailable). Pick the product most matches agree on. If unsure, stay generic. Condition: assume 'Gebruikt'. searchQuery = what a Dutch buyer types on Marktplaats (brand + model, 2-4 words); searchQueryBroad = the generic category in Dutch."),
    content: "'Google Lens matches: ' + $('Lens result').first().json.lensTitles.join(' | ') + '. Owner hint: ' + ($('New item').first().json.item.notes || 'none')",
    tool: {
      name: "record_item", description: "Record what the item is",
      input_schema: { type: "object", properties: {
        name: { type: "string" }, brand: { type: "string" }, category: { type: "string" },
        condition: { type: "string", enum: ["Nieuw", "Zo goed als nieuw", "Gebruikt", "Niet werkend"] },
        attributes: { type: "array", items: { type: "string" } }, searchQuery: { type: "string" }, searchQueryBroad: { type: "string" },
      }, required: ["name", "category", "condition", "searchQuery", "searchQueryBroad", "attributes"] },
    },
    maxTokens: 500,
  }), { executeOnce: true, position: [w.x, 220] });
  w.link("Vision worked?", "Recognise from Lens (text LLM)", 1);
  w.add("Recognised", code(`
const fromText = $('Recognise from Lens (text LLM)').isExecuted;
const src = fromText ? $('Recognise from Lens (text LLM)').first().json : $('Recognise item (vision LLM)').first().json;
const recognition = ${ARGS.replaceAll("$json", "src")};
return [{ json: { itemId: $('New item').first().json.itemId, recognition, via: fromText ? 'lens' : 'vision' } }];`));
  w.link("Vision worked?", "Recognised", 0);
  w.link("Recognise from Lens (text LLM)", "Recognised");
  w.log("Recognised", "=Recognised: {{ $json.recognition.name }} ({{ $json.recognition.condition }})");

  w.add("Comparables (Apify)", actor(env, `={{ JSON.stringify({ action: 'comps', query: $json.recognition.searchQuery, fallbackQuery: $json.recognition.searchQueryBroad, limit: 40 }) }}`, { timeout: 120, soft: true }), { alwaysOutputData: true });
  w.link("Recognised", "Comparables (Apify)");

  // Keep only listings that are really the same product before pricing (a Poäng is not a designer lounge chair).
  w.add("Same product? (LLM)", llm(env, {
    system: JSON.stringify("You are pricing a second-hand item. From the candidate listings, select only those that are the same product (same brand/model or truly equivalent item). Exclude accessories, parts, bundles, children's versions, and different/luxury models."),
    content: "JSON.stringify({ item: $('Recognised').first().json.recognition, candidates: $input.all().map((c, i) => ({ i, title: c.json.title, price: c.json.price })).filter(c => typeof c.price === 'number').slice(0, 40) })",
    tool: { name: "select_matches", description: "Indexes of candidates that are the same product",
      input_schema: { type: "object", properties: { matches: { type: "array", items: { type: "integer" } }, note: { type: "string" } }, required: ["matches"] } },
    maxTokens: 400,
  }), { executeOnce: true, onError: "continueRegularOutput" });

  // Market picture for screens 02/04: what it is + what similar ones sell for. Then wait for the owner's details.
  w.add("Market", code(`
const n = $('New item').first().json;
const r = $('Recognised').first().json.recognition;
const all = $('Comparables (Apify)').all().map(i => i.json);
let picked = null;
try { picked = ${ARGS.replaceAll("$json", "$input.first().json")}.matches; } catch (e) { picked = null; }
const matched = Array.isArray(picked) && picked.length >= 3 ? picked.map(i => all[i]).filter(Boolean) : all;
const comps = matched.filter(c => typeof c.price === 'number' && c.price > 0);
const sorted = comps.map(c => c.price).sort((a, b) => a - b);
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))] : null;
const lo = q(sorted, 0.25), hi = q(sorted, 0.75), iqr = (hi ?? 0) - (lo ?? 0);
const clean = sorted.filter(p => lo == null || (p >= lo - 1.5 * iqr && p <= hi + 1.5 * iqr));
const priceRange = clean.length >= 3 ? { low: q(clean, 0.25), mid: q(clean, 0.5), high: q(clean, 0.8) } : null;
const item = { ...n.item, status: 'needs_details',
  recognition: { name: r.name, brand: r.brand, category: r.category, condition: r.condition, attributes: r.attributes || [] },
  name: r.name, brand: r.brand, category: r.category, condition: r.condition, attributes: r.attributes || [], searchQuery: r.searchQuery,
  lensTitles: $('Lens result').first().json.lensTitles.slice(0, 5), coverIndex: 0,
  priceRange, compsCount: clean.length, compPrices: clean,
  comps: comps.filter(c => clean.includes(c.price)).slice(0, 12).map(c => ({ title: c.title, price: c.price, url: c.url, image: c.image, platform: 'marktplaats' })) };
return [{ json: { itemId: n.itemId, status: 'needs_details', data: JSON.stringify(item), compsCount: clean.length, priceRange } }];`));
  w.link("Comparables (Apify)", "Same product? (LLM)");
  w.link("Same product? (LLM)", "Market");
  w.add("Save market", tableUpdate("items", { itemId: "={{ $json.itemId }}" }, { status: "needs_details", data: "={{ $json.data }}" }));
  w.link("Market", "Save market");
  w.log("Market", "={{ $json.priceRange ? $json.compsCount + ' similar listings found (€' + $json.priceRange.low + '–€' + $json.priceRange.high + ')' : 'Few similar listings found' }}");
  return w;
};
