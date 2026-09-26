// v2 contract (docs/PLAN.md › "v2 contract"). Everything past `id` + `status`
// is optional in practice: the backend fills the row in as the agent works.

export type Status =
  | "recognizing" | "needs_details" | "writing" | "ad_ready" | "needs_connection" | "publishing"
  | "live" | "negotiating" | "deal" | "pickup_scheduled" | "sold" | "error"
  /** Legacy alias of `recognizing`. */
  | "analyzing"
  /** Legacy: treated as `sold`. */
  | "delisted"
  /** Legacy: the agent is fully autonomous; shown as "Negotiating". */
  | "needs_you";

export type Platform = "marktplaats" | "ebay";
export type Goal = "week" | "two_weeks" | "no_rush";
/** Values the backend uses for condition. */
export type ConditionNL = "Nieuw" | "Zo goed als nieuw" | "Gebruikt" | "Niet werkend";

export type Comp = { title: string; price: number; url?: string; image?: string; platform?: Platform };
export type Listing = { platform: Platform; status: "pending" | "live" | "removed" | "error"; url?: string; price?: number };
/** `offer` is optional structured data; without it the app reads the amount from the text. */
export type Message = { from: "buyer" | "agent"; text: string; ts: string; offer?: number };
export type Conversation = {
  id: string; platform: Platform; buyer: string;
  state: "open" | "deal" | "declined" | "pickup_scheduled";
  lastOffer?: number; messages: Message[];
};
export type ItemEvent = { ts: string; type: "step" | "decision" | "notify" | "error"; text: string; meta?: Record<string, unknown> };
export type Pickup = {
  start: string; end: string; buyer: string; platform: string;
  calendarEventId?: string; label?: string; addressShared?: boolean;
};

/** attributes[] may be plain strings ("Colour: beige") or {name, value} pairs. */
export type Attribute = string | { name?: string; label?: string; value?: string };

export type Recognition = {
  name?: string; brand?: string; category?: string; condition?: ConditionNL | string;
  attributes?: Attribute[];
};

export type Item = {
  id: string; status: Status; createdAt: string;
  photos: string[];
  coverIndex?: number;
  recognition?: Recognition;
  compsCount?: number;
  goal?: Goal | string; floorPrice?: number;
  delivery?: "pickup"; pickupCity?: string;
  title?: string; description?: string; category?: string; condition?: string;
  askPrice?: number; priceRange?: { low: number; mid: number; high: number };
  pricePlan?: { price: number; from: string }[];
  comps?: Comp[];
  listings: Listing[];
  conversations: Conversation[];
  events: ItemEvent[];
  pickup?: Pickup;
  sale?: { price: number; platform: Platform; buyer?: string; ts: string };
  recap?: { days?: number; messages?: number; counters?: number };
  now?: string;
  stats?: { views?: number; saves?: number; chats?: number };
};

/** Not pinned down in the contract; we accept any subset of Item. */
export type ItemSummary = Partial<Item> & { id: string; status: Status; photo?: string };

export type IntakeRequest = { photos: string[] };
export type DetailsRequest = {
  itemId: string; name: string; condition: ConditionNL; goal: Goal; floorPrice: number;
  delivery: "pickup"; pickupCity: string;
  /** Extras the backend may ignore. */
  coverIndex?: number; conditionLabel?: string; attributes?: string[];
};
export type ApproveRequest = { itemId: string; title?: string; description?: string; askPrice?: number };
