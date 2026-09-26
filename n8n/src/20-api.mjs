import { Workflow, webhook, respond, code, tableGet } from "../lib.mjs";

// Read API for the app: GET /tba/item?id=… and GET /tba/items
export default (env, ids) => {
  const w = new Workflow("TBA · API (read)", { errorWorkflow: ids.error });

  w.add("GET item", webhook("tba/item", "GET"));
  w.add("Item row", tableGet("items", { itemId: "={{ $json.query.id }}" }), { executeOnce: true });
  w.add("Item events", tableGet("events", { itemId: "={{ $('GET item').first().json.query.id }}" }), { executeOnce: true });
  w.add("Item conversations", tableGet("conversations", { itemId: "={{ $('GET item').first().json.query.id }}" }), { executeOnce: true });
  w.add("Item messages", tableGet("messages", { itemId: "={{ $('GET item').first().json.query.id }}" }), { executeOnce: true });
  w.add("Assemble item", code(`
const row = $('Item row').all().map(i => i.json).find(r => r.itemId);
if (!row) return [{ json: { error: 'not_found' } }];
const item = JSON.parse(row.data || '{}');
item.status = row.status;
item.listings ??= [];
const parse = (s) => { try { return s ? JSON.parse(s) : undefined; } catch { return undefined; } };
item.events = $('Item events').all().map(i => i.json).filter(e => e.itemId)
  .map(e => ({ ts: e.ts, type: e.type, text: e.text, meta: parse(e.meta) }))
  .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
const msgs = $('Item messages').all().map(i => i.json).filter(m => m.conversationId);
item.conversations = $('Item conversations').all().map(i => i.json).filter(c => c.conversationId).map(c => ({
  id: c.conversationId, platform: c.platform, buyer: c.buyer, state: c.state, lastOffer: c.lastOffer ?? undefined,
  messages: msgs.filter(m => m.conversationId === c.conversationId)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
    .map(m => ({ from: m.from === 'agent' ? 'agent' : 'buyer', text: m.text, ts: m.ts, offer: m.offer ?? undefined })),
}));
return [{ json: item }];`));
  w.add("Respond item", respond());
  w.chain("GET item", "Item row", "Item events", "Item conversations", "Item messages", "Assemble item", "Respond item");

  w.x = 0;
  w.add("GET items", webhook("tba/items", "GET"), { y: 400 });
  w.add("All items", tableGet("items"), { y: 400 });
  w.add("Summaries", code(`
const items = $input.all().map(i => i.json).filter(r => r.itemId).map(r => {
  const d = JSON.parse(r.data || '{}');
  return { id: r.itemId, status: r.status, title: d.title || d.name || 'New item', photo: d.photos?.[0], askPrice: d.askPrice,
           floorPrice: d.floorPrice, goal: d.goal, sale: d.sale, createdAt: d.createdAt,
           listings: (d.listings || []).map(l => ({ platform: l.platform, status: l.status, url: l.url })) };
}).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
return [{ json: { items } }];`), { y: 400 });
  w.add("Respond items", respond(), { y: 400 });
  w.chain("GET items", "All items", "Summaries", "Respond items");
  return w;
};
