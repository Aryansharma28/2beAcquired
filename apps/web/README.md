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
| `N8N_WEBHOOK_BASE` | server | e.g. `https://aryansharma28.app.n8n.cloud/webhook`. Used by the proxy and the account/connect routes. |
| `POOF_APP_KEY` | server | Shared secret, sent to n8n as `X-Poof-Key` on every call. |
| `POOF_SESSION_SECRET` | server | HMAC key for the `poof_uid` cookie and the Connector `deviceToken`. Required in production. |
| `APIFY_TOKEN` | server | Photos (`/api/photo`) and the per-user Marktplaats session stores `mp-session-<userId>`. |
| `APIFY_PHOTO_STORE` | server | Private KV store holding the photos. |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL. Supabase is only the login (see below). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase anon key: public by design (the browser asks for and checks the email code with it); it can't read any data. |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Supabase service-role key (reads/writes `poof_accounts`). Never in the browser. |
| `NEXT_PUBLIC_MOCK` | client, build-time | `1` = simulated backend in the browser (demo video). Unset in production. |

## Accounts and Marktplaats (v3)

Log in with **Google** or a **6-digit email code** on `/login` (poof's own screens; only Google's account picker is Google's). Supabase Auth does the checking (plain fetch, no SDK). For the email code the browser talks to Supabase itself (`lib/auth.ts`: `/auth/v1/otp`, `/auth/v1/verify`), so Supabase's per-IP limits apply to each person (30 wrong codes per 5 min, one code per 60 s per email); the server never takes the browser's word for it:

| Route | Does |
|---|---|
| `POST /api/auth/session {accessToken}` | asks Supabase whose token it is (`/auth/v1/user`) → signs in → ends that Supabase session → `{onboarded}`. Same-origin only. |
| `GET /api/auth/google` | PKCE verifier in an httpOnly cookie → Supabase → Google |
| `GET /api/auth/google/callback` | swaps the code for the user → signs in → `/login?done=home\|welcome` (plays the poof) |
| `POST /api/auth/logout` | clears the cookie (same-origin only) |

Signing in (`lib/server/login.ts`) looks the login up in Supabase table `poof_accounts` (`auth_id` ↔ `poof_uid`, one to one). First login: a poof account already on this device (made before logins existed) is adopted, else a new `usr_<random>`; `n8n POST /tba/users` makes the profile row (idempotent, with the Google name). Then the httpOnly cookie `poof_uid=<userId>.<hmac>` (1 year, SameSite=Lax, Secure in production) is the session, exactly as before; n8n only ever sees the `usr_…` id. `GET /api/account` reads `n8n GET /tba/me`; `PATCH /api/account` → `n8n POST /tba/me`. Not signed in → `/login`; signed in but not onboarded → `/welcome` (name + pickup city/address/hours → Connect Marktplaats). Settings (avatar on `/`) shows the Marktplaats status, pickup details and Log out.

Supabase project **poof** (`muzlezbqkvctlfwcwobf`, Frankfurt). Setup lives in `supabase/` (config, migration, email template): `npx supabase link --project-ref muzlezbqkvctlfwcwobf`, `npx supabase db push`, `npx supabase config push`. The branded code email needs a custom SMTP sender (free-tier rule); Google needs the OAuth client in `[auth.external.google]`.

Connecting uses the **poof Connector** Chrome extension (`/connector` explains the install; zip at `/poof-connector.zip`):

| Route | Caller | Does |
|---|---|---|
| `POST /api/connect/code` | app | `n8n POST /tba/pair/new` → `{code, expiresAt}` (the app refreshes it when it expires and polls `/api/account` every 2 s) |
| `POST /api/connect/claim` | extension (CORS) | `{code, cookies[], userAgent, mpUser{id,name}, extVersion}` → `n8n POST /tba/pair/claim {code}` → `{userId}`; writes the Playwright storageState to Apify KV `mp-session-<userId>` key `state`; `n8n POST /tba/mp-connected {userId, name, store, storeId, mpUserId, extVersion}` → `{ok, name, deviceToken}` |
| `POST /api/connect/refresh` | extension (CORS) | `{deviceToken, cookies[], userAgent}` → overwrites the stored session |
| `POST /api/connect/disconnect` | extension (CORS) or app | `{deviceToken}` or the cookie → deletes the session record + `n8n POST /tba/mp-disconnected {userId}` |
| `DELETE /api/connect` | app | same, via the cookie |

An item in status `needs_connection` (approved while not connected) shows "Connect Marktplaats to put this online"; after connecting the app calls `/tba/approve` again.

## Deploy (Vercel)

1. New project → import the repo → **Root Directory `apps/web`** (framework: Next.js, default build).
2. Set the env vars above (Production + Preview): `N8N_WEBHOOK_BASE`, `POOF_APP_KEY`, `POOF_SESSION_SECRET`, `APIFY_TOKEN`, `APIFY_PHOTO_STORE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Leave `NEXT_PUBLIC_MOCK` unset (set it to `1` only on a separate demo deployment).
3. API routes run on the Node runtime; `/api/tba/*` and `/api/connect/claim` export `maxDuration = 60`. Serverless request bodies are capped at 4.5 MB, so intake photos are downscaled client-side (max 5).
4. Put the Connector zip at `public/poof-connector.zip`, and point the extension at the deployment URL.

## Talking to n8n (no CORS needed)

The browser only calls same-origin routes; `app/api/tba/[...path]/route.ts` forwards them server-side:

| Browser | n8n |
|---|---|
| `GET/POST /api/tba/me` | `${N8N_WEBHOOK_BASE}/tba/me` |
| `POST /api/tba/intake` | `POST ${N8N_WEBHOOK_BASE}/tba/intake` |
| `POST /api/tba/details` | `POST ${N8N_WEBHOOK_BASE}/tba/details` |
| `POST /api/tba/approve` | `POST ${N8N_WEBHOOK_BASE}/tba/approve` |
| `GET /api/tba/item?id=…` | `GET ${N8N_WEBHOOK_BASE}/tba/item?id=…` |
| `GET /api/tba/items` | `GET ${N8N_WEBHOOK_BASE}/tba/items` |

The proxy requires the `poof_uid` cookie (401 otherwise; the app then goes to `/welcome`) and adds `X-Poof-Key` + `X-Poof-User`. Query string and JSON body are forwarded as-is; status and JSON come back unchanged (an n8n single-item array is unwrapped client-side). Because the proxy runs on our server, the n8n webhooks do **not** need `Access-Control-Allow-Origin`.

Photos are downscaled client-side to max 1280 px JPEG (q 0.8), sent as base64 without the `data:` prefix — roughly 150–400 KB per photo, max 5 photos. Route handlers have no body limit locally; on Vercel the serverless request limit is 4.5 MB, so keep to ~4 photos there.

`/tba/item` is polled every 2.5 s on the item page. The app expects `/tba/items` to return `{ items: [...] }` (a bare array also works) where each entry has at least `id` and `status`, and ideally `title`, `askPrice`, `photos` (or `photo`), `createdAt`, `sale`, `conversations`.

## Mock mode

`NEXT_PUBLIC_MOCK=1` swaps `lib/api.ts` onto `lib/mock.ts`, a simulated backend in the browser (state in `localStorage`). Like the real backend it waits for the owner at `/details` and `/approve`. Story: an IKEA POÄNG rocking chair (`public/demo/poang.jpg` via **Use sample photo**):

- intake: Google Lens → 40 similar listings (€25–€50) → `needs_details` after ~5 s
- details: price €45, never below the minimum (default €30) → ad written → `ad_ready` after ~6 s
- approve: Marktplaats agent posts → `live` after ~5 s, then over ~35 s: Mila "Wil je 25?" → countered €40 · Tom asks for bank details + courier → declined and folded · Mila "35 en ik haal hem zaterdag op?" → deal €35 → pickup za 14:00 in the calendar → removed from Marktplaats → `sold`

The mock also fakes the account: onboarding stores it in `localStorage`, and the fake Connector "connects" ~6 s after the code is shown. Approving while not connected gives `needs_connection`, like the real backend. **Demo · reset** on `/` wipes the mock state, including the account (back to onboarding).
