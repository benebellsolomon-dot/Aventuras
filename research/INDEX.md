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
| [37-implementation-plan.md](37-implementation-plan.md) | **The roadmap + full file-level specs** for the quick-wins batch, si-bridge provider, and C6 pack (Phases 2–4) | ⭐ Active plan |
| [38-body-math-audit.md](38-body-math-audit.md) | **Body-math audit + corrections** (Ben-triggered): bust was miscalibrated ~35% low vs the Norma anchor → corrected closed-form on her own band; STRICT letter re-anchor (t47=T, X@t64); honest total weight; droop surfaced; canary armor | ✅ Rulings SHIPPED (be.5) |
| [39-adversarial-math-verification.md](39-adversarial-math-verification.md) | **Adversarial math verification** (Ben-directed, pre-deploy): 3 independent researchers (sizing/medical/geometry) + adversarial refuter; anchor confirmed as a ratio-gauge (Guinness diff primary); 4 shape-handling defects found+fixed; SHIP verdict + documented caveats | ✅ SHIPPED (be.6); the foundation |

## Task → read this

| Task | Read |
|---|---|
| The current plan / what to build next | **37** (roadmap + file-level specs) |
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
