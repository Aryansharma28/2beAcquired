# Shipping the new design safely

How the new Poof design gets from `design/` into the live app without breaking what is live now. Written 26 September 2026.

## How deploys work today (checked)
- The repo is connected to Vercel (project `poof`, Aryan's team). Every commit on `main` triggers a **Production** build; every other branch triggers a **Preview** build.
- **All Git-triggered builds have failed since at least 15:14 today**, on `main` too (15 in a row). The app builds fine locally (`npm ci && next build` in `apps/web` succeeds on current `main`), so this is a Vercel project setting, most likely the Root Directory not set to `apps/web` for the Git integration.
- So the live site (poof-lovat.vercel.app) currently comes from a manual CLI deploy. Merging to `main` does **not** change production right now. Once the Git build is fixed, every merge to `main` goes live automatically.
- Preview builds use the same env vars as production (real n8n, Apify, Marktplaats). A preview of the app is therefore not a sandbox unless mock mode is on.

## The safe path
1. **Design-only PRs first.** PR #1 (wireframes) and the visual design PR only add files under `design/`. They cannot change the app. Merge any time.
2. **Reskin on its own branch** `design/app-reskin`, created from the latest `main` and rebased on `main` before every push (Aryan's request).
3. **Only the visual layer changes**: markup and styles in `apps/web/components/*`, `app/globals.css`, fonts in `app/layout.tsx`, new images in `public/`. No changes to `lib/`, `app/api/`, n8n, actors or the extension.
4. **Before every push**: `npm ci && npx next build && npm run lint` in `apps/web` must pass, and the full flow is clicked through in mock mode (`NEXT_PUBLIC_MOCK=1 npx next dev`) in Chrome and on a phone over the local network.
5. **Small commits per screen** (home, sell flow, ad, product page, chats, sold) so Aryan can review and revert per piece.
6. **Safe preview**: ask Aryan to set `NEXT_PUBLIC_MOCK=1` as a Preview env var for the `design/app-reskin` branch only (Vercel supports branch-specific env), so the preview link is a demo that never posts real ads.
7. **Go live = Aryan's merge.** He reviews and merges; production updates by his deploy (manual now, automatic once the Git build is fixed). Rollback: Vercel Instant Rollback to the previous production deployment.

## Never
- No merges, domain or alias changes, or env var changes by us. Those stay with Aryan.
- No real-backend testing of the reskin (it can post real Marktplaats ads).
- No reskin merge while the demo video is being recorded (Sunday before 15:00).

## For Aryan
1. Fix the Vercel Git build (likely Root Directory `apps/web`); all builds since 15:14 fail.
2. `apps/web/app/api/ebay/account-deletion/route.ts` forwards any POST to n8n without verifying eBay's `x-ebay-signature`; anyone can trigger `/tba/ebay-deleted`. Verify the signature first (reject with 412).
3. Set `NEXT_PUBLIC_MOCK=1` for the reskin branch's previews.
