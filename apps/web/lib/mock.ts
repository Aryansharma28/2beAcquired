// In-browser simulated backend (NEXT_PUBLIC_MOCK=1) for the v2 flow.
// Plays a realistic, scripted timeline for an IKEA POÄNG rocking chair and,
// like the real n8n backend, waits for the owner at /details and /approve.
// After approval the agent is fully autonomous: Mila haggles and buys, Tom
// tries a courier/bank-details scam and is declined.
//
// State lives in localStorage (so reloads keep working); photos go in a
// separate key per item, falling back to memory if the quota is exceeded.
// Each item has a queue of timed steps; every read applies the steps that are due.

import type {
  ApproveRequest, Comp, Conversation, DetailsRequest, Goal, IntakeRequest, Item, ItemEvent, ItemSummary,
} from "./types";

type StepKind =
  | "photos" | "lens" | "searching" | "comps" | "needsDetails"
  | "pricing" | "writing" | "adReady"
  | "posting" | "live"
  | "milaOffer" | "agentCounter" | "tomScam" | "agentDeclineTom" | "milaMeet" | "agentDeal"
  | "milaPickup" | "pickupScheduled" | "remove" | "sold";
type Step = { at: number; kind: StepKind };
type Store = { items: Record<string, Item>; queues: Record<string, Step[]>; liveAt: Record<string, number>; seeded?: boolean };

const KEY = "tba-mock-v3";
const PHOTO_KEY = (id: string) => `tba-mock-photos-${id}`;
const memPhotos = new Map<string, string[]>();
let memStore: Store | null = null;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (t: number) => new Date(t).toISOString();
const DAY = 86400_000;

const MILA = "Mila";
const TOM = "Tom";
const C_MILA = "c-mila";
const C_TOM = "c-tom";

function load(): Store {
  if (memStore) return memStore;
  let s: Store = { items: {}, queues: {}, liveAt: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { liveAt: {}, ...JSON.parse(raw) };
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
  return ["/demo/poang.jpg"];
}

function ev(item: Item, at: number, type: ItemEvent["type"], text: string, meta?: Record<string, unknown>) {
  item.events.push({ ts: iso(at), type, text, meta });
  item.now = text;
}

function say(c: Conversation, from: "buyer" | "agent", text: string, at: number, offer?: number) {
  c.messages.push({ from, text, ts: iso(at), ...(offer != null ? { offer } : {}) });
}

/** Next Saturday (never today) at hh:mm local time. */
function nextSaturday(from: number, h: number, m: number) {
  const d = new Date(from);
  d.setDate(d.getDate() + (((6 - d.getDay() + 7) % 7) || 7));
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------- data

const COMP_ROWS: [string, number][] = [
  ["IKEA Poäng schommelstoel beige", 35], ["Poäng schommelstoel IKEA, berken", 40], ["IKEA Poang rocking chair", 30],
  ["Schommelstoel Poäng met kussen", 45], ["IKEA Poäng schommelstoel zwart", 25], ["Poäng schommelstoel, z.g.a.n.", 50],
  ["IKEA schommelstoel Poäng, bruin", 38], ["Poäng schommelfauteuil", 32], ["IKEA Poäng stoel + hoes", 42],
  ["Schommelstoel IKEA Poäng eikenfineer", 48], ["Poäng rocking chair Hillared", 35], ["IKEA Poäng, knus en stevig", 28],
  ["Poäng schommelstoel wit kussen", 40], ["IKEA Poäng schommelstoel Knisa", 45], ["Schommelstoel Poäng (ophalen)", 30],
];
const COMPS: Comp[] = COMP_ROWS.map(([title, price], i) => ({
  title, price, platform: "marktplaats",
  url: `https://www.marktplaats.nl/v/huis-en-inrichting/stoelen/m${2143380000 + i * 4211}`,
}));
const COMPS_COUNT = 40;

const DESCRIPTION =
  "IKEA Poäng schommelstoel met eikenfineer frame en donkergrijs kussen (Hillared antraciet). " +
  "Zit heerlijk, veert fijn mee. Stevig, geen kraken of losse delen. Hoes is afneembaar en schoon, lichte gebruikssporen op de armleuningen.\n\n" +
  "Afmetingen: 68 × 94 × 95 cm.\n\n" +
  "Ophalen in Amsterdam. Rookvrij huis.";

const ASK: Record<Goal, number> = { week: 45, two_weeks: 48, no_rush: 50 };

function script(t0: number, kinds: [number, StepKind][]): Step[] {
  return kinds.map(([ms, kind]) => ({ at: t0 + ms, kind }));
}

function apply(s: Store, item: Item, step: Step) {
  const { at } = step;
  const floor = item.floorPrice ?? 30;
  const counter = Math.max(40, floor + 5);
  const deal = Math.max(35, floor);
  const mila = item.conversations.find((x) => x.id === C_MILA);
  const tom = item.conversations.find((x) => x.id === C_TOM);
  switch (step.kind) {
    // ---- intake (runs by itself, ends waiting for the owner)
    case "photos": {
      const n = Math.max(1, photosFor(item).length);
      ev(item, at, "step", `Got ${n} photo${n > 1 ? "s" : ""}`);
      break;
    }
    case "lens":
      item.recognition = {
        name: "IKEA POÄNG", brand: "IKEA", category: "Rocking chair", condition: "Gebruikt",
        attributes: [{ name: "Frame", value: "Oak veneer" }, { name: "Cushion", value: "Dark grey, removable cover" }, { name: "Brand", value: "IKEA" }],
      };
      item.category = "Furniture › Chairs";
      ev(item, at, "step", "Google Lens: looks like IKEA POÄNG rocking chair", { source: "google_lens" });
      break;
    case "searching":
      ev(item, at, "step", "Searching Marktplaats for similar listings");
      break;
    case "comps":
      item.comps = COMPS;
      item.compsCount = COMPS_COUNT;
      item.priceRange = { low: 30, mid: 38, high: 48 };
      ev(item, at, "step", `${COMPS_COUNT} similar listings (€25–€50)`, { count: COMPS_COUNT, low: 25, high: 50 });
      break;
    case "needsDetails":
      item.status = "needs_details";
      ev(item, at, "step", "Waiting for your answers");
      break;

    // ---- after /details
    case "pricing": {
      const goal = (item.goal as Goal) ?? "week";
      const ask = Math.max(ASK[goal] ?? 45, floor + 10);
      item.askPrice = ask;
      const drops = goal === "no_rush" ? [0, 4, 8] : goal === "two_weeks" ? [0, 3, 6] : [0, 2, 4];
      const prices = [ask, Math.max(floor, ask - 5), Math.max(floor, ask - 10)];
      item.pricePlan = prices
        .map((p, i) => ({ price: p, from: iso(at + drops[i] * DAY) }))
        .filter((p, i, a) => i === 0 || p.price < a[i - 1].price);
      ev(item, at, "decision", `Price: start at €${ask}, never below €${floor}`, { askPrice: ask, floor });
      break;
    }
    case "writing":
      ev(item, at, "step", "Writing your ad");
      break;
    case "adReady":
      item.title = "IKEA Poäng schommelstoel, eiken met donkergrijs kussen";
      item.description = DESCRIPTION;
      item.status = "ad_ready";
      ev(item, at, "step", "Ad written, waiting for your OK");
      break;

    // ---- after /approve
    case "posting":
      item.listings = [{ platform: "marktplaats", status: "pending", price: item.askPrice }];
      ev(item, at, "step", "Marktplaats agent: posting the ad");
      break;
    case "live":
      item.listings[0] = {
        ...item.listings[0], status: "live",
        url: "https://www.marktplaats.nl/v/huis-en-inrichting/stoelen/m2158873412-ikea-poang-schommelstoel",
      };
      item.status = "live";
      s.liveAt[item.id] = at;
      ev(item, at, "notify", "Live on Marktplaats");
      item.now = "Waiting for buyers";
      break;
    case "milaOffer": {
      const c: Conversation = { id: C_MILA, platform: "marktplaats", buyer: MILA, state: "open", lastOffer: 25, messages: [] };
      say(c, "buyer", "Is deze nog beschikbaar? Wil je 25?", at, 25);
      item.conversations.push(c);
      item.status = "negotiating";
      ev(item, at, "step", "New message from Mila: offers €25");
      item.now = "Answering 1 new message";
      break;
    }
    case "agentCounter":
      if (!mila) break;
      say(mila, "agent", `Hoi Mila, ja hij is nog beschikbaar! 25 is me te laag, vergelijkbare Poängs gaan voor 35 tot 50. Voor €${counter} is hij van jou.`, at, counter);
      ev(item, at, "decision", `€25 is below your €${floor} minimum → countered €${counter}`, { counter });
      break;
    case "tomScam": {
      const c: Conversation = { id: C_TOM, platform: "marktplaats", buyer: TOM, state: "open", messages: [] };
      say(c, "buyer", "Hoi, ik neem hem voor de vraagprijs. Stuur je bankgegevens, mijn koerier haalt op.", at);
      item.conversations.push(c);
      ev(item, at, "step", "New message from Tom");
      item.now = "Answering 1 new message";
      break;
    }
    case "agentDeclineTom":
      if (!tom) break;
      say(tom, "agent", "Hoi Tom, ik verkoop alleen met ophalen en betalen bij ophalen. Succes!", at);
      tom.state = "declined";
      ev(item, at, "decision", "Tom asks for bank details + a courier → scam pattern, declined");
      item.now = "Waiting for Mila";
      break;
    case "milaMeet":
      if (!mila) break;
      mila.lastOffer = deal;
      say(mila, "buyer", `${deal} en ik haal hem zaterdag op?`, at, deal);
      ev(item, at, "step", `Mila offers €${deal} and can pick it up Saturday`);
      item.now = "Answering 1 new message";
      break;
    case "agentDeal":
      if (!mila) break;
      mila.state = "deal";
      say(mila, "agent", `Deal voor €${deal}! Zaterdag kan ik om 14:00, of zondag 11:00. Wat past?`, at, deal);
      item.sale = { price: deal, platform: "marktplaats", buyer: MILA, ts: iso(at) };
      item.status = "deal";
      ev(item, at, "decision", `€${deal} is above your €${floor} minimum → deal`, { price: deal });
      item.now = "Planning the pickup with Mila";
      break;
    case "milaPickup":
      if (!mila) break;
      say(mila, "buyer", "za 14:00", at);
      break;
    case "pickupScheduled": {
      if (!mila) break;
      const start = nextSaturday(at, 14, 0);
      item.pickup = {
        start: iso(start), end: iso(start + 30 * 60000), buyer: MILA, platform: "marktplaats",
        calendarEventId: "evt_mock_pickup", label: "Sat 14:00", addressShared: true,
      };
      mila.state = "pickup_scheduled";
      say(mila, "agent", `Top, zaterdag 14:00 staat genoteerd. Adres: Linnaeusstraat 12, ${item.pickupCity ?? "Amsterdam"}. Tot dan!`, at);
      item.status = "pickup_scheduled";
      ev(item, at, "notify", "Pickup Sat 14:00 with Mila, added to your calendar");
      break;
    }
    case "remove":
      for (const l of item.listings) l.status = "removed";
      ev(item, at, "step", "Removed from Marktplaats");
      break;
    case "sold":
      item.status = "sold";
      ev(item, at, "notify", `Sold for €${item.sale?.price ?? deal}`);
      item.now = `Sold to Mila, pickup ${item.pickup?.label ?? "planned"}`;
      break;
  }
}

function tick(s: Store, id: string, now = Date.now()) {
  const q = s.queues[id];
  const item = s.items[id];
  if (!q?.length || !item) return;
  q.sort((a, b) => a.at - b.at);
  while (q.length && q[0].at <= now) apply(s, item, q.shift()!);
}

/** Views/saves grow while the ad is live, so the numbers move on video. */
function withStats(s: Store, item: Item, now = Date.now()): Item {
  const t = s.liveAt[item.id];
  if (!t) return item;
  const sec = Math.max(0, (Math.min(now, item.sale ? new Date(item.sale.ts).getTime() + 20000 : now) - t) / 1000);
  return { ...item, stats: { views: Math.round(sec * 1.4) + 3, saves: Math.floor(sec / 7), chats: item.conversations.length } };
}

// ---------------------------------------------------------------- seeds

function seed(s: Store) {
  const now = Date.now();
  s.items["demo-bike"] = {
    id: "demo-bike", status: "sold", createdAt: iso(now - 4 * DAY), goal: "week", floorPrice: 180,
    photos: ["/demo/bike.svg"], title: "Gazelle Orange C7 city bike", askPrice: 260,
    category: "Bikes", condition: "Gebruikt", pickupCity: "Amsterdam",
    listings: [{ platform: "marktplaats", status: "removed", price: 260 }],
    conversations: [{
      id: "c-bike", platform: "marktplaats", buyer: "Sanne", state: "pickup_scheduled", lastOffer: 240,
      messages: [
        { from: "buyer", text: "Hoi! Zou je 220 willen?", ts: iso(now - 3.4 * DAY), offer: 220 },
        { from: "agent", text: "Hoi Sanne, 220 is te laag. Voor €245 is hij van jou.", ts: iso(now - 3.39 * DAY), offer: 245 },
        { from: "buyer", text: "240 en ik haal hem morgen?", ts: iso(now - 3.3 * DAY), offer: 240 },
        { from: "agent", text: "Deal voor €240! Morgen 18:00?", ts: iso(now - 3.29 * DAY), offer: 240 },
      ],
    }],
    events: [
      { ts: iso(now - 4 * DAY), type: "notify", text: "Live on Marktplaats" },
      { ts: iso(now - 3.29 * DAY), type: "decision", text: "€240 is above your €180 minimum → deal" },
      { ts: iso(now - 3 * DAY), type: "notify", text: "Sold for €240" },
    ],
    pickup: { start: iso(now - 3 * DAY), end: iso(now - 3 * DAY + 1800000), buyer: "Sanne", platform: "marktplaats", label: "Wed 18:00", addressShared: true },
    sale: { price: 240, platform: "marktplaats", buyer: "Sanne", ts: iso(now - 3 * DAY) },
    recap: { days: 1, messages: 4, counters: 1 },
  };
  s.items["demo-lamp"] = {
    id: "demo-lamp", status: "negotiating", createdAt: iso(now - 1.2 * DAY), goal: "two_weeks", floorPrice: 35,
    photos: ["/demo/lamp.svg"], title: "Anglepoise-style desk lamp, green", askPrice: 55,
    category: "Lighting", condition: "Zo goed als nieuw", pickupCity: "Amsterdam",
    pricePlan: [{ price: 55, from: iso(now - 1.2 * DAY) }, { price: 50, from: iso(now + 2 * DAY) }, { price: 45, from: iso(now + 6 * DAY) }],
    listings: [{ platform: "marktplaats", status: "live", price: 55 }],
    stats: { views: 64, saves: 5, chats: 1 },
    conversations: [{
      id: "c-lamp", platform: "marktplaats", buyer: "Fleur", state: "open", lastOffer: 40,
      messages: [
        { from: "buyer", text: "Hoi, doet de lamp het nog? Zou 40 kunnen?", ts: iso(now - 0.3 * DAY), offer: 40 },
        { from: "agent", text: "Hoi Fleur, hij werkt perfect, nieuwe lamp erin. Voor €50 is hij van jou.", ts: iso(now - 0.29 * DAY), offer: 50 },
      ],
    }],
    events: [
      { ts: iso(now - 1.1 * DAY), type: "notify", text: "Live on Marktplaats" },
      { ts: iso(now - 0.3 * DAY), type: "step", text: "New message from Fleur: offers €40" },
      { ts: iso(now - 0.29 * DAY), type: "decision", text: "€40 is under the ask → countered €50" },
    ],
    now: "Waiting for Fleur to reply",
  };
  s.seeded = true;
}

// ---------------------------------------------------------------- API

export async function intake(body: IntakeRequest): Promise<{ itemId: string }> {
  await delay(600);
  const s = load();
  const id = `itm-${Date.now().toString(36)}`;
  const now = Date.now();
  savePhotos(id, body.photos.map((b) => (/^(data:|https?:|\/demo\/)/.test(b) ? b : `data:image/jpeg;base64,${b}`)));
  s.items[id] = {
    id, status: "recognizing", createdAt: iso(now), coverIndex: 0,
    photos: [], listings: [], conversations: [], events: [],
  };
  s.queues[id] = script(now, [[300, "photos"], [1600, "lens"], [2900, "searching"], [4200, "comps"], [5200, "needsDetails"]]);
  save(s);
  return { itemId: id };
}

export async function details(body: DetailsRequest): Promise<void> {
  await delay(400);
  const s = load();
  const item = s.items[body.itemId];
  if (!item) throw new Error("Unknown item");
  const now = Date.now();
  Object.assign(item, {
    status: "writing", goal: body.goal, floorPrice: body.floorPrice, condition: body.condition,
    delivery: body.delivery, pickupCity: body.pickupCity, coverIndex: body.coverIndex ?? item.coverIndex,
  } satisfies Partial<Item>);
  if (item.recognition) item.recognition = { ...item.recognition, name: body.name };
  s.queues[item.id] = [...(s.queues[item.id] ?? []), ...script(now, [[2200, "pricing"], [3600, "writing"], [6400, "adReady"]])];
  save(s);
}

export async function approve(body: ApproveRequest): Promise<void> {
  await delay(400);
  const s = load();
  const item = s.items[body.itemId];
  if (!item) throw new Error("Unknown item");
  const now = Date.now();
  if (body.title) item.title = body.title;
  if (body.description) item.description = body.description;
  if (body.askPrice) {
    item.askPrice = body.askPrice;
    if (item.pricePlan?.length) item.pricePlan[0].price = body.askPrice;
  }
  item.status = "publishing";
  item.listings = [];
  ev(item, now, "step", "Approved by you — publishing");
  s.queues[item.id] = [...(s.queues[item.id] ?? []), ...script(now, [
    [1200, "posting"], [5000, "live"],
    [9000, "milaOffer"], [12000, "agentCounter"],
    [15500, "tomScam"], [18000, "agentDeclineTom"],
    [22000, "milaMeet"], [25000, "agentDeal"],
    [30000, "milaPickup"], [32500, "pickupScheduled"],
    [37000, "remove"], [40000, "sold"],
  ])];
  save(s);
}

export async function getItem(id: string): Promise<Item> {
  await delay(60);
  const s = load();
  tick(s, id);
  save(s);
  const item = s.items[id];
  if (!item) throw new Error("This item doesn't exist in the demo data. Start a new one.");
  return structuredClone(withStats(s, { ...item, photos: photosFor(item) }));
}

export async function listItems(): Promise<ItemSummary[]> {
  await delay(120);
  const s = load();
  for (const id of Object.keys(s.items)) tick(s, id);
  save(s);
  return Object.values(s.items)
    .map((it) => {
      const photos = photosFor(it);
      return { ...withStats(s, it), photos, photo: photos[it.coverIndex ?? 0] ?? photos[0] };
    })
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
