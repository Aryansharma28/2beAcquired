import type { Attribute, ConditionNL, Conversation, Goal, Item, ItemSummary, Message, Platform, Status } from "./types";

export const eur = (n?: number) =>
  n == null ? "—" : `€${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")}`;

export const PLATFORM: Record<Platform, string> = { marktplaats: "Marktplaats", ebay: "eBay" };

export function timeAgo(ts?: string) {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const clock = (ts: string) =>
  new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export type Tone = "cobalt" | "tag" | "go" | "alert" | "mute";
export const STATUS: Record<Status, { label: string; tone: Tone }> = {
  recognizing: { label: "Setting up", tone: "mute" },
  analyzing: { label: "Setting up", tone: "mute" },
  needs_details: { label: "Setting up", tone: "mute" },
  writing: { label: "Setting up", tone: "mute" },
  ad_ready: { label: "Setting up", tone: "mute" },
  needs_connection: { label: "Connect Marktplaats", tone: "tag" },
  publishing: { label: "Setting up", tone: "mute" },
  live: { label: "Live", tone: "go" },
  negotiating: { label: "Negotiating", tone: "cobalt" },
  needs_you: { label: "Negotiating", tone: "cobalt" },
  deal: { label: "Deal", tone: "tag" },
  pickup_scheduled: { label: "Pickup planned", tone: "tag" },
  sold: { label: "Sold", tone: "go" },
  delisted: { label: "Sold", tone: "go" },
  error: { label: "Problem", tone: "alert" },
};

export const isSetup = (s: Status) =>
  ["recognizing", "analyzing", "needs_details", "writing", "ad_ready", "needs_connection", "publishing"].includes(s);
export const isClosed = (s: Status) => ["deal", "pickup_scheduled", "sold", "delisted"].includes(s);

export const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "week", label: "This week", hint: "Faster sale, slightly lower price" },
  { value: "two_weeks", label: "2 weeks", hint: "Balanced" },
  { value: "no_rush", label: "No rush", hint: "Holds out for the best price" },
];

export type ConditionChip = "New" | "Like new" | "Good" | "Used";
export const CONDITIONS: ConditionChip[] = ["New", "Like new", "Good", "Used"];
export const CONDITION_NL: Record<ConditionChip, ConditionNL> = {
  New: "Nieuw", "Like new": "Zo goed als nieuw", Good: "Gebruikt", Used: "Gebruikt",
};
export function chipFor(c?: string): ConditionChip {
  const s = (c ?? "").toLowerCase();
  if (s.startsWith("nieuw") || s === "new") return "New";
  if (s.includes("zo goed als nieuw") || s.includes("like new")) return "Like new";
  if (s.includes("niet werkend") || s === "used") return "Used";
  return "Good";
}

export function attrText(a: Attribute): string {
  if (typeof a === "string") return a;
  const k = a.name ?? a.label;
  return [k, a.value].filter(Boolean).join(": ");
}

export type OfferChip = { kind: "offer" | "counter" | "deal"; amount: number };

/** Structured `offer` wins; otherwise read the amount from the text (EN + NL). */
export function offerIn(m: Message, c: Conversation): OfferChip | null {
  if (c.state === "declined" && m.from === "agent") return null;
  let amount = m.offer;
  if (amount == null) {
    const match =
      m.text.match(/€\s?(\d{2,5})(?![–-]\s?€?\d)/) ??
      m.text.match(/\b(?:do|at|for|offer|pay|je|voor|bied|bod)\s+(\d{2,5})\b/i) ??
      m.text.match(/^\s*(\d{2,5})\b/);
    if (!match) return null;
    amount = Number(match[1]);
    if (m.from === "agent") {
      // Agent quoting comparables ("€35–€50") isn't a counter; take the last standalone amount.
      const all = [...m.text.matchAll(/€\s?(\d{2,5})(?![–-])/g)].map((x) => Number(x[1]));
      amount = all.at(-1) ?? amount;
    }
  }
  if (m.from === "buyer") return { kind: "offer", amount };
  if (/\bdeal\b|accept|akkoord/i.test(m.text)) return { kind: "deal", amount };
  return { kind: "counter", amount };
}

/** "Sat 3 Oct, 14:30" */
export function pickupWhen(startIso: string) {
  const d = new Date(startIso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return { day, time, weekday: d.toLocaleDateString("en-GB", { weekday: "short" }), date: d.getDate(), month: d.toLocaleDateString("en-GB", { month: "short" }) };
}

export const shortDay = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (d.getTime() - Date.now() < 3600_000) return "now";
  return d.toLocaleDateString("en-GB", { weekday: "short" });
};

/** "€45 now → €40 Mon → €35 Wed, never below €30" */
export function planLine(item: Item) {
  const plan = item.pricePlan ?? [];
  if (!plan.length) return null;
  const steps = plan.map((p, i) => `${eur(p.price)} ${i === 0 ? "now" : shortDay(p.from)}`).join(" → ");
  return item.floorPrice != null ? `${steps}, never below ${eur(item.floorPrice)}` : steps;
}

const HOUR = 3600_000;
/** Buyer messages in the last hour that the agent hasn't answered yet. */
export function unreadIn(c: Conversation, now = Date.now()) {
  let n = 0;
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const m = c.messages[i];
    if (m.from === "agent") break;
    if (now - new Date(m.ts).getTime() < HOUR) n++;
  }
  return n;
}
/** Buyer messages in the last hour across the ad, or null when unknown. */
export function recentBuyerMessages(i: ItemSummary, now = Date.now()) {
  if (!i.conversations) return null;
  return i.conversations.reduce(
    (s, c) => s + c.messages.filter((m) => m.from === "buyer" && now - new Date(m.ts).getTime() < HOUR).length, 0);
}

export function recapOf(item: Item) {
  const counters = item.conversations.reduce(
    (s, c) => s + c.messages.filter((m) => offerIn(m, c)?.kind === "counter").length, 0);
  const messages = item.conversations.reduce((s, c) => s + c.messages.length, 0);
  const end = new Date(item.sale?.ts ?? Date.now()).getTime();
  const ms = Math.max(0, end - new Date(item.createdAt).getTime());
  const r = item.recap ?? {};
  const days = r.days ?? ms / 86400_000;
  const duration =
    days >= 1 ? `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`
      : ms < HOUR ? `${Math.max(1, Math.round(ms / 60000))} min` : `${Math.round(ms / HOUR)} h`;
  return { duration, messages: r.messages ?? messages, counters: r.counters ?? counters };
}

/** What the agent is doing right now. */
export function nowLine(item: Item) {
  if (item.now) return item.now;
  const waiting = item.conversations.filter((c) => c.state !== "declined" && c.messages.at(-1)?.from === "buyer").length;
  if (waiting) return `Answering ${waiting} new message${waiting > 1 ? "s" : ""}`;
  return item.events.at(-1)?.text ?? "Waiting for buyers";
}

export const lastTs = (c: Conversation) => c.messages.at(-1)?.ts ?? "";

// ---------------------------------------------------------------- deal / sold (prototype v2)

/** Payment as the backend may report it (Stripe payment link); not in the v2 contract yet. */
type WithPayment = { payment?: { status?: string } | null };
export const isPaid = (item: Item) => (item as Item & WithPayment).payment?.status === "paid";

/**
 * "pending": the deal is agreed but the item isn't handed over (prototype: "Deal done").
 * "sold": handed over / paid. null: still selling.
 */
export function dealStage(item: Item): "pending" | "sold" | null {
  if (item.status === "sold" || item.status === "delisted" || isPaid(item)) return "sold";
  if (item.status === "deal" || item.status === "pickup_scheduled") return "pending";
  return null;
}

/** The conversation the deal was made in. */
export function dealConversation(item: Item) {
  const first = (s?: string) => s?.split(" ")[0]?.toLowerCase();
  const who = first(item.sale?.buyer ?? item.pickup?.buyer);
  return (
    item.conversations.find((c) => c.state === "deal" || c.state === "pickup_scheduled") ??
    (who ? item.conversations.find((c) => first(c.buyer) === who) : undefined)
  );
}

/** Buyer's first name for the deal, if known. */
export function dealBuyer(item: Item) {
  return (item.sale?.buyer ?? item.pickup?.buyer ?? dealConversation(item)?.buyer)?.split(" ")[0];
}

/** Final price of the deal. */
export const dealPrice = (item: Item) => item.sale?.price ?? dealConversation(item)?.lastOffer ?? item.askPrice;

/** "Pickup Saturday" (prototype handoverLabel). */
export function handoverLabel(item: Item) {
  if (!item.pickup?.start) return "Pickup";
  const d = new Date(item.pickup.start);
  if (Number.isNaN(d.getTime())) return "Pickup";
  return `Pickup ${d.toLocaleDateString("en-GB", { weekday: "long" })}`;
}

/** "Saturday 14:00" */
export function pickupLong(startIso: string) {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-GB", { weekday: "long" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Whole days since an ISO time (0 = today). */
export function daysSince(iso?: string, now = Date.now()) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 86400_000));
}

/** Chat day separator: "Today", "Yesterday", "Sat 3 Oct". */
export function dayLabel(ts: string, now = new Date()) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
