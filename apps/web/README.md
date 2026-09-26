# 2beAcquired — web app

Phone-first Next.js PWA (App Router, TypeScript, Tailwind v4). Screens:

| Route | Screen |
|---|---|
| `/` | Your items (selling / sold) |
| `/new` | 1 · Photo(s) + minimum price → **Sell it** (always sends `goal: "fast"`) |
| `/item/[id]` | Picks the screen from `item.status`: `analyzing` → 2 Agent at work · `ad_ready`/`publishing` → 3 Ad ready (informational 10 s countdown; the backend publishes itself) · `live`/`negotiating` → 4 Chats · `deal`/`pickup_scheduled` → 5 "Sold, pickup planned" (pickup card + the closing chat) · `sold`/`delisted` → 5 Sold. Tabs to view the Ad and Agent log at any time. |

The app is **status-only**: the agent is fully autonomous, so there are no approve/accept/counter/edit controls and the app never calls `/tba/approve`. A `Pickup` card shows whenever `item.pickup` (`{ start, end, buyer, platform, calendarEventId? }`) is set.

## Run

```bash
cd apps/web
npm install
cp .env.example .env.local   # then edit
npm run dev                  # http://localhost:3000 (open at 390px wide)
npm run build && npm start   # production (service worker only registers here)
```

## Env vars

| Var | Where | Meaning |
|---|---|---|
| `N8N_WEBHOOK_BASE` | server only | e.g. `https://aryansharma28.app.n8n.cloud/webhook`. Used by the proxy. |
| `NEXT_PUBLIC_MOCK` | client, build-time | `1` = simulated backend in the browser. Anything else = real n8n. |

## Talking to n8n (no CORS needed)

The browser only calls same-origin routes; `app/api/tba/[...path]/route.ts` forwards them server-side:

| Browser | n8n |
|---|---|
| `POST /api/tba/intake` | `POST ${N8N_WEBHOOK_BASE}/tba/intake` |
| `GET /api/tba/item?id=…` | `GET ${N8N_WEBHOOK_BASE}/tba/item?id=…` |
| `GET /api/tba/items` | `GET ${N8N_WEBHOOK_BASE}/tba/items` |

Query string and JSON body are forwarded as-is; status and JSON come back unchanged (an n8n single-item array is unwrapped client-side). Because the proxy runs on our server, the n8n webhooks do **not** need `Access-Control-Allow-Origin`.

Photos are downscaled client-side to max 1280 px JPEG (q 0.8), sent as base64 without the `data:` prefix — roughly 150–400 KB per photo, max 6 photos. Route handlers have no body limit locally; on Vercel the serverless request limit is 4.5 MB, so keep to ~4 photos there.

`/tba/item` is polled every 2.5 s on the item page. The app expects `/tba/items` to return `{ items: [...] }` (a bare array also works) where each entry has at least `id` and `status`, and ideally `title`, `askPrice`, `photos` (or `photo`), `createdAt`, `sale`, `conversations`.

## Mock mode

`NEXT_PUBLIC_MOCK=1` swaps `lib/api.ts` onto `lib/mock.ts`, a simulated backend in the browser (state in `localStorage`, so reloads keep working). It plays a scripted timeline (~45 s) for a vintage oak chair, Marktplaats only:

- 0–6 s: photo received → *Recognised: Vintage oak chair* → *23 comparable listings (€60–€120)* → *Strategy: ask €95, never below €70* → `ad_ready`
- 10 s countdown → the agent publishes → live on Marktplaats
- Daan: *"Would you do 50?"* → agent counters €85 → Daan €80 → deal (minimum €70) → `deal`
- Agent: *"Top! Wanneer kun je hem ophalen? Ik kan za 14:30 of zo 11:00"* → Daan: *"za 14:30 prima"* → `pickup_scheduled` (next Saturday 14:30, in the calendar)
- Removed from Marktplaats → `sold`

The mock polls every 0.8 s so the steps animate smoothly on video. **Use sample photo** on `/new` and **Demo · reset** on `/` only appear in mock mode.
