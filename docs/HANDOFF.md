# Handoff: FPL Mini-League Leaderboard — web app

## Overview
A private Fantasy Premier League mini-league leaderboard for a group of friends, adding the weekly and monthly competitions that the official FPL site does not provide, plus a running winner history. This bundle covers the **web output layer**; the WhatsApp bot follows as a second publisher on the same core.

Read `fpl-leaderboard-technical-brief.md` first — it is the full technical brief (data source, endpoints, scoring rules, architecture, gotchas, build order). Section 5b is the agreed stack, section 10 documents this design, section 11 covers the open-source / self-host requirements.

## About the design files
`FPL League.dc.html` is a **design reference created in HTML** — an interactive prototype showing the intended look and behaviour, not production code to copy. Recreate it in the target stack (Next.js App Router + Tailwind, per section 5b) using that codebase's own patterns. The data inside it is mocked; real data comes from our own Postgres, never from a browser-side call to the FPL API.

Open the file directly in a browser. Tabs, the gameweek and month pickers, and the dark-mode toggle are all live.

## Fidelity
**High-fidelity.** Colours, type, spacing and interaction states are final. Recreate closely; use the design tokens in section 10 of the brief verbatim.

## Screens / views
One page, four tabs — Weekly, Monthly, Season, History. Layout, components, per-tab columns and copy are specified in section 10 of the brief.

## Interactions & behaviour
Section 10, "Behaviour to implement". Additionally:
- **Loading**: tables render server-side, so no client spinner is needed; use a skeleton only if a tab is made client-fetched.
- **Empty**: before GW1, show the header and an empty-state line ("Season starts 22 August 2026") in place of the hero strip.
- **Error**: if the last successful poll is more than 6 hours old, the status pill turns amber and the footer states the staleness. Never show a table you cannot date.

## State management
Client: `tab`, `gw`, `month`, `dark`. Server: everything else, read from Postgres (schema in section 5 of the brief). No client-side fetching of the FPL API — it sends no CORS headers.

## Design tokens
Section 10 of the brief — full light and dark tables, type scale, radii, transitions.

## Assets
None. No images or icon files; the only glyphs are the sun/moon characters on the theme toggle, replaceable with any icon set already in the codebase.

## Open source
This ships publicly as self-hosted software: every group-specific value is an environment variable and the app must run with only `FPL_LEAGUE_ID` and `DATABASE_URL` set. See section 11 of the brief for the full variable list, repo hygiene (MIT, `.env.example`, disclaimer, no Premier League marks) and the rate-limiting and pagination behaviour that changes once other people are running instances. The theme accent is env-configurable — keep the tokens as CSS variables so an override is a one-line change.

## Files
- `FPL League.dc.html` — the interactive design reference
- `fpl-leaderboard-technical-brief.md` — the full technical brief, updated with the stack decision (5b) and design spec (10)
