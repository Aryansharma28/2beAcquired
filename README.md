# 2beAcquired

Your stuff, sold. An autonomous second-hand selling agent: snap a photo, set a goal and a floor price, and the agent prices, lists, negotiates and delists on Marktplaats and eBay. You only step in when an offer is below your floor.

Built at Build Weekend 2026 with **n8n** (the brain) and **Apify** (eyes and hands).

- `apps/web` — mobile web app (Next.js PWA)
- `actors/marktplaats` — Apify actor: comps, post, inbox, reply, stats, reprice, delist
- `n8n/workflows` — n8n workflows as JSON, pushed with `scripts/`
- `docs/PLAN.md` — architecture, API contract, build order
