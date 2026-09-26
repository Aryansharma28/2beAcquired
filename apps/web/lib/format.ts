import type { Conversation, Message, Platform, Status } from "./types";

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
  new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const STATUS: Record<Status, { label: string; tone: "cobalt" | "tag" | "go" | "alert" | "mute" }> = {
  analyzing: { label: "Analysing", tone: "cobalt" },
  ad_ready: { label: "Ad ready", tone: "tag" },
  publishing: { label: "Publishing", tone: "cobalt" },
  live: { label: "Live", tone: "go" },
  negotiating: { label: "Negotiating", tone: "cobalt" },
  needs_you: { label: "Negotiating", tone: "cobalt" },
  deal: { label: "Deal", tone: "go" },
  pickup_scheduled: { label: "Pickup planned", tone: "go" },
  sold: { label: "Sold", tone: "go" },
  delisted: { label: "Sold", tone: "go" },
  error: { label: "Problem", tone: "alert" },
};

export type OfferChip = { kind: "offer" | "counter" | "deal"; amount: number };

/** Messages carry no structured offer, so read the amount from the text. */
export function offerIn(m: Message, c: Conversation): OfferChip | null {
  const match =
    m.text.match(/€\s?(\d{2,5})/) ??
    m.text.match(/\b(?:do|at|for|offer|pay)\s+(\d{2,5})\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (m.from === "buyer") return { kind: "offer", amount };
  if (/\bdeal\b|accept/i.test(m.text)) return { kind: "deal", amount };
  if (/sold/i.test(m.text) && c.state === "declined") return null;
  if (/too low/i.test(m.text)) return null;
  // Agent quoting comparables ("€80–€110") isn't a counter; take the last amount instead.
  const all = [...m.text.matchAll(/€\s?(\d{2,5})(?![–-])/g)].map((x) => Number(x[1]));
  return { kind: "counter", amount: all.at(-1) ?? amount };
}

/** "Sat 3 Oct, 14:30" */
export function pickupWhen(startIso: string) {
  const d = new Date(startIso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return { day, time, weekday: d.toLocaleDateString("en-GB", { weekday: "short" }), date: d.getDate(), month: d.toLocaleDateString("en-GB", { month: "short" }) };
}
