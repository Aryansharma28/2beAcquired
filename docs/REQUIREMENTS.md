# Requirements

Hard requirements for running poof against real Marktplaats. Each one exists because we hit the failure it prevents.

## Browser

- **CloakBrowser only.** Every browser session that touches Marktplaats (posting, replying, repricing, delisting, logging in) runs in [CloakBrowser](https://github.com/CloakHQ/cloakbrowser). There is no Playwright/Chrome fallback: if CloakBrowser can't start, the run fails.
- **One steady device per account.** Each Marktplaats account (session store) always gets the same CloakBrowser fingerprint seed and the same sticky proxy session (`actors/marktplaats/src/lib/browser.ts`, `proxy.ts`). CloakBrowser picks a random fingerprint per launch by default, so every run would otherwise look like a new computer.

## Where Marktplaats actions run: the laptop

- **Posting must run from a normal laptop on a home/office connection, not from Apify's cloud.** Ads posted from the cloud server (Linux, datacenter/residential proxy, incomplete Windows fonts) were hidden by Marktplaats moderation within seconds, 3 out of 3, with the banner "Deze advertentie is momenteel niet zichtbaar". The same code on a Windows laptop produced a publicly visible ad.
- The laptop runs `actors/marktplaats/local-runner.mjs`, reachable through a Cloudflare quick tunnel. With `LOCAL_RUNNER_URL` set, n8n sends every action that uses a Marktplaats session there: `post`, `reply`, `inbox`, `update_price`, `delist`. `comps` and `stats` (public, no login) stay on Apify.
- Start everything with one command and **keep it running** (laptop awake and online) for as long as the agent should work:

  ```bash
  node actors/marktplaats/start-local.mjs
  ```

  It builds the actor, starts the runner, opens the tunnel, writes `LOCAL_RUNNER_URL` to `.env` and redeploys n8n. The quick-tunnel URL changes on every start, so always start via this script (or redeploy n8n by hand after changing the URL).
- Browser actions open a **visible** CloakBrowser window on the laptop, so you can watch the agent work.
- **Chats are near real time through the laptop.** Marktplaats has no push for sellers, so the runner checks the unread-message counter every 15 s and triggers the n8n inbox workflow (`tba/inbox-now`) as soon as it rises. The n8n schedule (`INBOX_MINUTES`, 5) is only a safety net.

## Marktplaats account and session

- **Log in by hand, never automated.** Marktplaats uses SMS 2FA and reCAPTCHA. Log in once in CloakBrowser (`npx tsx scripts/mp-login/index.ts`) or through the phone login (actor `login` action). Only the session cookies are stored (Apify key-value store), never the password.
- **Google sign-in doesn't work in the cloud login**: Google's popup hangs on its last step ("Een ogenblik geduld"). Give the account a Marktplaats password (via "Wachtwoord vergeten") and log in with email and password there, or log in on the laptop with `scripts/mp-login`.
- **Choose "Particuliere verkoper"** (private seller). The actor answers the one-time seller-type question itself.

## Demo configuration (`.env`, deployed with `node n8n/deploy.mjs`)

| Setting | Demo value | Why |
|---|---|---|
| `DEMO_MP_STORE` | `mp-session` | Every poof account sells on the owner's logged-in session; no per-user connect step. Clear it after the demo. |
| `MP_DRY_RUN` | `0` | `1` fills the ad form but never presses "Plaatsen". |
| `MP_POSTCODE` | the pickup postcode | Marktplaats requires a postcode; used when a user's pickup address has none. Keep the pickup city in the app consistent with it (buyers see the location). |
| `LOCAL_RUNNER_URL` | set by `start-local.mjs` | Routes Marktplaats-session actions to the laptop. |
| `RUNNER_KEY` | random, created by `start-local.mjs` | Shared secret n8n sends to the runner. |
| `STRIPE_SECRET_KEY` | `sk_test_…` for the demo | Once a pickup is booked the buyer gets a Stripe payment link (iDEAL/card; cash at pickup still possible); paid → "poof · 6 Payments" marks the item sold. Empty = payments off. Test mode needs no KvK; real payouts need an activated Stripe account. Register the webhook once: `node n8n/stripe-setup.mjs`. |

## Ads

- Use **your own photos** of items you actually have. Stock or copied photos mislead buyers, and Marktplaats can detect them.
- After posting, the actor reopens the ad on the seller page and reports `visibility` (`visible` / `inactive`). An ad that Marktplaats set inactive is not live, whatever the app says.
