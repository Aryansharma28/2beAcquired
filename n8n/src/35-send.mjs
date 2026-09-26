import { Workflow, subTrigger, codeEach, code, tableUpsert, tableUpdate, tableInsert, actor, ifTrue, callWorkflow } from "../lib.mjs";

// Send reply: one item per conversation {itemId, conversationId, platform, buyer, text, state, lastOffer, price, pickup, itemStatus}.
// Saves conversation state, moves the item status forward, sends the message on the platform, stores it,
// and hands booked pickups to W5.
export default (env, ids) => {
  const w = new Workflow("poof · Send reply", { errorWorkflow: ids.error });
  w.add("Reply to send", subTrigger());
  w.add("Prep", codeEach(`
const j = $json;
const rank = { live: 0, negotiating: 1, deal: 2, pickup_scheduled: 3, sold: 4 };
const wanted = j.state === 'deal' ? 'deal' : j.state === 'pickup_scheduled' ? 'pickup_scheduled' : 'negotiating';
const itemStatus = (rank[wanted] ?? 0) > (rank[j.itemStatus] ?? 0) ? wanted : j.itemStatus;   // never move backwards
return { json: { ...j, text: j.text || '', lastOffer: j.lastOffer ?? null, itemStatus } };`));
  w.add("Save conversation", tableUpsert("conversations", { conversationId: "={{ $json.conversationId }}" }, {
    conversationId: "={{ $json.conversationId }}", itemId: "={{ $json.itemId }}", platform: "={{ $json.platform }}",
    buyer: "={{ $json.buyer }}", state: "={{ $json.state }}", "lastOffer:number": "={{ $json.lastOffer }}",
  }));
  w.add("Item status", tableUpdate("items", { itemId: "={{ $('Prep').item.json.itemId }}" }, { status: "={{ $('Prep').item.json.itemStatus }}" }));
  w.add("Has a reply?", ifTrue("={{ !!$('Prep').item.json.text }}"));
  w.chain("Reply to send", "Prep", "Save conversation", "Item status", "Has a reply?");

  w.add("Send on Marktplaats (Apify)", actor(env, "={{ JSON.stringify({ action: 'reply', useProxy: true, conversationId: $('Prep').item.json.conversationId, text: $('Prep').item.json.text }) }}", { timeout: 90 }));
  w.add("Agent message", codeEach(`
const p = $('Prep').item.json;
return { json: { itemId: p.itemId, conversationId: p.conversationId, platform: p.platform, buyer: p.buyer,
  msgId: 'agent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: p.text,
  ts: new Date().toISOString(), offer: p.price ?? null } };`));
  w.add("Store agent message", tableInsert("messages", {
    itemId: "={{ $json.itemId }}", conversationId: "={{ $json.conversationId }}", platform: "={{ $json.platform }}",
    buyer: "={{ $json.buyer }}", msgId: "={{ $json.msgId }}", from: "agent", text: "={{ $json.text }}",
    ts: "={{ $json.ts }}", "offer:number": "={{ $json.offer }}",
  }));
  w.link("Has a reply?", "Send on Marktplaats (Apify)", 0);
  w.chain("Send on Marktplaats (Apify)", "Agent message", "Store agent message");

  w.add("Booked pickups", code(`return $('Prep').all().filter(i => i.json.state === 'pickup_scheduled' && i.json.pickup).map(i => ({ json: { itemId: i.json.itemId, conversationId: i.json.conversationId, platform: i.json.platform, buyer: i.json.buyer, price: i.json.lastOffer ?? i.json.price, pickup: i.json.pickup } }));`));
  w.add("Close the deal", callWorkflow(ids.pickup));
  w.link("Item status", "Booked pickups");
  w.link("Booked pickups", "Close the deal");
  return w;
};
