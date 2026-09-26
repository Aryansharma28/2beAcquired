# poof — web app

Snap it. poof. Sold. Phone-first Next.js PWA (App Router, TypeScript, Tailwind v4) for the v2 flow in `docs/PLAN.md` › "v2 contract".

The owner sets up the ad (screens 01–07) and approves it. After that the agent is **fully autonomous**: there are no accept / decline / counter buttons, no "your call" screen and no push UI. Offers below the minimum are countered at the minimum by the agent. Only Marktplaats is connected; Vinted, eBay and Facebook are shown as "soon".

| Route | Screen |
|---|---|
| `/` | 09 Your ads — cards with status chip, price tag, new-message count; navbar (Ads · + Sell) |
| `/new` | 01 Snap it — live camera (getUserMedia) with file-picker fallback, 1–5 photos → `POST /tba/intake {photos}` |
| `/item/[id]` | Picks the screen from `item.status`: `recognizing` → "Looking at your photos…" · `needs_details` → local wizard 02 Is this it? / 03 When should it be gone? / 04 What's your minimum? / 05 How does it get to the buyer? → `POST /tba/details` · `writing` → 06 Your agent is on it · `ad_ready` → 07 Here's your ad → `POST /tba/approve` (only edited fields) · `publishing` → 08 Putting it online · `live`/`negotiating` → 10 How this ad is going (stepper, numbers, "Now", price plan, activity log) · `deal`/`pickup_scheduled` → 14 "Sold, pickup planned" · `sold` → 14 Sold (10 reachable via "How this ad went") · `error` → error card + ad so far + log |
| `/item/[id]/chats` | 11 Chats — Best offers, Recent, folded "Lowballers and scams" (`state === "declined"`) |
| `/item/[id]/chats/[cid]` | 12 Negotiating — read-only thread with offer chips, strategy line, deal card |

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
| `POST /api/tba/details` | `POST ${N8N_WEBHOOK_BASE}/tba/details` |
| `POST /api/tba/approve` | `POST ${N8N_WEBHOOK_BASE}/tba/approve` |
| `GET /api/tba/item?id=…` | `GET ${N8N_WEBHOOK_BASE}/tba/item?id=…` |
| `GET /api/tba/items` | `GET ${N8N_WEBHOOK_BASE}/tba/items` |

Query string and JSON body are forwarded as-is; status and JSON come back unchanged (an n8n single-item array is unwrapped client-side). Because the proxy runs on our server, the n8n webhooks do **not** need `Access-Control-Allow-Origin`.

Photos are downscaled client-side to max 1280 px JPEG (q 0.8), sent as base64 without the `data:` prefix — roughly 150–400 KB per photo, max 5 photos. Route handlers have no body limit locally; on Vercel the serverless request limit is 4.5 MB, so keep to ~4 photos there.

`/tba/item` is polled every 2.5 s on the item page. The app expects `/tba/items` to return `{ items: [...] }` (a bare array also works) where each entry has at least `id` and `status`, and ideally `title`, `askPrice`, `photos` (or `photo`), `createdAt`, `sale`, `conversations`.

## Mock mode

`NEXT_PUBLIC_MOCK=1` swaps `lib/api.ts` onto `lib/mock.ts`, a simulated backend in the browser (state in `localStorage`). Like the real backend it waits for the owner at `/details` and `/approve`. Story: an IKEA POÄNG rocking chair (`public/demo/poang.jpg` via **Use sample photo**):

- intake: Google Lens → 40 similar listings (€25–€50) → `needs_details` after ~5 s
- details: price €45, never below the minimum (default €30) → ad written → `ad_ready` after ~6 s
- approve: Marktplaats agent posts → `live` after ~5 s, then over ~35 s: Mila "Wil je 25?" → countered €40 · Tom asks for bank details + courier → declined and folded · Mila "35 en ik haal hem zaterdag op?" → deal €35 → pickup za 14:00 in the calendar → removed from Marktplaats → `sold`

**Demo · reset** on `/` wipes the mock state.
