# Handover (27 Sept 2026, morning)

For the next Claude Code session on **poof** (repo `Desktop\2beAcquired`, github.com/Aryansharma28/2beAcquired). Read this, then `docs/REQUIREMENTS.md` (hard rules), then `README.md`. Demo video is due **Sunday 27 Sept 15:00**.

## What poof is
Snap a photo, confirm what it is, set a minimum; an agent prices it from real Marktplaats listings, writes and posts the ad, negotiates with buyers, books the pickup, sends a payment link and takes the ad down.

- `apps/web` Next.js PWA, production **https://poof-lovat.vercel.app** (Vercel project `poof`, root dir `apps/web`; **every push to `main` deploys production**, so changes go through PRs only).
- `n8n/src/*.mjs` workflows as code on **aryansharma28.app.n8n.cloud**, deploy with `node n8n/deploy.mjs [key]` (key = file name without number, e.g. `publish`, `inbox`).
- `actors/marktplaats` Apify actor `jadelike_loyalty~marktplaats` (push with `npx -y apify-cli push` from that folder) and the **laptop runner** `local-runner.mjs`.
- Data lives in **n8n Data Tables** (items, users, events, messages, conversations, decisions, pairings). No Supabase (user decided).

## How it runs right now (important)
- **Marktplaats-session actions run on this laptop**, not Apify: n8n → Cloudflare quick tunnel → `local-runner.mjs` → the actor in a visible **CloakBrowser** window. Cloud-posted ads got hidden by Marktplaats 3/3; laptop posts stay public.
- Running now: runner on `localhost:8787` (with the 15 s chat watcher) and a tunnel, URL in `.env` `LOCAL_RUNNER_URL`, and n8n is deployed with it. A quick tunnel can die on its own; if `curl $LOCAL_RUNNER_URL/health` fails but `localhost:8787/health` is ok, open a new tunnel (`npx -y cloudflared tunnel --url http://localhost:8787`), put its URL in `.env` and run `node n8n/deploy.mjs`.
- **If the laptop slept, the session ended or the tunnel died**: stop old `local-runner.mjs`/`cloudflared` processes, then `node actors/marktplaats/start-local.mjs` and keep it running (it rebuilds, starts runner + tunnel, writes `.env`, redeploys n8n). Check: `curl $LOCAL_RUNNER_URL/health` → `ok`. Starting it twice gives `EADDRINUSE :8787` (harmless if the first runner is alive).
- **Demo mode** `DEMO_MP_STORE=mp-session`: every poof account sells on the owner's Marktplaats session (account "Teije Keesmaat"), stored in Apify KV store `mp-session` (key `state`). No connect step for users.
- Live posting: `MP_DRY_RUN=0`, fallback postcode `MP_POSTCODE=1318DJ` (Almere).

## What is done and verified
- CloakBrowser only (no Playwright fallback), fixed fingerprint + sticky proxy per account.
- Posting from the phone app → laptop → public ad (verified twice). Post reports `visibility` (visible/inactive).
- Delist via the owner's seller page (dialog "verkocht via Marktplaats?" deletes), verified on the seller page.
- Fixing a wrong recognition ("Not right? Fix it" → "Use this name") re-runs the market check (`n8n/src/16-rename.mjs`).
- Negotiation rule (owner's request): **push once to the asking price, then let go** (accept >= minimum; below minimum one final offer at the minimum, then decline), enforced in `GUARDRAILS` in `n8n/src/30-inbox.mjs`, tested via the no-side-effects webhook `tba/test-negotiator`. The LLM (Groq `openai/gpt-oss-120b`, free tier 8k tokens/min) retries 5x.
- Chats near real time: laptop watcher polls the unread counter every 15 s → `tba/inbox-now`; n8n schedule every 5 min as backup.
- Payments: **Stripe test mode** (Mollie needs KvK). After a pickup is booked (W5 `50-pickup.mjs`) the buyer gets a Stripe Payment Link (iDEAL/card); webhook `tba/stripe` (W6 `55-payments.mjs`) verifies the event with Stripe and marks the item **sold/paid**. Verified end to end with a test iDEAL payment. Test entrance: `POST tba/test-pickup` (X-Poof-Key) with `{itemId, price, buyer, platform, conversationId, pickup}`.
- Teije's PRs #1 (wireframes) and #2 (visual design) merged (design files only). **PR #3 reskin merged and live** (commit `7c88de6`): verified by build + lint + two independent mock-mode walkthroughs (no blockers) + fixes (pickup city from profile, price plan follows edited price, description Done button, 16px inputs, chat opens at newest, "How this ad went").
- Vercel Git builds fixed (Root Directory was `.`, now `apps/web`).
- **Data is real**: all test accounts/items deleted. Left: user `usr_t0kg5g5ydbwbs1z8` (Aryan, Almere) with `itm_muiro2cj90m9` (AirPods Pro 1e gen, **live** m2447096237, negotiating with buyer "Teije") and `itm_muirf9ofn1r9` (ended on Marktplaats, marked delisted).

## Not verified yet / open
1. **Reskin against the real backend in production**: pages return 200 and the build is Ready, but nobody has clicked the full real flow (sell → approve → post) on the new UI yet. Do one real post from the phone and watch the runner log.
2. The **payment link inside a real Marktplaats chat** (does Marktplaats let the `buy.stripe.com` link through?). Only tested on an item without a chat.
3. The **negotiation on a real buyer message** end to end (the AirPods chat with "Teije" is the place to test: send an offer from the buyer account, watch the reply within ~1 min).
4. Why ad m2447094325 ended ("verlopen") is unknown (not deleted by us; maybe duplicate detection).
5. Security: `apps/web/app/api/ebay/account-deletion/route.ts` forwards POSTs without verifying `x-ebay-signature` (eBay not in the demo).
6. CloakBrowser warns about incomplete Windows fonts on Linux (cloud only; laptop posting avoids it).
7. After the demo: clear `DEMO_MP_STORE`, redeploy n8n; delete `tba/test-pickup` if not needed.

## Useful commands
- Recent n8n runs: `node n8n/runs.mjs <key> [n]` (e.g. `publish 3`, `inbox 2`).
- Runner log: the `start-local.mjs` window (▶/■ lines per job).
- Actor locally: `cd actors/marktplaats && npm run build`; runner uses `dist/main.js`.
- Log in to Marktplaats by hand in CloakBrowser: `npx tsx scripts/mp-login/index.ts` then link: `node scripts/mp-login/link-to-poof.mjs <usr_id> --from-state`. Google sign-in hangs in the cloud login popup; use email+password.
- Watch the laptop CloakBrowser flow in the app: `node scripts/mp-login/demo-open.mjs` + `demo-drive.mjs <step>`.

## Secrets
All in `.env` (gitignored): n8n API key, Apify token, Stripe `sk_test_…`, Groq LLM key, `POOF_APP_KEY`, `RUNNER_KEY`. Vercel env has its own copies (production `NEXT_PUBLIC_MOCK="0"`). Never commit `.env`.

## How the user works
Wants it done without clarifying questions, everything real (no fake data in production), and short plain updates. **Never commit or push to `main`**: work on a branch (or worktree) and open a PR; the user merges (`main` auto-deploys production). They asked for parallel subagents when work can be split.
