# Handover (27 Sept 2026, midday)

For the next Claude Code session on **poof** (repo `Desktop\2beAcquired`, github.com/Aryansharma28/2beAcquired). Read this, then `docs/REQUIREMENTS.md` (hard rules), then `README.md`. Demo video is due **Sunday 27 Sept 15:00**.

## What poof is
Snap a photo, confirm what it is, set a minimum; an agent prices it from real Marktplaats listings, writes and posts the ad, negotiates with buyers, books the pickup, sends a payment link and takes the ad down.

- `apps/web` Next.js PWA, production **https://poof-lovat.vercel.app** (Vercel project `poof`, root dir `apps/web`; **every push to `main` deploys production**, so changes go through PRs only).
- `n8n/src/*.mjs` workflows as code on **aryansharma28.app.n8n.cloud**, deploy with `node n8n/deploy.mjs [key]` (key = file name without number, e.g. `publish`, `inbox`).
- `actors/marktplaats` Apify actor `jadelike_loyalty~marktplaats` (push with `npx -y apify-cli push` from that folder) and the **laptop runner** `local-runner.mjs`.
- Data lives in **n8n Data Tables** (items, users, events, messages, conversations, decisions, pairings). **Supabase is only the login** (Google + 6-digit email code, `supabase/`, `apps/web/app/login`): it maps a login to the poof `usr_…` id (table `poof_accounts`), then the usual `poof_uid` cookie takes over.

## How it runs right now (important)
- **Marktplaats-session actions run on this laptop**, not Apify: n8n → Cloudflare quick tunnel → `local-runner.mjs` → the actor in a visible **CloakBrowser** window. Cloud-posted ads got hidden by Marktplaats 3/3; laptop posts stay public.
- Running now: runner on `localhost:8787` (with the 1 s chat watcher) and a tunnel, URL in `.env` `LOCAL_RUNNER_URL`, and n8n is deployed with it. A quick tunnel can die on its own; if `curl $LOCAL_RUNNER_URL/health` fails but `localhost:8787/health` is ok, open a new tunnel (`npx -y cloudflared tunnel --url http://localhost:8787`), put its URL in `.env` and run `node n8n/deploy.mjs`.
- **If the laptop slept, the session ended or the tunnel died**: stop old `local-runner.mjs`/`cloudflared` processes, then `node actors/marktplaats/start-local.mjs` and keep it running (it rebuilds, starts runner + tunnel, writes `.env`, redeploys n8n). Check: `curl $LOCAL_RUNNER_URL/health` → `ok`. Starting it twice gives `EADDRINUSE :8787` (harmless if the first runner is alive).
- **Demo mode** `DEMO_MP_STORE=mp-session`: every poof account sells on the owner's Marktplaats session (account "Teije Keesmaat"), stored in Apify KV store `mp-session` (key `state`). No connect step for users.
- Live posting: `MP_DRY_RUN=0`, fallback postcode `MP_POSTCODE=1318DJ` (Almere).

## What is done and verified
- CloakBrowser only (no Playwright fallback), fixed fingerprint + sticky proxy per account.
- Posting from the phone app → laptop → public ad (verified twice). Post reports `visibility` (visible/inactive).
- Delist via the owner's seller page (dialog "verkocht via Marktplaats?" deletes), verified on the seller page.
- Fixing a wrong recognition ("Not right? Fix it" → "Use this name") re-runs the market check (`n8n/src/16-rename.mjs`).
- Negotiation rule (owner's request): **push once to the asking price, then let go** (accept >= minimum; below minimum one final offer at the minimum, then decline), enforced in `GUARDRAILS` in `n8n/src/30-inbox.mjs`, tested via the no-side-effects webhook `tba/test-negotiator`. The LLM (`openai/gpt-oss-120b` via OpenRouter) retries 5x.
- Chats near real time: laptop watcher polls the unread counter every second → `tba/inbox-now` (n8n's 15 s chat check is off); n8n schedule every 5 min as backup.
- Payments: **Stripe test mode** (Mollie needs KvK). After a pickup is booked (W5 `50-pickup.mjs`) the buyer gets a Stripe Payment Link (iDEAL/card); webhook `tba/stripe` (W6 `55-payments.mjs`) verifies the event with Stripe and marks the item **sold/paid**. Verified end to end with a test iDEAL payment. Test entrance: `POST tba/test-pickup` (X-Poof-Key) with `{itemId, price, buyer, platform, conversationId, pickup}`.
- Teije's PRs #1 (wireframes) and #2 (visual design) merged (design files only). **PR #3 reskin merged and live** (commit `7c88de6`): verified by build + lint + two independent mock-mode walkthroughs (no blockers) + fixes (pickup city from profile, price plan follows edited price, description Done button, 16px inputs, chat opens at newest, "How this ad went").
- Vercel Git builds fixed (Root Directory was `.`, now `apps/web`).
- **LLM provider: OpenRouter** (paid, no daily cap; Groq's free tier capped vision at ~95 photos/day). `.env`: `LLM_BASE_URL=https://openrouter.ai/api/v1`, text `openai/gpt-oss-120b`, vision `qwen/qwen3-vl-235b-a22b-instruct` (16/16 right on test photos). Old Groq values kept in `.env` as `GROQ_*`. Requests ask OpenRouter for the lowest-latency provider.
- **Fast intake** (PRs #8, #11): photo → "Is this it?" in ~6–7 s in the app (was 1.5–2.5 min). Vision first (raced over Alibaba/DeepInfra/Parasail, 2.5–3.3 s), Google Lens only as fallback; comparables straight from the Marktplaats search API (0.5 s); the "Same product?" matcher works now (it used to fail and price on all listings); the recognition is saved before pricing (`pricing: true`) and the price follows ~1–2 s later. The app polls every 0.7 s while recognising.
- **Delist fixed** (PR #9): Marktplaats' delete dialog deletes on the reason answer; the actor no longer fails on the disabled confirm button. Verified on real ads (page 410).
- **Production click-through** `node scripts/mp-login/prod-e2e.mjs [--no-approve] [--rename "…"] <photos…>` (run from `scripts/mp-login`): onboard → sell → approve → live, screenshots per screen. Last full run: live on Marktplaats 52 s after Approve, public and in search. Clean up afterwards (it creates a user + item; with approve also a public ad → delist via the runner).
- Known recognition quirk: a closed AirPods case in the hand is sometimes named "charging case" (then prices against cases only). Photograph it open, or "Fix it" → "AirPods Pro 2".
- **LangWatch** (project key `LANGWATCH_API_KEY`, n8n credential "LangWatch"): every negotiator decision (inbox and `tba/test-negotiator`) is one trace, thread = conversation, labels `production`/`test`, `action:*`, `buyer:*`, `guardrail-fired`, `pii-in-*`. Guardrails: Presidio PII (LangWatch evaluator, as guardrail) + Dutch phone/email/IBAN patterns on the buyer message (masked before the model sees it) and on our reply (removed). Online monitors on all traces: "PII leak in negotiator reply", "Reply language matches buyer" (both non-LLM, free). The official LangWatch n8n nodes are not allowed on n8n Cloud ("not vetted"), so `n8n/langwatch.mjs` makes the same API calls over HTTP; everything fails open.
- **Scenario tests** `cd scenarios && npm install && npm test`: 7 simulated buyer conversations (lowballer, fair buyer + pickup, prompt injection, scam, buyer shares PII, "are you a bot?", English buyer) against `tba/test-negotiator` (no side effects), judged by `openai/gpt-4.1-mini` via OpenRouter (~2 cents a run). 28/28 over 4 full runs on 27 Sept. Results in LangWatch → Simulations (set `poof-negotiator`).
- **Data is real**: all test accounts/items deleted. Left: user `usr_t0kg5g5ydbwbs1z8` (Aryan, Almere) with `itm_muiro2cj90m9` (AirPods Pro 1e gen, **live** m2447096237, negotiating with buyer "Teije") and `itm_muirf9ofn1r9` (ended on Marktplaats, marked delisted).

## Not verified yet / open
1. The **payment link inside a real Marktplaats chat** (does Marktplaats let the `buy.stripe.com` link through?). Only tested on an item without a chat.
2. The **negotiation on a real buyer message** end to end (the AirPods chat with "Teije" is the place to test: send an offer from the buyer account, watch the reply within ~1 min).
3. Why ad m2447094325 ended ("verlopen") is unknown (not deleted by us; maybe duplicate detection).
4. Security: `apps/web/app/api/ebay/account-deletion/route.ts` forwards POSTs without verifying `x-ebay-signature` (eBay not in the demo).
5. CloakBrowser warns about incomplete Windows fonts on Linux (cloud only; laptop posting avoids it).
6. After the demo: clear `DEMO_MP_STORE`, redeploy n8n; delete `tba/test-pickup` if not needed.

## Useful commands
- Recent n8n runs: `node n8n/runs.mjs <key> [n]` (e.g. `publish 3`, `inbox 2`).
- Runner log: the `start-local.mjs` window (▶/■ lines per job).
- Actor locally: `cd actors/marktplaats && npm run build`; runner uses `dist/main.js`.
- Log in to Marktplaats by hand in CloakBrowser: `npx tsx scripts/mp-login/index.ts` then link: `node scripts/mp-login/link-to-poof.mjs <usr_id> --from-state`. Google sign-in hangs in the cloud login popup; use email+password.
- Watch the laptop CloakBrowser flow in the app: `node scripts/mp-login/demo-open.mjs` + `demo-drive.mjs <step>`.

## Secrets
All in `.env` (gitignored): n8n API key, Apify token, Stripe `sk_test_…`, OpenRouter key (`LLM_API_KEY`, also `OPENROUTER_API_KEY`; the intake vision Code node gets it at deploy time), `POOF_APP_KEY`, `RUNNER_KEY`. Vercel env has its own copies (production `NEXT_PUBLIC_MOCK="0"`). Never commit `.env`.

## How the user works
Wants it done without clarifying questions, everything real (no fake data in production), and short plain updates. **Never commit or push to `main`**: work on a branch (or worktree) and open a PR; the user merges (`main` auto-deploys production). They asked for parallel subagents when work can be split.
