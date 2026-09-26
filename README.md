# poof

Snap it. poof. Sold. An autonomous second-hand selling agent for Marktplaats: snap a photo, confirm what it is, pick how fast it should go and set a minimum. The agent prices it from real listings, writes the ad, negotiates with buyers, books the pickup in your calendar and takes the ad down. After you approve the ad, nobody asks you anything.

Built at Build Weekend 2026 with **n8n** (the brain) and **Apify** (eyes and hands).

- `apps/web` — mobile web app (Next.js PWA)
- `actors/marktplaats` — Apify actor: comps, post, inbox, reply, stats, reprice, delist
- `scripts/mp-login` — log in to Marktplaats once by hand; saves the session for the actor (`npx tsx scripts/mp-login/index.ts`)
- `n8n/workflows` — n8n workflows as JSON, pushed with `scripts/`
- `docs/PLAN.md` — architecture, API contract, build order
