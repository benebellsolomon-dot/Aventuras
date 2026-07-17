# Handoff — 2026-07-17 (Aventuras era: platform adopted, wired, fork patched; BE engine designed, build gated on Ben)

One session (2026-07-16 evening) took Aventuras from "just downloaded" to: evaluated, wired to the
SI bridge, forked + patched + running Ben's own build, Lucy's Milk imported, image accuracy tuned
app-side, and the Era-4 BE engine fully designed with three of seven decisions ruled. **Read
`research/INDEX.md` for the doc map; the next session is the research/33 brainstorm.**

## State of play

- **Platform**: Aventuras (Tauri IF app) replaces the ST+UIE stack direction. Evaluation:
  `research/30`. Ben's live app is **his own fork build `0.7.6-be.1`** at /Applications
  (same bundle id/DB as stock; stock backup in the session scratchpad + DMG in ~/Downloads).
- **Fork**: `Projects/gaming/Aventuras`, branch `be-patches` off the v0.7.6 tag, upstream =
  AventurasTeam, origin = github.com/benebellsolomon-dot/Aventuras. **8 local commits, NOT
  pushed** (Ben hasn't said push): pic-tag apostrophe parser fix (`327aa90d`) · build notes ·
  updater-panic fix (endpoint → fork URL, `961d6e19`) · bridge wiring + prose dialect
  (`ae24bc1d`) · Krea retune (`37dbc92a`) · ST-wizard visualDescriptors carry-through fix
  (`a09efeb6`) · `__betier__` size-marker emission + style-word ban (`a62ad46c`). Upstream-PR
  candidates: parser fix, wizard fix.
- **Image gen**: fully wired to the si-animator-bridge Krea 2 pipeline over tailnet (no auth on
  /sdapi/*). App-side accuracy work DONE per `research/32` (markers, 1536², honest inert
  steps/cfg 8/2, empty negative → bridge style-neg). **Bridge-side items OPEN (Ben deploys on
  the PC)**: expose img2img/reference through the shim (identity consistency — the #1 remaining
  accuracy gap) and the hyper-scale graph ceiling. Bridge GitHub =
  `benebellsolomon-dot/si-animator-bridge` @ main (= deployed truth; `~/dev` clone is stale).
- **Lucy's Milk**: import bundle at `_inbox/lucys-milk-migration/aventuras-import/` (v2 card,
  worldinfo w/ 4 constant [BE] rules, 601-msg chat.jsonl, canonical visual descriptors). The
  imported story's Lucy character has canon descriptors applied in-DB. Canon Lucy =
  **honey-blonde, warm brown eyes, 38X/gigantic** (NOT white-haired — that was a test-render
  invention).
- **BE engine (Era 4)**: designed, NOT built. `research/31` (design + decisions) on `31a`
  (portable spec) + `31b` (integration surface). **Ben ruled: D1 unbounded sub-cup tier scalar ·
  D3 events→deterministic-reducer · D6 stateTracking default-ON (a ruling — NOT yet implemented
  in the fork).** Next step BY BEN'S CHOICE: he iterates on the design doc before any build.
  D2 (defer relationship model to Phase C), D4 (body math stays bridge-side), D5 (re-derive all
  constants), D7 (fix the retry-metadata gap in Phase A) stand as recommended defaults.

## What remains

1. **Ben reads `research/31`** (then 31a §11/§12, 31b §0) → confirms/edits → green-lights Phase A.
2. **The research/33 brainstorm** (next session's job — see First moves).
3. Bridge-side: img2img-through-shim + hyper ceiling (`research/32` has file paths).
4. Housekeeping: push the fork? · **ambrosia-st has UNCOMMITTED work** (research/30–33 + INDEX,
  scripts/nai-story-to-st-import.mjs, scripts/aventuras-setup-bridge-profile.py, msgpackr devDep
  in package.json) — commit when Ben says · runtime-variable smoke test (research/30 §10.2)
  still unrun · Lucy story playtest with the new marker build.

## First moves next session

1. Read this handoff, then `research/INDEX.md`.
2. Open **`research/33-brainstorm-brief-be-improvements.md`** — the session IS that brainstorm:
   where to improve Aventuras for BE stories. The brief has the seeded topic list + questions.
3. Check whether Ben has annotated `research/31` (his iteration pass) before treating its
   defaults as final.

## Driving facts (will trip a fresh agent)

- **The app is usually RUNNING — never write its DB live.** Settings edits: quit gracefully
  (osascript), edit `~/Library/Application Support/com.karelian.aventura/aventura.db`, relaunch.
  The app clobbers external writes otherwise.
- **Fork builds need Node 22** (`export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`); Node 26
  blows vite's scanner on harper.js. See fork `BUILDING-NOTES.md`. Build:
  `npx tauri build --bundles app`; deploy = quit → ditto to /Applications → relaunch.
- **The updater plugin PANICS at startup if `plugins.updater` is removed** from tauri.conf —
  it's pointed at the fork's (404ing) releases URL instead. Don't "clean it up".
- A1111-shim `steps/cfg/sampler` are **inert** for Krea (presets hardcode 8/2.0). Don't tune them.
- `__betier_<N>__` markers: emitted app-side from band words (`sizeBandMarker.ts`); tier ≥30
  routes to the rebal 4x-adherence workflow. Band anchors mirror the bridge's
  `_KREA_TIER_NOUNS` — keep in sync.
- `stateTracking`/`lightweightBranches` default OFF app-wide (incl. Ben's live DB). D6 says flip
  stateTracking default in the fork — unimplemented.
- Zod strips unknown keys everywhere in Aventuras — new classifier fields must use the
  schema-extension mechanism (31b §2.4/risk 1).
- Memory files (`aventuras`, `si-animator-bridge`, `be-story-engine` in the Projects auto-memory)
  are current as of this handoff.

## Skills / tools

- `scripts/nai-story-to-st-import.mjs` — NAI .story → ST chat.jsonl + worldinfo (msgpackr).
- `scripts/aventuras-setup-bridge-profile.py` — bridge profile into the app DB (app closed).
- The fork's check: `npm run check` (svelte-check, green at 4,808 files). No test infra yet —
  vitest arrives with Phase A.

## Artifacts / pointers

- Research: `research/INDEX.md` → 30 / 31+31a+31b / 32 / 33.
- Import bundle: `_inbox/lucys-milk-migration/aventuras-import/` (+ README).
- Fork: `Projects/gaming/Aventuras` (be-patches). Bridge source: clone fresh from
  `github.com/benebellsolomon-dot/si-animator-bridge` (NOT ~/dev).
- App DB: `~/Library/Application Support/com.karelian.aventura/aventura.db` (timestamped .bak
  files beside it from each quit-window edit).
