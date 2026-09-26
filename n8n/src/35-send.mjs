import { Workflow, subTrigger, codeEach, code, tableUpsert, tableUpdate, tableInsert, actor, ifTrue, callWorkflow } from "../lib.mjs";

// Send reply: one item per conversation {itemId, conversationId, platform, buyer, text, state, lastOffer, deal, price}.
// Saves the conversation state, sends the message on the platform, stores it, and hands deals to W5 Sold.
export default (env, ids) => {
  const w = new Workflow("TBA · Send reply", { errorWorkflow: ids.error });
  w.add("Reply to send", subTrigger());
  w.add("Prep", codeEach(`
const j = $json;
const itemStatus = j.state === 'needs_you' ? 'needs_you' : 'negotiating';
return { json: { ...j, text: j.text || '', lastOffer: j.lastOffer ?? null, itemStatus } };`));
  w.add("Save conversation", tableUpsert("conversations", { conversationId: "={{ $json.conversationId }}" }, {
    conversationId: "={{ $json.conversationId }}", itemId: "={{ $json.itemId }}", platform: "={{ $json.platform }}",
    buyer: "={{ $json.buyer }}", state: "={{ $json.state }}", "lastOffer:number": "={{ $json.lastOffer }}",
  }));
  w.add("Item status", tableUpdate("items", { itemId: "={{ $('Prep').item.json.itemId }}" }, { status: "={{ $('Prep').item.json.itemStatus }}" }));
  w.add("Has a reply?", ifTrue("={{ !!$('Prep').item.json.text }}"));
  w.chain("Reply to send", "Prep", "Save conversation", "Item status", "Has a reply?");

  w.add("Send on Marktplaats (Apify)", actor(env, "={{ JSON.stringify({ action: 'reply', conversationId: $('Prep').item.json.conversationId, text: $('Prep').item.json.text }) }}", { timeout: 90 }));
  w.add("Agent message", codeEach(`
const p = $('Prep').item.json;
return { json: { itemId: p.itemId, conversationId: p.conversationId, platform: p.platform, buyer: p.buyer,
  msgId: 'agent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), from: 'agent', text: p.text,
  ts: new Date().toISOString(), offer: p.price ?? null } };`));
  w.add("Store agent message", tableInsert("messages", {
    itemId: "={{ $json.itemId }}", conversationId: "={{ $json.conversationId }}", platform: "={{ $json.platform }}",
    buyer: "={{ $json.buyer }}", msgId: "={{ $json.msgId }}", from: "agent", text: "={{ $json.text }}",
    ts: "={{ $json.ts }}", "offer:number": "={{ $json.offer }}",
  }));
  w.link("Has a reply?", "Send on Marktplaats (Apify)", 0);
  w.chain("Send on Marktplaats (Apify)", "Agent message", "Store agent message");

  w.add("Deals", code(`return $('Prep').all().filter(i => i.json.deal).map(i => ({ json: { itemId: i.json.itemId, conversationId: i.json.conversationId, platform: i.json.platform, buyer: i.json.buyer, price: i.json.price } }));`), { executeOnce: false });
  w.add("Sold", callWorkflow(ids.sold));
  w.link("Item status", "Deals");
  w.link("Deals", "Sold");
  return w;
};
