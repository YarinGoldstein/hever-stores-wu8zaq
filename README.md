# חבר Stores — קבע + טעמים

A personal, mobile-friendly map + directory of every business that honors the two Hever (חבר)
prepaid cards — **"חבר של קבע"** (Keva, retail/shopping) and **"חבר טעמים"** (Teamim,
restaurants & cafés) — with each chain's usage terms and full branch list.

Built so the data stays usable **after a club membership lapses**: the app reads Hever's *public*
data endpoints directly (no login), and degrades gracefully if they ever disappear.

## Features
- 🗺️ Interactive clustered map (Leaflet + OpenStreetMap, no API key).
- 🔎 Search + filters: card (Keva / Teamim / "honored by both"), category, region, online-only,
  kosher, accessibility.
- 🏪 Per-chain detail: usage instructions/limitations + complete branch list (address, phone, map).
- 📱 Responsive + installable (PWA "Add to Home Screen"), works offline.

## How the data stays fresh & resilient
Loading order (newest available wins), shown in the header badge:
1. **Live** — fetches Hever's public datasets on every visit (always current; CORS-open).
2. **Device cache** — the last successful live load is cached on-device (instant + offline).
3. **Bundled snapshot** — `data.json` shipped in this repo; the ultimate fallback.

A weekly **GitHub Action** (`.github/workflows/refresh-data.yml`) rebuilds `data.json` from the live
datasets and commits it, so the bundled fallback keeps improving and the repo accumulates a dated
version history — a permanent archive captured while access lasts.

## Data sources (public, no login)
`giftcard.json`, `giftcard_branches.json`, `teamimcard_branches.json`, `company_categories.json`
under `https://www.hvr.co.il/bs2/datasets/`. Logos from `/pics/giftcard/` and `/pics/giftcard_rest/`.

## Note
The two cards cover **complementary** merchant sets (shopping vs. dining); there is essentially **no
overlap**, so the "honored by both" filter is intentionally near-empty.

## Local dev
```sh
node build-data.mjs        # rebuild data.json from live data (HVR_LOCAL=1 to read ./raw)
node serve.mjs 8100        # serve locally at http://localhost:8100
```

Not affiliated with Hever / חבר. Personal archival use of publicly available data.
