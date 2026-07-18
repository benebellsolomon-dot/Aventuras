---
generated_at: 2026-07-18T05:40:43Z
goal: "Phase 1 Lucy playtest (acceptance gate) then Phase 2 quick-wins batch, per the research/37 roadmap"
---

# Handoff — 2026-07-18

> A fresh agent reads this to continue the work.
> Do not duplicate artifacts (PRDs, plans, ADRs, commits, diffs).
> Reference them by path or URL.

## Goal of next session

Phase 1 Lucy playtest (acceptance gate) then Phase 2 quick-wins batch, per the research/37 roadmap

## State of play

_Git context (auto-included from config)._

- Branch: `be-patches`
- Last commit: `996d477c docs(research): 40 calibration dataset hunt — mid-curve gap is structural, droop validated`
- Dirty files: 0

**Project:** BE (breast-expansion) story engine inside Ben's Aventuras fork
(`Projects/gaming/Aventuras`, branch `be-patches` — the permanent line; upstream abandoned the
Tauri codebase). Adult creative project; treat the domain as technical material.

**Done:**

- Phase 0 consolidation — all Aventuras-era research moved into the fork, domain corpus copied,
  regen scripts rescued from an ephemeral scratchpad, bundles filed. Commit `a480e588`; layout and
  pointers in `research/INDEX.md`.
- BE engine Phase A built + wired + deployed across earlier commits (`c29ccc90` wiring,
  `44e3c478` NAI-parity stats, `4d088568` metric). Engine at `src/lib/services/be/`.
- Body-math audit → correction → adversarial verification, all shipped. `d77067d9` (audit
  research/38), `1951fef2` (be.5 corrected curves), `21c26382` (be.6 shape refactor + guards,
  research/39), `996d477c` (research/40 dataset hunt). **0.7.6-be.6 is installed in
  /Applications and running.**
- Test/verify gates green at handoff: 99 vitest tests (6 files), `npm run check` 0 errors,
  `npm run lint` 0 errors. Canary armor lives in `src/lib/services/be/canary.test.ts`.
- Model-routing research folded into the plan — see `research/37` §"Model routing".

**In flight / next:**

- **Phase 1 = Lucy playtest.** Ben plays; the agent instruments read-only. Checklist in
  `research/37` Phase 1 (includes the classifier schema-compliance probe that picks the
  classifier model). Nothing ships in this phase.
- **Phase 2 = quick-wins batch**, full file-level spec in `research/37` Part II Spec 1
  (milestones/"Approaching:", conditions writer, passive fluid fill + registry, anticipation
  two-beat, pressure escalator, output-side drift detection, support axis, extra ladders).

**Blocked / gated:**

- Phase 2's measurement-dependent tasks were gated on the body-math rulings — **that gate is now
  cleared** (research/38 §6 rulings shipped, verified in research/39). Phase 2 may proceed once
  the playtest informs ordering.
- Oracle + Skills subsystems are Ben-ruled OUT of this roadmap pending their own redesign
  brainstorm ("should be rebuilt in a different way").

**Standing constraints (violating these has caused real damage before):**

- Never write the app's SQLite DB while Aventuras is running; read-only queries are fine. Quit
  via `osascript -e 'quit app "Aventuras"'` and back the DB up before any write.
- Fork commits are established practice; **never `git push`** without Ben saying so.
- `code/ambrosia-st` has 2 untracked files by design (`research/MOVED.md`, `scratch_statsystem.txt`);
  commit there only when Ben asks.
- Builds need Node 22 on PATH: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.
- Handoff-plugin scripts need Python ≥3.10 — system `python3` is 3.9; use
  `/opt/homebrew/bin/python3.11`.

## Open decisions

- **Lucy's canonical tier — blocks a meaningful playtest.** Her live `bodyState.tier` is **6**
  (≈DD, her *original* size) while her card text says "colossal 38X". Options: set 47 (the
  long-standing working anchor; renders T-cup ~124 cm on her frame under the corrected ladder) ·
  set ~64 (a true X-cup under the honest ladder, ~24 kg tissue — a large canon jump) · pick by
  eye in play. Lean: **47**, matching every prior ruling and doc. Constraint: seeding from her
  description now maps "X" → ~64, so set the tier directly in the Body State panel rather than
  using the Seed button. Ben rules.
- **Tissue density (optional, non-blocking).** Model uses 0.95 g/cc; directly-measured
  whole-breast density is ~1.06–1.07 (research/40 §4). Options: keep 0.95 (zero churn) · ~1.00
  (splits the measured range) · ~1.06 (max fidelity, needs goldens re-pinned + the anchor
  re-derived). Lean: **keep or 1.00** — near-zero effect on the ratio-anchored bust curve, ~10%
  on displayed volume/capacity which is already fantasy-scaled. No constraint forcing it.
- **Classifier model — decided by data, not opinion.** Candidates: current `x-ai/grok-4.3` ·
  GLM-5.2 (reasoning off + `structuredOutputOverride:'on'`) · Haiku 4.5 (only if non-refusal on
  this content is confirmed). Banned: DeepSeek v4, all Grok-*fast* tiers. The Phase-1 probe
  (≥10 turns; 100% parseable, 0 refusals, no field drops) picks the winner.
- **Three live config bugs found but NOT fixed** (Ben's app settings, not code): the `memory` and
  `Images` presets point at the nonexistent slug `~x-ai/grok-latest`; `actionChoices` emits
  structured JSON on a DeepSeek-backed preset; narrator `maxTokens` is 8192 (GLM wants ≥24k).
  Details in `research/37` §"Model routing". Decide whether the next session fixes these in
  Settings or leaves them to Ben.

## Skills to use

- `engineering:code-review` — Phase 2 touches the single-writer reducer and the store apply-site;
  the house rule is to review the fix diff, not just the finding.
- `tdd-workflow` — Spec 1 is pure-function engine work with an existing 99-test suite; write the
  canary/monotonicity tests before the curve changes.
- `verify` — deploy verification is behavioral (drive a real turn), not just green tests; the
  deploy chain is DB backup → quit → build → ditto → relaunch → smoke turn.
- `handoff:cs-handoff` — this session ran long; hand off again before context runs out rather
  than mid-Phase-2.

## Artifacts

- Roadmap + Phase 2/3/4 file-level specs: `Projects/gaming/Aventuras/research/37-implementation-plan.md`
- Body-math audit + shipped rulings: `Projects/gaming/Aventuras/research/38-body-math-audit.md`
- Adversarial verification + model caveats: `Projects/gaming/Aventuras/research/39-adversarial-math-verification.md`
- Calibration dataset hunt (density ruling, droop validation): `Projects/gaming/Aventuras/research/40-calibration-dataset-hunt.md`
- Cross-era feature gap analysis (what the old eras had): `Projects/gaming/Aventuras/research/36-cross-era-feature-gap-analysis.md`
- Research index / where everything lives: `Projects/gaming/Aventuras/research/INDEX.md`
- Engine source: `Projects/gaming/Aventuras/src/lib/services/be/` (curves.ts, measurements.ts, reducer.ts, context.ts, canary.test.ts)
- Store apply-site (Phase 2 Task 9 seam): `Projects/gaming/Aventuras/src/lib/stores/story.svelte.ts` (`applyBeEvents`)
- Live DB (read-only while app runs): `~/Library/Application Support/com.karelian.aventura/aventura.db`
- Latest DB backup: `~/Library/Application Support/com.karelian.aventura/aventura.db.20260718-010534.bak` <!-- handoff:allow secret --> (timestamp suffix, not PII)
- Regen + validation scripts: `Projects/gaming/Aventuras/scripts/` (extract-ladder.mjs, extract-ladder2.mjs, audit-body-math.mjs, validate-droop.mjs)
- ST/NAI-era archive (not moved): `Projects/code/ambrosia-st/research/`, `Projects/code/be-story-engine/`

---

_Inspired by Matt Pocock's handoff (MIT). See README for full credit._
