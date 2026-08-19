# Handoff — Harem gallery shipped + all render bugs fixed; NEXT = hardening pass across all new features

Written 2026-08-18 (late). Supersedes `HANDOFF_2026-08-18_phase4-shipped-harem-tab-next.md`
(the "harem card not rendering" thread is now RESOLVED — see below). Everything is
committed and landed on `be-patches` == `master` == **`264aa8fc`**; the live Tauri app runs
from the MAIN checkout on `be-patches` and is healthy on :1420.

## Current live state (all shipped this session, verified 678 tests / svelte-check 0 / eslint clean)

- **Harem visual gallery (research/53)** — the Harem tab is now a hybrid expand/collapse
  gallery. Every body-state girl renders as a visual roster row (**cup size + measurements
  are the headline; tier demoted** — Ben's ruling), sorted present-first with an "in scene"
  ♥ badge, expanding in place into a full portrait card (`SizeBlock`: cup letter + bust/band/
  mass/hang/BWH via `cupLetter`/`comparative`/`measurements`/`bwhCmString`; bond/dependence/
  fullness/milk meters). New files: `girlSprite.svelte.ts` (shared sprite refresh/subscribe),
  `SizeBlock.svelte`, `HaremGirlRow.svelte`. `GirlStatusCard.svelte` is the expanded card;
  `HaremPanel.svelte` owns a `SvelteSet` of expanded ids. Mockup of record:
  `research/mockups/53-harem-gallery-v2.html`.
- **Everything from prior sessions** — RPG Phases 1–5 (partial), magic/spells, lactation,
  image pipeline (Megumin adoption), the V2d sprite thumbnail. See `research/INDEX.md` +
  the `backend-roadmap` auto-memory for the full ledger.

## The "harem card doesn't render" saga — RESOLVED (two real bugs, both fixed)

1. **PRIMARY: the Harem TAB was clipped off the sidebar (commit `feb3e9b7`).** Diagnostic
   that cracked it: Ben confirmed **Sheet (dice) tab showed but Harem (heart) did not** —
   yet both are added together in one `tabs` array + `{#each}` in `Sidebar.svelte`, so beMode
   WAS on and the only variable was tab POSITION. Base `Tabs.Trigger` (bits-ui) has `px-3` +
   `whitespace-nowrap` (~40px min per icon tab); the Sidebar added `flex-1` but NOT `min-w-0`,
   so 8 BE-mode tabs (~320px) overflowed the ~288px sidebar with no wrap/scroll → the LAST
   tab (Harem) clipped. With 7 tabs (pre-Harem) it just fit. Fix: `min-w-0 px-0` on the
   trigger class. **LESSON: "last-in-a-row element missing" == overflow/clip; check flex
   `min-w-0` before anything else.** This superseded an earlier hypothesis (presence-gate) —
   that was a real SECONDARY issue, fixed in research/53 (presence is now a badge, not a gate).
2. **Scene classifier never populated `presentCharacterNames` (commit `264aa8fc`).** The
   classifier template had rules for characters/locations/items/beats/time but NOTHING about
   present characters (schema field just `.default([])`), so the model omitted it → always
   empty → every presence-keyed feature (harem ♥/sort, VN standees) silently broke. Fix: added
   an explicit "Present Characters" section + critical rule to the classifier template
   (`prompts/templates/analysis.ts`). **AND** a systemic fix: service-category templates were
   frozen-copied into custom packs at creation and never updated (only default-pack
   auto-refreshed), so the fix wouldn't reach Ben's "Breast Expansion (NSFW)" bundled pack.
   Added `refreshServiceTemplatesAllPacks()` in `pack-service.ts` — on startup, refresh
   SERVICE-category templates across ALL packs when their code hash changed (idempotent,
   hash-guarded, crash-safe; narrative/user-facing custom-pack templates stay frozen).
   Verified: all 3 packs' classifier templates now carry the guidance. Present-detection
   populates on the NEXT narration turn (historical entries stay empty).

## THE debugging lesson (carried, cost hours across sessions)

For any "UI element silently missing / feature does nothing, no console error" symptom:
**enable Debug Mode FIRST** (Settings — the app's `createLogger` logs are SUPPRESSED without
it, so "no errors" is meaningless) and **suspect CONFIG/STATE, not code**. Read-only DB
inspection is the power tool: `sqlite3 -readonly ~/Library/Application\ Support/com.karelian.aventura/aventura.db`
(tables: `stories.settings` [beMode], `settings` [service_preset_assignments, model per
service], `pack_templates` [per-pack templates, seeded from code], `story_entries.world_state_delta`
[classifier output incl. presentCharacterNames], `characters.metadata` [rpgSheet/bodyState]).
Do NOT DELETE/UPDATE the DB without Ben's explicit OK. This session's saga (tab clip masked
as "card not rendering") and the prior one (Suggestions-model config failure masked as
"options disappeared") were BOTH state/layout, not the code being reverted.

## NEXT SESSION = hardening pass across all the new features

**A 3-lens adversarial review ran this session — findings are ranked in `research/54-hardening-findings.md` (fix nothing was applied; Ben chose document-only).** START THERE. Top items: **CR-2 (SELF-INFLICTED, LIVE)** — the `refreshServiceTemplatesAllPacks` added this session silently reverts user-customized service templates every startup; fix first via a versioned one-time sync. **CR-1** — the long-flagged no-transaction / half-applied-delta hazard (do LAST, build a store test harness first). **H-1** — rollback swallows failures then deletes entries anyway. Plus 7 medium + 10 low, and a solid "cleared as correct" list. Recommended fix order is at the bottom of research/54.

Ben's directive: a hardening session over everything shipped (RPG 1–5, magic, lactation,
harem gallery, image pipeline). Candidate scope (prioritize with Ben / by risk):
- **Remaining Phase-5 hardening** (`research/51`): W1 cache-order audit · **W5-D1
  half-applied-delta rollback harness** (flagship — needs a real store test harness) · D3
  RiskAssess context reuse · D4 behavior-preserving length extraction from `applyRpgTurn`/
  `applyBeEvents`. Plus the playtest-gated **W4 balance pass** (4 stacked layers of D5
  reference defaults, needs Ben's play data — DC feel, bond/dependence velocity, lactation
  cadence, magic essence-cost/scaling, whether LLM-generated spells are balanced).
- **Adversarial review of the new persistence/server code**: `refreshServiceTemplatesAllPacks`
  (this session), spell learn/cast two-surface rollback, milk inventory idempotency, the
  reducer step-7 paths. Per baseline: server/persistence changes get a multi-lens adversarial
  + fix-diff pass.
- **Loose ends**: alchemy-milk consuming variant (O5), LLM-spellId authoritative dc/cost,
  vault round-trip for imageTags/loraConfig, the empty-`presentCharacterNames` on HISTORICAL
  entries (forward-fixed only).

## App run / land mechanics (unchanged)

Tauri desktop app: `cd ~/Projects/gaming/Aventuras && npm run tauri dev` (vite :1420 + Rust
window). Land: FF `be-patches` from the feature branch, FF `master` in the
`aventuras-image-gen-quality-372ac2` worktree, restart (`pkill -f "target/debug/aventura";
pkill -f "tauri dev"; lsof -ti:1420 | xargs kill`, then relaunch in background). A
settings-store OR pack-template change needs a full restart (packService.initialize re-runs
on startup; HMR won't). Nothing pushed to origin (push URL DISABLED, be-patches local-only).
**A concurrent 2nd Claude session has been live on `be-patches` this session** — re-check
`be-patches` HEAD before FF (rebase if diverged; landing has stayed clean so far).

## Verify

`npx svelte-kit sync` (fresh worktree) then `npx vitest run` (678), `npm run check` (0),
`npx eslint .`. Read the actual edited file when verifying — the V2d bug (a `$state`/`state`
prop collision + prettier) was masked because svelte-check ran against an UNMODIFIED copy.
