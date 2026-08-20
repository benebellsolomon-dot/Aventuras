# Handoff — CR-1 landed + D-backlog worked + live image-gen iteration (3 rounds)

Written 2026-08-20 (end of a single long session). Supersedes
`HANDOFF_2026-08-20_cr1-landed-merge-review-fixed.md`. Branch
`claude/opus-agents-orchestration-82d727`; **master == be-patches == `805044b4`**,
live app restarted at each landing. NOTHING pushed to origin (Ben-gated).
This project now has a local-only `CLAUDE.md` at the main checkout root (covers
worktrees via ancestor traversal; CLAUDE.md/.claude are gitignored ON PURPOSE —
public fork) + `.claude/verify.sh` fast gate. Read it first.

## Session arc (commit order)

1. **CR-1 landed** — merge `99cd8f79` + two-round review fix set `c00bedac`
   (see the superseded handoff + `research/56` for detail).
2. **D-backlog** — `165ec4a4` (D-3/D-4/D-5/D-12/D-13 + mid-flush window fix),
   `27660983` (D-1/D-7: stop-cleanup batch isolation, discriminated
   ClassificationApplyOutcome, rollback-aware post-turn tail), `b831542d`
   (D-6 synchronous=FULL turn pool; D-11 unparseable-sheet preservation +
   SpellbookSection missing-catch fix). Ledger: `research/56`. Still open:
   D-2/D-2b (world-panel + story-switch gating during turns — Ben's UX call),
   D-8/D-9/D-10 (documented, low).
3. **Live image-gen playtest iteration with Ben** (the bulk of the afternoon;
   each round diagnosed from the live DB's stored prompts, read-only):
   - `6b026e2f` round 1: 77-token truncation — sectioned writer output +
     deterministic action-first `composeBooruScenePrompt`, flat runs,
     `booruTags.ts` cue compression, 60-tag budget.
   - (No commit) round 1.5: **referenceMode img2img contamination** — Amelia's
     portrait WAS a clothed hallway shirt-lift; Ben turned the story setting
     OFF; identity bank does anchoring in text now.
   - `a297a60c` round 2: sharpened `sizeNegativeForPrompt` (negate EVERY band
     below largest — the neighbour band was the escape hatch), early size
     hoist, POV male form (`pov, male pov, faceless male`), mandatory hair
     length/style in identity extraction. **NanoGPT measured to NOT parse
     A1111 weighting** (down-weight discriminator; providerCapabilities.ts).
     Ben: "extremely better — proper bust size, character accuracy, scene
     accuracy."
   - `9cb80378`: per-character emotion/expression layer (`expressionTags.ts`
     engine mapping — arousal 40/70/85 ladder, attitude, raw bond; writer
     `expressions` field, per-run merge/dedupe, trim floors).
   - `805044b4` round 3 (fixed the emotion round's regressions + a real
     engine seam): **cast growth is deterministic** (successful cast narrated
     growth but the reducer's internal roll failed — 'roll 1 @i3' → narrated
     growth, no stats; now `guaranteed` marker from translateSpellEffects,
     GUARANTEED_GROWTH_ROLL, ambient goldens byte-identical, Phase-4 canary
     deliberately updated — it had pinned the bug) + **act-first action
     field** (the emotion rewrite let pose tags satisfy the action quota; act
     tags are now tier-1 mandatory, with a template-contract test that runs
     the worked example through the real composer).

## State / gates

Suite **930**, svelte-check 0, eslint 0 errors, cargo check clean at `805044b4`.
`SERVICE_TEMPLATE_SYNC_VERSION` = **6** (verify live via
`settings.service_template_sync_version`; template changes NEVER reach packs
without this manual bump — the trap bit twice today).

## Open at session end

- Ben retesting round 3 (act-first scene + guaranteed cast growth + expression
  saliency). If expressions still read bland with a correct scene, next levers:
  hoist 1-2 strongest expression tags earlier in the run, or face-focus camera
  guidance on emotional beats.
- Growth pacing after determinism: casts now land every successful check —
  if too fast, tune DC/essence cost, do NOT re-add the second roll.
- D-2 (panel/story-switch gating during turns) awaits Ben's UX decision.
- Identity backfill for the other 11 characters (Ben runs the review-gated
  modal); Amelia's bank hand-edit (long hair) done by Ben in-app.
- Deferred ideas parked in research/56 tail + research/51 (Phase-5 W1/D3/D4).

## Watch-outs (fresh ones this session)

- **The image-iteration debugging loop that works:** read the ACTUAL prompt
  from `embedded_images` (read-only sqlite) → compare against what rendered →
  the failure is usually assembly/ordering/reference, not the model. Prompts
  are stored per image; negatives are NOT stored (recompute mentally via
  `sizeNegativeForPrompt`).
- `referenceMode` (story setting) img2img-seeds inline images from portraits —
  with banks + booru models it FIGHTS text; keep OFF for BE stories unless the
  portrait is kept current.
- Landing flow gotcha: `git -C <main> merge --ff-only HEAD` resolves HEAD in
  the MAIN repo (no-op) — always pass the explicit sha.
- Killing tauri dev makes the old background task report "failed (exit 144)" —
  that's the kill, not a failure.

## Verify

`npx vitest run` (930, three projects incl. unit/svelte) → `npm run check` →
`npx eslint .` → `cargo check` in src-tauri. App: `npm run tauri dev` from the
MAIN checkout; confirm `:1420` + sync version after template bumps.
