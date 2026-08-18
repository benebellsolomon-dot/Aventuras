# Handoff — Aventuras RPG layer (Phases 1–3 shipped, Phase 4 next)

Written 2026-08-18, end of the Phase 3 (lactation axis) session. Fable-orchestrator/Opus-agent workflow; all work merged and pushed.

## Goal of next session

Play-test RPG Phases 1–3 in the live app (nothing has been play-tested yet — three phases of reference-default numbers are stacked), fix what play surfaces, then implement **Phase 4 — magic/spells** (spec `research/46-rpg-layer-design.md` §2.5 + §6 item 4), starting the established way: generate `research/50-rpg-phase4-plan.md` grounded in spec + landed code before writing any implementation.

## State of play

- **Phase 3 (lactation axis) is implemented, adversarially reviewed, MERGED, and PUSHED**: merge commit `ed946fc4` on `master`, pushed to origin (`1f7016c8..ed946fc4`); `be-patches` (the branch the live app at `~/Projects/gaming/Aventuras` runs from) fast-forwarded to the same commit. Feature commits `29af6c20` + `bcb4d675` on branch `claude/opus-fable-orchestrator-ba2298` — the first commit's message is the feature summary. Suite: **634 tests green**, svelte-check 0 errors.
- **The same merge closed the image-gen handoff's three gaps** (regenerate via canonical inline assembly; si-bridge portrait refs → `pose_face_anchor_b64`; scene-presence-scoped body blocks via new `be/presence.ts`). The image-gen thread's remaining deferred items are unchanged: direct-ComfyUI expansion (Ben ruled: deferred), si-bridge retirement decision, cup-letter derivative bulge tiers 14–18 (audit-pinned — needs Ben's call).
- **Review rigor note**: Phase 3 got a 3-lens adversarial review (36 findings, 6 HIGH — all fixed or accepted with written rationale) plus a fix-diff review that caught 3 real defects in the first-cut fixes. The two-stage pattern earned its keep; repeat it for Phase 4.
- **Deliberately deferred, with task chips already created in Ben's session**: `CheckRecord.targetId` (same-name grading collision) and hardening the pipeline against half-applied deltas (pre-existing hazard class; no store test harness exists — repeatedly flagged).
- **Deferred to Phase 4 by ruling in the plan**: Alchemy consuming milk items (quality metadata is the hook); wire it when essence costs/crafting exist.
- **Not runnable by agents**: the manual induce → milk → item-appears round trip in the live app. Amelia (Ben's active story) still needs her baseline set in the BE panel; her lactation state can be backfilled with the new BeStatePanel editor.
- **Push mechanics**: origin's push URL is set to `DISABLED` in git config (guard). This session pushed via the explicit URL with Ben's authorization; do the same next time, don't rewrite the config. `be-patches` is local-only (no remote branch) — that is normal.
- Infra note: this session hit a prolonged fleet-wide 529 outage that killed every subagent three times; the recovery pattern that worked: wait ~5 min, resume ONE agent as a canary, then re-fan. Falling back to inline work for the plan authoring was the right call.

## Open decisions

- **Play-test verdicts to collect** (now spanning three phases): check DCs/odds; bond velocity cap; strain reporting; risk-assess latency; NEW — does supply adaptation pace feel right (2 milked beats up, 4 idle down); does the milking-gate flip read as intended (a big-but-uninduced girl loses the milking offer until induced — documented as intended, but play may disagree); does the chronic-supply growth cadence (6 beats at heavy+) land; is the drift-detector milk suppression rule (fluidType=milk && fill≥40) right in play.
- **Phase 4 scope questions the plan must settle**: spell lorebook entry type + EffectTag vocabulary execution order in the reducer; in-game spell generation validation; spellbook UI in SheetPanel; Alchemy milk consumption shape.
- **Balance pass** (spec Phase 5, but pressure grows): three phases of D5 reference defaults are now stacked with zero cadence data.

## Skills to use

- **investigating-bugs** — first stop for anything play-testing surfaces; the engine is seeded/deterministic, repro is cheap.
- **code-review** — after Phase 4 lands; keep the two-stage pattern (multi-lens adversarial + fix-diff review) — both stages caught real bugs this session.
- **tdd-workflow** — established: pure engine modules test-first; .svelte markup-only (vitest is node-env); the store layer has NO harness, so store changes get extracted-pure-helper tests + reading.
- **handoff:handoff** — refresh this doc at session end.

## Artifacts

- Spec: `research/46-rpg-layer-design.md` · Phase plans: `research/47`, `research/48`, `research/49-rpg-phase3-plan.md` (its "Rulings to pin" R1–R11 + shipped-deviation notes are the Phase 3 ground truth) · Map: `research/INDEX.md`
- Merge: `ed946fc4` on `master` (= `be-patches`, pushed); feature branch `claude/opus-fable-orchestrator-ba2298` (worktree `.claude/worktrees/opus-fable-orchestrator-ba2298`)
- Key new code: `src/lib/services/be/{lactation,presence}.ts`, reducer step 7 + the 11-step pinned order in `be/reducer.ts`, `applyMilkYield`/`bottleMilkYield` in `src/lib/stores/story.svelte.ts`, `bridgeIdentityAnchor` in `ai/image/bridgeSpec.ts`, `assembleInlineRetry` in `ai/image/imageUtils.ts`
- Project memory: `backend-roadmap.md` in the Aventuras auto-memory carries the same state in detail
- Verify commands: `npx vitest run` (634), `npm run check`, `npx eslint .` (run `npx svelte-kit sync` first in a fresh worktree)
