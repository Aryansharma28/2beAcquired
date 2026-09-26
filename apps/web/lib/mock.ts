// In-browser simulated backend. Plays a scripted, realistic timeline for a
// vintage oak chair so the whole app can be demoed without n8n. The agent is
// fully autonomous: the app never sends actions, it only watches.
//
// State lives in localStorage (so it survives reloads); photos go in a separate
// key per item, falling back to memory if the quota is exceeded. Each item has
// a queue of timed steps; every read applies the steps that are due.

import type { Comp, Conversation, IntakeRequest, Item, ItemEvent, ItemSummary, Platform } from "./types";

type StepKind =
  | "photo" | "recognised" | "searching" | "comps" | "strategy" | "adReady"
  | "publishing" | "mpLive"
  | "buyerOffer" | "agentCounter" | "buyerMeet" | "agentDeal" | "agentAskPickup" | "buyerPickup"
  | "pickupScheduled" | "remove" | "sold";
type Step = { at: number; kind: StepKind };
type Store = { items: Record<string, Item>; queues: Record<string, Step[]>; seeded?: boolean };

const KEY = "tba-mock-v2";
const PHOTO_KEY = (id: string) => `tba-mock-photos-${id}`;
const memPhotos = new Map<string, string[]>();
let memStore: Store | null = null;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (t: number) => new Date(t).toISOString();

const BUYER = "Daan de Vries";
const CONV = "c-mp-1";

function load(): Store {
  if (memStore) return memStore;
  let s: Store = { items: {}, queues: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw);
  } catch { /* private mode */ }
  if (!s.seeded) seed(s);
  memStore = s;
  return s;
}

function save(s: Store) {
  memStore = s;
  const lite: Store = { ...s, items: {} };
  for (const [id, it] of Object.entries(s.items)) {
    lite.items[id] = { ...it, photos: it.photos.filter((p) => !p.startsWith("data:")) };
  }
  try { localStorage.setItem(KEY, JSON.stringify(lite)); } catch { /* keep in memory */ }
}

function savePhotos(id: string, photos: string[]) {
  memPhotos.set(id, photos);
  try { localStorage.setItem(PHOTO_KEY(id), JSON.stringify(photos)); } catch { /* memory only */ }
}

function photosFor(item: Item): string[] {
  if (item.photos.length) return item.photos;
  const m = memPhotos.get(item.id);
  if (m) return m;
  try {
    const raw = localStorage.getItem(PHOTO_KEY(item.id));
    if (raw) {
      const p = JSON.parse(raw) as string[];
      memPhotos.set(item.id, p);
      return p;
    }
  } catch { /* ignore */ }
  return ["/demo/chair.svg"];
}

function ev(item: Item, at: number, type: ItemEvent["type"], text: string, meta?: Record<string, unknown>) {
  item.events.push({ ts: iso(at), type, text, meta });
}

function say(c: Conversation, from: "buyer" | "agent", text: string, at: number) {
  c.messages.push({ from, text, ts: iso(at) });
}

/** Next Saturday (never today) at hh:mm local time. */
function nextSaturday(from: number, h: number, m: number) {
  const d = new Date(from);
  d.setDate(d.getDate() + (((6 - d.getDay() + 7) % 7) || 7));
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------- script

const COMPS: Comp[] = [
  ["Vintage eiken stoel met biezen zitting", 65, "marktplaats"],
  ["Eikenhouten eetkamerstoel jaren 60", 75, "marktplaats"],
  ["Brocante stoel massief eiken", 60, "marktplaats"],
  ["Deense eiken stoel, vintage", 110, "marktplaats"],
  ["Oude eiken stoel, stevig", 70, "marktplaats"],
  ["Vintage oak dining chair, rush seat", 95, "ebay"],
  ["Mid-century oak chair", 120, "ebay"],
  ["Eiken stoel vintage (2x beschikbaar)", 85, "marktplaats"],
  ["Retro houten stoel eiken", 68, "marktplaats"],
  ["Vintage Eichenstuhl Binsengeflecht", 89, "ebay"],
  ["Eiken design stoel jaren 70", 115, "marktplaats"],
  ["Stoel eiken met rieten zitting", 72, "marktplaats"],
  ["Scandinavian oak chair 1960s", 105, "ebay"],
  ["Landelijke eiken stoel", 62, "marktplaats"],
  ["Vintage stoel eikenhout", 80, "marktplaats"],
  ["Oak spindle back chair", 78, "ebay"],
  ["Eiken eetkamerstoel, goede staat", 90, "marktplaats"],
  ["Brocante eiken keukenstoel", 65, "marktplaats"],
  ["Vintage houten stoel met biezen", 84, "marktplaats"],
  ["Antique oak side chair", 98, "ebay"],
  ["Eiken stoel vintage retro", 88, "marktplaats"],
  ["Mid-century eiken stoel", 100, "marktplaats"],
  ["Rush seat oak chair, restored", 92, "ebay"],
].map(([title, price, platform], i) => ({
  title: title as string,
  price: price as number,
  platform: platform as Platform,
  url: platform === "ebay"
    ? `https://www.ebay.nl/itm/${2049381720 + i * 7919}`
    : `https://www.marktplaats.nl/v/huis-en-inrichting/stoelen/m${2143380000 + i * 4211}`,
}));

const DESCRIPTION =
  "Solid oak dining chair from the 1960s with its original woven rush seat. Sturdy, no wobble. " +
  "Light wear on the front edge of the seat, which only adds to the character.\n\n" +
  "Dimensions: 44 × 48 × 84 cm, seat height 46 cm.\n\n" +
  "Pickup in Amsterdam-Oost.";

function prices(floor: number) {
  const deal = Math.max(80, floor);
  const counter = Math.max(85, deal + 5);
  const ask = Math.max(95, counter + 10);
  return { ask, counter, deal };
}

function script(t0: number): Step[] {
  const s = (ms: number, kind: StepKind): Step => ({ at: t0 + ms, kind });
  return [
    s(400, "photo"), s(1500, "recognised"), s(2700, "searching"), s(4000, "comps"), s(5200, "strategy"),
    s(6400, "adReady"),
    // The agent publishes on its own after the 10 s countdown.
    s(16400, "publishing"), s(18400, "mpLive"),
    s(22000, "buyerOffer"), s(24500, "agentCounter"), s(28500, "buyerMeet"), s(31000, "agentDeal"),
    s(33000, "agentAskPickup"), s(36500, "buyerPickup"), s(38500, "pickupScheduled"),
    s(40500, "remove"), s(42500, "sold"),
  ];
}

function apply(item: Item, step: Step) {
  const { at } = step;
  const p = prices(item.floorPrice);
  const c = item.conversations.find((x) => x.id === CONV);
  switch (step.kind) {
    case "photo": {
      const n = Math.max(1, photosFor(item).length);
      ev(item, at, "step", `Photo received — ${n} shot${n > 1 ? "s" : ""}, checking what it is`);
      break;
    }
    case "recognised":
      item.title = "Vintage oak chair";
      item.category = "Furniture › Chairs";
      item.condition = "Good — light wear on seat";
      ev(item, at, "step", "Recognised: Vintage oak chair", { category: item.category, condition: item.condition });
      break;
    case "searching":
      ev(item, at, "step", "Searching Marktplaats + eBay sold listings");
      break;
    case "comps":
      item.comps = COMPS;
      item.priceRange = { low: 60, mid: 85, high: 120 };
      ev(item, at, "step", "23 comparable listings (€60–€120)", { count: 23, low: 60, high: 120 });
      break;
    case "strategy":
      item.askPrice = p.ask;
      ev(item, at, "decision", `Strategy: sell this week, ask €${p.ask}, never below €${item.floorPrice}`,
        { askPrice: p.ask, floor: item.floorPrice });
      break;
    case "adReady":
      item.title = "Vintage oak chair with rush seat — 1960s";
      item.description = DESCRIPTION;
      item.status = "ad_ready";
      ev(item, at, "step", "Ad written — going live in 10 s");
      break;
    case "publishing":
      item.status = "publishing";
      item.listings = [{ platform: "marktplaats", status: "pending", price: item.askPrice }];
      ev(item, at, "step", "Publishing to Marktplaats");
      break;
    case "mpLive":
      item.listings[0] = {
        ...item.listings[0], status: "live",
        url: "https://www.marktplaats.nl/v/huis-en-inrichting/stoelen/m2158873412-vintage-eiken-stoel",
      };
      item.status = "live";
      ev(item, at, "notify", "Live on Marktplaats");
      break;
    case "buyerOffer": {
      const conv: Conversation = { id: CONV, platform: "marktplaats", buyer: BUYER, state: "open", lastOffer: 50, messages: [] };
      say(conv, "buyer", "Hoi! Is this still available? Would you do 50?", at);
      item.conversations.push(conv);
      item.status = "negotiating";
      ev(item, at, "step", "New message from Daan — offer €50");
      break;
    }
    case "agentCounter":
      if (!c) break;
      say(c, "agent", `Hi Daan, yes it's still available! €50 is a bit low for solid oak — similar chairs sell for €80–€110. I can do €${p.counter}.`, at);
      ev(item, at, "decision", `€50 is below your minimum → countered €${p.counter}`);
      break;
    case "buyerMeet":
      if (!c) break;
      c.lastOffer = p.deal;
      say(c, "buyer", `Would you meet me at €${p.deal}?`, at);
      ev(item, at, "step", `Daan offers €${p.deal}`);
      break;
    case "agentDeal":
      if (!c) break;
      c.state = "deal";
      say(c, "agent", `Deal at €${p.deal}!`, at);
      item.sale = { price: p.deal, platform: "marktplaats", buyer: BUYER, ts: iso(at) };
      item.status = "deal";
      ev(item, at, "decision", `€${p.deal} is above your €${item.floorPrice} minimum → deal`, { price: p.deal });
      break;
    case "agentAskPickup":
      if (!c) break;
      say(c, "agent", "Top! Wanneer kun je hem ophalen? Ik kan za 14:30 of zo 11:00.", at);
      ev(item, at, "step", "Asked Daan when he can pick it up");
      break;
    case "buyerPickup":
      if (!c) break;
      say(c, "buyer", "za 14:30 prima", at);
      break;
    case "pickupScheduled": {
      if (!c) break;
      const start = nextSaturday(at, 14, 30);
      item.pickup = { start: iso(start), end: iso(start + 30 * 60000), buyer: BUYER, platform: "marktplaats", calendarEventId: "evt_mock_pickup" };
      c.state = "pickup_scheduled";
      say(c, "agent", "Top, zaterdag 14:30 staat in de agenda. Adres: Linnaeusstraat 12, Amsterdam-Oost. Tot dan!", at + 200);
      item.status = "pickup_scheduled";
      ev(item, at, "notify", "Pickup Saturday 14:30 with Daan — added to your calendar");
      break;
    }
    case "remove":
      for (const l of item.listings) l.status = "removed";
      ev(item, at, "step", "Removed from Marktplaats");
      break;
    case "sold":
      item.status = "sold";
      ev(item, at, "notify", `Sold for €${item.sale?.price ?? p.deal}. Removed everywhere.`);
      break;
  }
}

function tick(s: Store, id: string, now = Date.now()) {
  const q = s.queues[id];
  const item = s.items[id];
  if (!q?.length || !item) return;
  q.sort((a, b) => a.at - b.at);
  while (q.length && q[0].at <= now) apply(item, q.shift()!);
}

// ---------------------------------------------------------------- seeds

function seed(s: Store) {
  const day = 86400000;
  const now = Date.now();
  s.items["demo-bike"] = {
    id: "demo-bike", status: "sold", createdAt: iso(now - 4 * day), goal: "fast", floorPrice: 180,
    photos: ["/demo/bike.svg"], title: "Gazelle Orange C7 city bike", askPrice: 260,
    category: "Bikes", condition: "Good",
    listings: [{ platform: "marktplaats", status: "removed", price: 260 }],
    conversations: [], events: [{ ts: iso(now - 3 * day), type: "notify", text: "Sold for €240. Removed everywhere." }],
    pickup: { start: iso(now - 3 * day), end: iso(now - 3 * day + 1800000), buyer: "Sanne Bakker", platform: "marktplaats" },
    sale: { price: 240, platform: "marktplaats", buyer: "Sanne Bakker", ts: iso(now - 3 * day) },
  };
  s.items["demo-lamp"] = {
    id: "demo-lamp", status: "negotiating", createdAt: iso(now - 1.2 * day), goal: "fast", floorPrice: 35,
    photos: ["/demo/lamp.svg"], title: "Anglepoise-style desk lamp, green", askPrice: 55,
    category: "Lighting", condition: "Very good",
    listings: [{ platform: "marktplaats", status: "live", price: 55 }],
    conversations: [{
      id: "c-lamp", platform: "marktplaats", buyer: "Fleur Jansen", state: "open", lastOffer: 40,
      messages: [
        { from: "buyer", text: "Hi, does the lamp still work? Would €40 be ok?", ts: iso(now - 0.3 * day) },
        { from: "agent", text: "Works perfectly, new bulb included. I can do €50.", ts: iso(now - 0.29 * day) },
      ],
    }],
    events: [{ ts: iso(now - 1.1 * day), type: "notify", text: "Live on Marktplaats" }],
  };
  s.seeded = true;
}

// ---------------------------------------------------------------- API

export async function intake(body: IntakeRequest): Promise<{ itemId: string }> {
  await delay(700);
  const s = load();
  const id = `itm-${Date.now().toString(36)}`;
  const now = Date.now();
  savePhotos(id, body.photos.map((b) => `data:image/jpeg;base64,${b}`));
  s.items[id] = {
    id, status: "analyzing", createdAt: iso(now), goal: body.goal, floorPrice: body.floorPrice,
    photos: [], listings: [], conversations: [], events: [],
  };
  s.queues[id] = script(now);
  save(s);
  return { itemId: id };
}

export async function getItem(id: string): Promise<Item> {
  await delay(60);
  const s = load();
  tick(s, id);
  save(s);
  const item = s.items[id];
  if (!item) throw new Error("This item doesn't exist in the demo data. Start a new one.");
  return structuredClone({ ...item, photos: photosFor(item) });
}

export async function listItems(): Promise<ItemSummary[]> {
  await delay(120);
  const s = load();
  for (const id of Object.keys(s.items)) tick(s, id);
  save(s);
  return Object.values(s.items)
    .map((it) => ({ ...it, photo: photosFor(it)[0] }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Wipe the simulated backend (used by the "Demo · reset" button). */
export function reset() {
  memStore = null;
  memPhotos.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("tba-mock")) localStorage.removeItem(k);
  } catch { /* ignore */ }
}
