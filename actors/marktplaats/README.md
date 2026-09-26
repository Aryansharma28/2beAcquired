# marktplaats (Apify actor)

The Marktplaats "hands" of 2beAcquired: comparables, inbox, replies, listing stats, and placing,
repricing and removing ads on marktplaats.nl. One actor, one input field `action`.

Marktplaats has no consumer API. Reads and chat go through the site's own JSON endpoints with a
stored session cookie (plain HTTP, no browser, fast and cheap). Placing, repricing and removing ads
drive the real site with Playwright (Chrome) on the same session. **Login is never automated**
(SMS 2FA, reCAPTCHA enterprise, fingerprinting): a human logs in once with `scripts/mp-login`.

## Actions

| action | input | how | output (dataset items + `OUTPUT` record) |
|---|---|---|---|
| `comps` | `query`, `limit` (30), `categoryId?`, `includeNoPrice` (false), `excludeBusiness` (true) | `GET /lrp/api/search`, no login | `[{ itemId, title, price, priceType, url, image, date, dateIso, city, condition, delivery, categoryId, sellerId, reserved, promoted, platform }]` |
| `stats` | `listingUrl` or `listingId` | public listing page, `window.__CONFIG__.listing` | `{ listingId, url, status: "active"\|"removed", title, views, favorites, since, price, priceType, reserved, bids[], highestBid, category }` |
| `inbox` | `since?` (ISO), `conversationLimit` (20), `includeBids` (true), `sellingOnly` (true) | tRPC `conversations.getConversations` / `getMessagesForConversation` (legacy HAL fallback on 404), own ads `GET /my-account/sell/api/listings`, bids from each ad's page | `[{ type: "conversation"\|"bids_only", conversationId, listingId, listingTitle, listingUrl, role, buyer: {id,name}, unread, lastActivity, messages: [{id, from: "buyer"\|"me"\|"system", text, ts, type, offer, isNew}], bids: [{bidId, amount, ts, bidder}], buyerBid }]` |
| `reply` | `conversationId`, `text`, `replyMode` (`auto`) | `POST /messages/api/conversations/{id}/message {text}` with a fresh `x-mp-xsrf`; `auto` falls back to typing in the chat UI only if the endpoint refuses (404/4xx) | `{ ok, conversationId, mode, text, sentAt }` |
| `post` | `title`, `description`, `price`, `priceType` (Vraagprijs), `allowBids` (true), `minBid?`, `categoryHint?`, `photoUrls[]`, `condition` (used), `delivery` (pickup), `postcode?`, `attributes?`, `dryRun` | Playwright on `/plaats` | `{ ok, dryRun, listingId, url, placeButtonFound, steps[], warnings[], screenshots[] }` |
| `update_price` | `listingId`, `price`, `dryRun` | Playwright via "Mijn advertenties" -> edit | `{ ok, dryRun, listingId, price, previousPrice, verifiedPrice, screenshots[], notes[] }` |
| `delist` | `listingId`, `delistReason` (`sold_elsewhere`), `dryRun` | Playwright via "Mijn advertenties" -> delete | `{ ok, dryRun, listingId, alreadyRemoved, verified, screenshots[], notes[] }` |

Common: `useProxy` (false; Apify RESIDENTIAL, countryCode NL, one sticky IP per run), `sessionStore`
(required for logged-in actions, no default; `mp-session` is the owner's own login from scripts/mp-login), `photoStore` (`tba-photos`), `headful` (local debugging only).

`photoUrls` entries can be `https://` URLs, `data:` URIs, or keys in the `photoStore` KV store.
`condition`: `new`, `as_good_as_new`, `used`, `refurbished`, `not_working`, or the Dutch label.
`delivery`: `pickup` (Ophalen), `shipping` (Verzenden), `both` (Ophalen of Verzenden).

### Errors

A failed run ends as FAILED; its status message and `OUTPUT.error` start with a code, so n8n (W0)
can branch on a prefix:

- `SESSION_EXPIRED` no stored session, HTTP 401, or a redirect to `/identity/...` -> run `scripts/mp-login` again
- `CAPTCHA` visible challenge / bot wall -> a human has to look
- `BLOCKED` still 429 after retries -> back off
- `INPUT`, `NOT_FOUND`, `UI_CHANGED` (an expected form element is missing; see the screenshots), `FAILED`

The session is written back to `mp-session` after every run, except when the site rejected it
(so a transient 401 never replaces a good login with anonymous cookies). Writes are never retried
after a 5xx.

### Debug records (default KV store of the run)

- `<action>-NN-<step>.jpeg`: a full-page screenshot per major step (browser actions), also on error
- `<action>-SCREENSHOTS`: list of `{key, step, url}`
- `<action>-NETWORK_LOG`: every non-GET XHR the site itself sent (method, url, status, body). After a
  live `update_price` / `delist` this reveals the real save/delete endpoints.

## Session: log in once

```bash
npm --prefix scripts/mp-login install          # once
npx tsx scripts/mp-login/index.ts              # opens Chrome/Edge; you log in by hand
npx tsx scripts/mp-login/index.ts --check      # later: is .mp-session/state.json still valid?
npx tsx scripts/mp-login/index.ts --upload-only
```

It uses a persistent profile in `.mp-session/profile` (gitignored), waits until
`/header/messages/message-count` answers 200, saves the Marktplaats-only storageState plus the
browser's user agent to `.mp-session/state.json`, and uploads it to the Apify KV store `mp-session`
(key `state`) when `APIFY_TOKEN` is set in the repo's `.env`.

## Run locally

```bash
cd actors/marktplaats
npm install
npm run build && npm test
mkdir -p storage/key_value_stores/default
echo '{"action":"comps","query":"ikea poang","limit":20}' > storage/key_value_stores/default/INPUT.json
apify run -p        # or: npx apify-cli run -p
cat storage/key_value_stores/default/OUTPUT.json
```

Session-based actions read `storage/key_value_stores/mp-session/state.json` locally. Copy it from
the login script: `mkdir -p storage/key_value_stores/mp-session && cp ../../.mp-session/state.json storage/key_value_stores/mp-session/state.json`.
Add `"headful": true` to watch the browser.

## Deploy

```bash
cd actors/marktplaats
apify login          # paste the APIFY_TOKEN
apify push           # builds the Docker image on Apify (apify/actor-node-playwright-chrome)
```

Give browser actions 2048 MB memory; HTTP actions run fine on 256-512 MB.

Call from n8n (HTTP Request node) or curl:

```bash
curl -X POST "https://api.apify.com/v2/acts/<username>~marktplaats/run-sync-get-dataset-items?token=$APIFY_TOKEN&memory=512" \
  -H 'Content-Type: application/json' -d '{"action":"inbox","since":"2026-09-26T10:00:00Z"}'
```

## Examples

```json
{ "action": "comps", "query": "eiken stoel", "limit": 30 }
{ "action": "stats", "listingUrl": "https://www.marktplaats.nl/v/huis-en-inrichting/fauteuils/m2446876735-fauteuil-ikea-poang" }
{ "action": "inbox", "since": "2026-09-26T10:00:00Z" }
{ "action": "reply", "conversationId": "pj39:5871xhr:2psmwk4mr", "text": "Hoi! Ja, hij is nog beschikbaar." }
{ "action": "post", "dryRun": true, "title": "IKEA Poäng fauteuil, berken met beige kussen", "description": "Fijne fauteuil...\nOphalen in Utrecht.", "price": 45, "priceType": "Vraagprijs", "allowBids": true, "minBid": 30, "categoryHint": "Fauteuils", "photoUrls": ["https://example.com/poang1.jpg"], "condition": "used", "delivery": "pickup", "postcode": "3511AB" }
{ "action": "update_price", "listingId": "m2446876735", "price": 39, "dryRun": true }
{ "action": "delist", "listingId": "m2446876735", "delistReason": "sold_on_marktplaats", "dryRun": true }
```

## What is verified and what is not (26 Sept 2026)

- Verified live: `comps` (search JSON shape), `stats` (`__CONFIG__` stats and the bid shape
  `{id, value, date, user:{id,nickname}}`), 401 handling on every account endpoint, the login-wall
  redirect on `/plaats` -> `SESSION_EXPIRED`.
- Unit-checked against jasp-nerd/marktplaats-mcp (`npm test`): inbox/reply URLs, headers, body, XSRF,
  legacy fallbacks and payload shapes.
- Not yet run with a real account: `inbox`, `reply`, `post`, `update_price`, `delist`. Run `post`,
  `update_price` and `delist` with `dryRun: true` first and read the screenshots. The `post` selectors
  come from spo0nman/opruimer ("verified against the live form 2026-09"); the final place button, the
  "allow bids" toggle, and the whole update_price / delist flows are best guesses (see the `GUESS`
  comments in `src/actions/post.ts` and `src/lib/myAds.ts`).
