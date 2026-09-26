export type Status =
  | "analyzing" | "ad_ready" | "publishing" | "live" | "negotiating"
  | "deal" | "pickup_scheduled" | "sold" | "delisted" | "error"
  /** Legacy: the agent is fully autonomous now; shown as "Negotiating". */
  | "needs_you";
export type Platform = "marktplaats" | "ebay";
export type Goal = "max_price" | "fast";

export type Comp = { title: string; price: number; url: string; image?: string; platform: Platform };
export type Listing = { platform: Platform; status: "pending" | "live" | "removed" | "error"; url?: string; price?: number };
export type Message = { from: "buyer" | "agent"; text: string; ts: string };
export type Conversation = {
  id: string; platform: Platform; buyer: string;
  state: "open" | "deal" | "declined" | "pickup_scheduled";
  lastOffer?: number; messages: Message[];
};
export type ItemEvent = { ts: string; type: "step" | "decision" | "notify" | "error"; text: string; meta?: Record<string, unknown> };
export type Pickup = { start: string; end: string; buyer: string; platform: string; calendarEventId?: string };

export type Item = {
  id: string; status: Status; createdAt: string;
  goal: Goal; floorPrice: number;
  photos: string[];
  title?: string; description?: string; category?: string; condition?: string;
  askPrice?: number; priceRange?: { low: number; mid: number; high: number };
  comps?: Comp[];
  listings: Listing[];
  conversations: Conversation[];
  events: ItemEvent[];
  pickup?: Pickup;
  sale?: { price: number; platform: Platform; buyer?: string; ts: string };
};

/** Not pinned down in the contract; we accept any subset of Item. */
export type ItemSummary = Partial<Item> & { id: string; status: Status; photo?: string };

export type IntakeRequest = { photos: string[]; goal: Goal; floorPrice: number; notes?: string };
