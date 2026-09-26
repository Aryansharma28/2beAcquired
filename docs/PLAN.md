# 2beAcquired — build plan

Autonomous second-hand selling agent. Snap a photo, pick a goal, set a floor price. The agent prices it from real comparables, writes the ad, lists it on Marktplaats + eBay, negotiates with buyers, reprices, and delists everywhere once sold. You only step in when an offer is below your floor.

Build Weekend (Young Creators x Prosus), video due **Sun 27 Sept 15:00**. Jury: Autonomy 25 · Proven in real use 25 · Apify + n8n 20 · Problem fit 15 · Presentation 15.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Orchestration | n8n Cloud (`aryansharma28.app.n8n.cloud`), workflows versioned as JSON in `n8n/workflows/` | n8n is the brain; its execution log is the demo backbone |
| State | n8n Data Tables | Visible in the n8n UI to judges; no extra DB |
| Platform 1 | Marktplaats via our own Apify actor (`actors/marktplaats`) | No consumer API. Chat via internal JSON endpoints with session cookie; posting/delisting via Playwright |
| Platform 2 | eBay via official APIs from n8n HTTP nodes | Listing, messages, Best Offer accept/counter are all sanctioned |
| Comparables | Our actor (`comps` action, Marktplaats search JSON) + `caffein.dev/ebay-sold-listings` | Real market data, Apify-powered |
| Photo storage | Apify key-value store `tba-photos` | Actor reads photos from it when posting |
| Models | Claude (vision, ad copy, replies); Jev for fast verdicts (buyer type, offer score) once we have docs | |
| Notifications | ntfy.sh (action buttons call n8n webhooks) | Fastest real push to a phone |
| Front end | Next.js PWA in `apps/web` | 5 demo screens, looks right in a vertical video |
| Login | Manual, once, via `scripts/mp-login` → storageState saved to Apify KV store `mp-session` | Never automate SMS-2FA/reCAPTCHA login |

## n8n workflows

| # | Name | Trigger | Does |
|---|---|---|---|
| W1 | Intake | Webhook `POST /tba/intake` | Save photos → Claude vision (item, category, condition, search query) → comps (actor `comps` + eBay sold) → price range (Code) → AI Agent writes ad (structured output) → status `ad_ready` |
| W2 | Publish | Called by W1 (auto after countdown) or `POST /tba/approve` | Actor `post` on Marktplaats + eBay Inventory API → store listing URLs → ntfy "live on 2 platforms" |
| W3 | Inbox | Schedule, every 2 min | Actor `inbox` + eBay Message/BestOffer → per new message: AI Agent (memory per thread, tools: floor check, comps) decides accept / counter / wait / ask human → actor `reply` / eBay respond → log decision |
| W4 | Reprice | Schedule, hourly | Views, messages, age vs goal → lower price or hold → actor `update_price` / eBay revise |
| W5 | Sold | Agent tool from W3 or `POST /tba/sold` | Delist everywhere (actor `delist`, eBay withdraw) → ntfy "Sold for €X. Removed everywhere." → optional Mollie link |
| W0 | Error | Error Trigger | Classify; on expired session → ntfy "re-login needed"; retry transient failures; log |
| API | Read API | Webhooks `GET /tba/item`, `GET /tba/items` | Serve state to the app |

## API contract (app ⇄ n8n)

Base: `${N8N_BASE_URL}/webhook`

- `POST /tba/intake` `{ photos: string[] /* base64 jpeg, no data: prefix */, goal: "max_price" | "fast", floorPrice: number, notes?: string }` → `{ itemId: string }` (responds immediately; intake continues async)
- `GET /tba/item?id=<itemId>` → `Item` (below)
- `GET /tba/items` → `{ items: ItemSummary[] }`
- `POST /tba/approve` `{ itemId, action: "publish" | "accept_offer" | "reject_offer" | "counter_offer", conversationId?, amount? }` → `{ ok: true }`

```ts
type Status = "analyzing" | "ad_ready" | "publishing" | "live" | "negotiating" | "needs_you" | "sold" | "delisted" | "error";
type Item = {
  id: string; status: Status; createdAt: string;
  goal: "max_price" | "fast"; floorPrice: number;
  photos: string[];                 // public URLs
  title?: string; description?: string; category?: string; condition?: string;
  askPrice?: number; priceRange?: { low: number; mid: number; high: number };
  comps?: { title: string; price: number; url: string; image?: string; platform: "marktplaats" | "ebay" }[];
  listings: { platform: "marktplaats" | "ebay"; status: "pending" | "live" | "removed" | "error"; url?: string; price?: number }[];
  conversations: { id: string; platform: "marktplaats" | "ebay"; buyer: string; state: "open" | "deal" | "declined" | "needs_you";
                   lastOffer?: number; messages: { from: "buyer" | "agent"; text: string; ts: string }[] }[];
  events: { ts: string; type: "step" | "decision" | "notify" | "error"; text: string; meta?: Record<string, unknown> }[];
  sale?: { price: number; platform: "marktplaats" | "ebay"; ts: string };
};
```

## Apify actor `marktplaats` — input `{ action, ...params }`

| action | params | how | output (dataset item) |
|---|---|---|---|
| `comps` | `query, limit?` | HTTP `GET /lrp/api/search?query=` (no auth) | `{ title, price, priceType, url, image, date }[]` |
| `post` | `title, description, price, categoryHint, photoUrls[], condition, delivery` | Playwright with stored session | `{ listingId, url }` |
| `inbox` | `since?` | HTTP `/messages/api/conversations/` + messages, cookie + `x-mp-xsrf` | `{ conversationId, listingId, buyer, messages[] }[]` |
| `reply` | `conversationId, text` | HTTP `POST /messages/api/conversations/{id}/message` | `{ ok }` |
| `stats` | `listingUrl` | public page `stats.viewCount`, `favoritedCount` | `{ views, favorites, since }` |
| `update_price` | `listingId, price` | Playwright | `{ ok }` |
| `delist` | `listingId` | Playwright | `{ ok }` |

Session: storageState JSON in named KV store `mp-session` (key `state`), written back after each run. Residential NL proxy optional (`useProxy`). Captcha/login wall → fail with `SESSION_EXPIRED` so W0 alerts a human.

## Build order

1. Actor `comps` + `inbox` + `reply` (low risk, HTTP) → `post` (riskiest, prove early)
2. W1 Intake + read API → app screens 1–3
3. W2 Publish (Marktplaats, then eBay sandbox)
4. W3 Inbox + negotiation agent → app screen 4
5. W5 Sold, W4 Reprice, W0 Error
6. List 3–5 real items Saturday night, let it run overnight, record Sunday morning

## v2 contract — follows the board's "Demo UX flow, detailed" (26 Sept, 15:15)

Setup (owner, before launch) → then fully autonomous. No "Your call" screen, no pushes except session-expired.

Statuses: `recognizing` → `needs_details` → `writing` → `ad_ready` → `publishing` → `live` → `negotiating` → `deal` → `pickup_scheduled` → `sold` (+ `error`). (`analyzing` = legacy alias of `recognizing`.)

- `POST /tba/intake {photos: string[]}` → `{itemId}`. Runs Google Lens + vision + comparables. Ends in `needs_details` with
  `recognition: {name, brand, category, condition, attributes[]}`, `priceRange {low, mid, high}`, `compsCount`, `comps[]`, `coverIndex`.
- `POST /tba/details {itemId, name, condition, goal: "week"|"two_weeks"|"no_rush", floorPrice, delivery: "pickup", pickupCity}` → `{ok}`.
  Runs pricing + ad writing. Ends in `ad_ready` with `title, description, askPrice, floorPrice, goal, pricePlan[] ({price, from})`.
- `POST /tba/approve {itemId, title?, description?, askPrice?}` → `{ok}`. Applies edits, publishes. `publishing` → `live`.
- `GET /tba/item?id=` adds `recap {days, messages, counters}`, `now` (latest agent step), `stats {views, saves, chats}` when known.
- Condition values: "Nieuw" | "Zo goed als nieuw" | "Gebruikt" | "Niet werkend" (UI chips: New · Like new · Good · Used map to these; Good = "Gebruikt" with good note).
