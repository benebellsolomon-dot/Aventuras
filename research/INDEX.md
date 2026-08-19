# Research index — Aventuras BE

Fast access map. This directory is the **canonical working copy** of the Aventuras-era BE
research (moved here 2026-07-17 so all work happens in one repo). The BE domain corpus is a
copy — the committed originals also live in `code/ambrosia-st/research/`. ST-era (16–29) and
NAI-era (01–15) docs were NOT moved; they stay in their source repos (pointers below). Files
are never renumbered (cross-references depend on numbers). ⭐ = load-bearing today.

## ⭐ Aventuras era (current — read these first)

| Doc | What it is | Status |
|---|---|---|
| [30-aventuras-evaluation.md](30-aventuras-evaluation.md) | The platform: systems inventory, SI-bridge wiring, BE concept mapping, Lucy migration | LIVE reference |
| [31-aventuras-be-engine-design.md](31-aventuras-be-engine-design.md) | **The BE engine design + decision doc.** D1/D3/D6 ruled; D2→Phase C, D4 re-ruled (metric), D5 re-derive, D7 fixed | Phase A shipped |
| [31a-be-engine-portable-spec.md](31a-be-engine-portable-spec.md) | Engine spec distilled from all 3 prior eras (CORE/VALUABLE/PLATFORM-SPECIFIC tags; §12 ten lessons) | Input to 31 |
| [31b-aventuras-integration-surface.md](31b-aventuras-integration-surface.md) | File-and-line map of where BE fields plug into the fork (storage/pipeline/templates/image/UI/risks) | Input to 31 |
| [32-krea-image-accuracy.md](32-krea-image-accuracy.md) | Krea pipeline ground truth + A/B accuracy evidence; app-side fixes SHIPPED, bridge-side items open | App-side done |
| [33-brainstorm-brief-be-improvements.md](33-brainstorm-brief-be-improvements.md) | Prep brief for the "improve Aventuras for BE stories" brainstorm | Consumed by 34 |
| [34-be-improvements-brainstorm.md](34-be-improvements-brainstorm.md) | **Brainstorm output**: upstream-abandonment finding, per-topic proposals B–F, session plan; §6 rulings | Rulings recorded |
| [35-d4-prose-body-math.md](35-d4-prose-body-math.md) | **D4 research**: body-math depth for honest prose — depth (b), baked at build time from the NAI spine | Enacted (metric build) |
| [36-cross-era-feature-gap-analysis.md](36-cross-era-feature-gap-analysis.md) | **Cross-era gap analysis** (3-agent sweep of NAI/ST/bundles+bridge vs the built engine): quick-win list, big-subsystem rulings, the bridge A1111-shim finding, C6 mining list, inventory register | Verdict delivered |
| [37-implementation-plan.md](37-implementation-plan.md) | **The roadmap + full file-level specs**: engine phases (quick-wins ✅, si-bridge provider, C6 pack) + the VN game-engine track (Part III: V1 MVP → sprite engine → stage → growth media → RPG-layer brief) | ⭐ Active plan — the BE VN game engine |
| [38-body-math-audit.md](38-body-math-audit.md) | **Body-math audit + corrections** (Ben-triggered): bust was miscalibrated ~35% low vs the Norma anchor → corrected closed-form on her own band; STRICT letter re-anchor (t47=T, X@t64); honest total weight; droop surfaced; canary armor | ✅ Rulings SHIPPED (be.5) |
| [39-adversarial-math-verification.md](39-adversarial-math-verification.md) | **Adversarial math verification** (Ben-directed, pre-deploy): 3 independent researchers (sizing/medical/geometry) + adversarial refuter; anchor confirmed as a ratio-gauge (Guinness diff primary); 4 shape-handling defects found+fixed; SHIP verdict + documented caveats | ✅ SHIPPED (be.6); the foundation |
| [40-calibration-dataset-hunt.md](40-calibration-dataset-hunt.md) | **Calibration dataset hunt** (5 streams): mid-curve gap proven structural (clinical papers record SN-N not girth; augmented figures never publish underbust); 1″/letter CONFIRMED standard-conformant; droop descent-rate VALIDATED vs 12 clinical pairs; density flagged for ruling | No curve change; density ruling open |
| [41-phase1-playtest-status.md](41-phase1-playtest-status.md) | **Phase 1 playtest + what it shipped**: classifier gate PASS (grok-4.3 ruled), growth chain verified, the lore-outranks-directive root cause → the be.7 cosmology/precedence package; Phase 2 Spec 1 shipped (be.8) with the adversarial-review rulings | ✅ Phases 1–2(Spec 1) SHIPPED |
| [42-visual-novel-mode.md](42-visual-novel-mode.md) | **Visual Novel mode research** (3-agent pass): client-side view layer over existing pipeline; banded FaceID sprite sets keyed on bandIndex; growth clips gated to big crossings; v1 MVP nearly free; #1 blocker = bridge transparency | Research done; v1 buildable now; v2+ gated on Spec 2 + transparency ruling |
| [46-rpg-layer-design.md](46-rpg-layer-design.md) | **RPG layer + BE tracking design** (approved brainstorm, 2026-08-18): PC D&D-six sheet + 18 skills + essence pool; resolve-then-narrate seeded CheckService; engine-wired spell system on lorebook entries; bond/dependence/quirk girl tracks; lactation axis with bust feedback; anti-drift hardening; Sheet+Harem sidebar tabs. **Revises 37 §R** (attribute sheet now ruled in); rules in D2 as `bond` | Spec approved; 5 phases, none started |
| [47-rpg-phase1-plan.md](47-rpg-phase1-plan.md) | **RPG Phase 1 implementation plan** (12 ordered steps): roll-core extraction w/ golden tests, rpg/ service module, CheckService, choice tagging + risk-assess pre-pass, CheckPhase pipeline plumbing, prompt blocks, store apply w/ idempotent milestone leveling, drift detectors, CheckCard/DC chips/Sheet tab. Pinned rulings: crit band, seed contract, 6h period, manual rest, spend-at-classification | ✅ IMPLEMENTED (branch claude/aventuras-tracking-rpg-brainstorm-66abea, commits 0a2f648d→44c30792, 395 tests, reviewed) |
| [48-rpg-phase2-plan.md](48-rpg-phase2-plan.md) | **RPG Phase 2 plan (harem tracks)**: bond/dependence/quirks reduce INSIDE reduceCharacterBody as pipeline step 7 (10-step order), quirk registry + deterministic assignment (storyId:characterId:quirks seed, lazy backfill), bondEvents/exposureEvents classifier extension w/ velocity caps, targetCharacter check modifiers (sign-inverted onto bonus), gating table, [HAREM STATE] concatenated into beStateBlock (no template edits), Harem tab + turn log | ✅ IMPLEMENTED (commits 2580ed62→171a3977, 460 tests, reviewed: 1 bug found+fixed) |
| [49-rpg-phase3-plan.md](49-rpg-phase3-plan.md) | **RPG Phase 3 plan (lactation axis)**: `lactation` block w/ counters inside (neutral passthrough), `induction` event kind, supply adapts to demand/neglect, supply-scaled fill tick, chronic-supply growth through landGrowth gates, per-girl engorge threshold + apparent-size (presentation-only), milk as quantity-stacked inventory item w/ check-graded quality (Alchemy consumption deferred to Phase 4), early_bloomer/pressure_prone wired, lactation_drift detector, milk meter + editor toggle | ✅ IMPLEMENTED (commit 29af6c20, 634 tests, 3-lens adversarial review + fix-diff review — 36 findings fixed/accepted) |
| [50-rpg-phase4-plan.md](50-rpg-phase4-plan.md) | **RPG Phase 4 plan (magic/spells)**: spell = new `'spell'` lorebook Entry type (no migration; vault-decoupled via `VaultEntryType`), closed `EffectTag` vocabulary translated to reducer channels (`be/effects.ts`), `supply_surge` new step-7 reducer path, casting reuses `resolveCheck` (spellId through CheckPhase + schemas + CheckRecord), store applies effects via `applyBeEvents` with R9 anti-double-application dedupe (`dedupeForCast`), `[PLAYER SHEET]` known-spells line + cast directive, `stat_invention` spell arm, in-game generation (`SpellResearchService` + `spellSchema` + `learnSpell` two-surface rollback), spellbook UI (`SpellbookSection`), alchemy-milk empowerment (non-consuming v1). O1/O3/O5 confirmed by Ben; O2/O4 deferred | ✅ IMPLEMENTED (branch claude/rpg-phase-5-continuation-5a0e9b, 672 tests, svelte-check 0; adversarial review pending) |
| [51-rpg-phase5-plan.md](51-rpg-phase5-plan.md) | **RPG Phase 5 plan (polish & hardening)**: split into playtest-GATED (W4 DC/velocity balance pass — re-derives 4 stacked layers of D5 defaults from measured play, constants-only) and playtest-INDEPENDENT (W1 cache-order audit, W2 continuity UX, W3 settings for roll-card verbosity + log length, W5 deferred-backlog hardening — half-apply delta hazard, CheckRecord.targetId, RiskAssess perf, applyRpgTurn length, say/think cast drop, alchemy consumption, LLM-tagging authoritative dc/cost). Carries the cross-phase playtest verdict checklist | 📋 PLANNED — awaits Phase 1–4 playtest for the balance pass |
| [52-harem-card-visual-companion.md](52-harem-card-visual-companion.md) | **Harem-card V2d (shipped)**: GirlStatusCard gains a body-state sprite thumbnail via `selectSprite` + `spriteAnchorService.ensureSprite` + subscribe; VnView fallback chain; beMode-gated; pure client-side view layer | ✅ SHIPPED (commit f02ae4ba, 678 tests) |
| [53-harem-gallery-design.md](53-harem-gallery-design.md) | **Harem gallery design (presentation phase)**: hybrid expand/collapse — collapsed roster rows expand in place into full portrait cards; **cup size + measurements are the headline, tier demoted** (cupLetter/comparative/bwhCmString/measurements/fluidPressureLabel); present rows/cards vs absent name rows; reuses V2d sprite pipeline. New: HaremGirlRow, SizeBlock, girlSprite helper. Mockup of record: `research/mockups/53-harem-gallery-v2.html` | 📐 DESIGNED — awaiting implementation plan |
| [54-hardening-findings.md](54-hardening-findings.md) | **Hardening review findings (ranked)**: 3-lens adversarial audit of the RPG/BE/harem/persistence code. 2 critical (CR-1 no-transaction half-applied-delta [pre-existing]; CR-2 auto-refresh clobbers user template edits [self-inflicted, live]), 1 high (rollback swallows failures), 7 medium, 10 low, + cleared-as-correct list + recommended fix order. Documented only — no fixes applied | 📋 BACKLOG — fix in a dedicated follow-up |
| ~~43~~ · ~~44~~ · ~~45~~ | **MOVED 2026-07-22 → the Fablekin corpus.** The three Fablekin-era docs (host evaluation, BE plugin design, erotic prose craft) left this repo and were renumbered `01`/`02`/`03`. New home: `Projects/gaming/Fablekin/research/` (private repo `benebellsolomon-dot/fablekin-research`). Rationale: this repo's origin is a **public** fork and the Fablekin work is private. See that corpus's `INDEX.md` | Moved — do not re-add here |

## Task → read this

| Task | Read |
|---|---|
| The current plan / what to build next | **37** (engine/VN roadmap) |
| Anything Fablekin — plugins, BE prose craft, host evaluation | **`Fablekin/research/`** (01–03; separate private repo) |
| Image gen / accuracy / bridge | 32 → 30 §5 → 36 §5 (the A1111-shim finding) → `bundles/imagegen-handoff/` |
| BE engine internals (as built) | 31 → 31a → 31b; code at `src/lib/services/be/` |
| Import/migrate stories & characters | 30 §7 + `bundles/lucys-milk/aventuras-import/README.md` |
| BE body math / prose honesty | 35 → body-database-spec.md · extreme-bust-realism.md · ladder-reanchor-proposal.md · body-db/ |
| "What did the old eras have?" / port a legacy feature | **36** (gap analysis + inventory register with file:line pointers) |
| Pacing / harem / canon design history | harem-dynamics-17.md · chronicler-p3.md · live-audit-v0.3.21.md |
| Image-pipeline tuning / B2 bake-off corpus | `bundles/imagegen-handoff/` (playbook, presets, quality-upgrade reports) |

## BE domain corpus (era-independent — the engine's source science; COPY of ambrosia-st originals)

`body-database-spec.md` (the body-math spine) · `ladder-reanchor-proposal.md` (tier/cup anchoring)
· `extreme-bust-realism.md` (upper-range realism research) · `body-math-audit.md` + `body-db/`
(validation work) · `harem-dynamics-17.md` (attitude/relationship mechanics) · `chronicler-p3.md`
(canon persistence design) · `live-audit-v0.3.21.md` (the adversarial live audit — drift/overshoot
lessons) · `alpha52-panel-inventory.md` · `_engine_calc.mjs` / `_geom_check.mjs` (calc scratchpads).

## Bundles (migration + image-pipeline reference)

- `bundles/lucys-milk/` — the Lucy story migration source: `aventuras-import/` (importable
  chat/worldinfo/card JSON + README), the NAI `.story` export, the UIE package. (The 30.6 MB
  world-images blob + dairy-room PNG stay in `_inbox/lucys-milk-migration/` — too big to commit;
  see 36 §9 + `_inbox/CLEANUP.md`.)
- `bundles/imagegen-handoff/` — the frozen 2026-06 image-pipeline handoff: strategy/integration/
  playbook docs, `bridge-presets/`, `presets/`, `quality-upgrade/` (115-file B2 bake-off corpus),
  `reference-source/`. (The 300 MB `montages/` + `test-images/` corpora stay in
  `_inbox/BE-imagegen-handoff-v2/`; see `_inbox/CLEANUP.md`.)

## Regeneration scripts (in `../scripts/`)

`extract-ladder.mjs` (v1 tables) → `extract-ladder2.mjs` (v2 measurement/label channels appended)
regenerate `src/lib/services/be/ladder-data.ts` from
`code/be-story-engine/dist/ambrosia-v0.4.7.naiscript` (absolute path; that repo stays put).
`nai-story-to-st-import.mjs` (NAI `.story` → import JSON; needs the `msgpackr` devDep) ·
`aventuras-setup-bridge-profile.py` (pre-configures the app's image profile → si-animator-bridge).

## Prior eras (NOT moved — pointers only)

- **SillyTavern era (16–29)** → `code/ambrosia-st/research/`. 16 ST generation deep-dive
  (authoritative ST internals) · 17 LLM API strategy · 18 preflight · 19 best practices ·
  20–21 Marinara eval/harvest · 22 UI strategy · 23 extension suite · 24 Megumin deep-read ·
  25 MVU eval · 26 VectFox eval · 27 character-card style · 28 scene-illustrator port ·
  29 image-gen base. Platform anchor: `code/ambrosia-st/docs/STATUS.md`.
- **NovelAI era (01–15)** → `code/ambrosia-st/research/` (mirrored in
  `code/be-story-engine/research/`). 01–05 engine/data-format studies · 06 BE naiscript ·
  07–08 Vellum · 09 fork-and-extend plan · 10 verification · 11 lorebook growth reviewer ·
  12 Mythic GM emulator · 13–15 focus/cast/director suites · `audit-2026-06-11-followup.md`.
  The shipped script: `code/be-story-engine/dist/ambrosia-v0.4.7.naiscript`.
