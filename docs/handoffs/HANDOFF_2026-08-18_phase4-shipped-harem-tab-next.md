# Handoff — RPG Phase 4 shipped; NEXT = Harem-tab visual companion layer

Written 2026-08-18, end of the Phase 4 (magic) + Phase 5 (partial hardening) session. Fable-orchestrator/Opus-agent workflow. Everything is committed and landed in the live app; Ben is mid-playtest.

## Goal of next session

Build the **harem-tab visual companion layer**: upgrade the Harem sidebar tab's cast-member cards from text to **visual** — each female cast member (harem member) shown with a **portrait/sprite reflecting her current bust/body state**, plus affection (bond), dependence, milk supply, and the other BE stats. This is the start of the **presentation/VN phase** (Ben's ruling this session: the RPG-mechanics phases are done; the next phase is the visual/presentation layer, with the harem-member cards as its centerpiece).

**Start the established way** — this is NOT a from-scratch brainstorm (Ben was explicit: "we've already gone over mockups for this section, this is part of the plan"). Ground in the existing design, confirm the two open items below with Ben, then write an implementation plan (`research/52-...`) and build.

## The harem-tab work — where the design already lives

- **`research/42-visual-novel-mode.md`** — the VN presentation architecture (client-side view layer over the existing pipeline; banded FaceID sprite sets keyed on `bandIndex(tier)` × expression clusters + engorged variant; deterministic `bodyState → sprite` selection). Folded into `research/37` Part III as the V1/V2/V3/V4 track.
- **`research/37-implementation-plan.md` Part III** — the live VN phase ordering: **V1** (VN presentation MVP — portrait standees, buildable now) · **V2** (BE sprite engine — banded sets, app-side matting, approved anchors, 35 cells; "IN BUILD" as of 2026-07-19) · V3 (multi-char stage) · V4 (growth media).
- **Existing code to build on:** `src/lib/components/world/GirlStatusCard.svelte` (the current 116-line TEXT card — tier/sizing, lastGrowth, lock, attitude, bond stance, dependence stage, milk meter, quirk/condition chips; **no portrait yet**) inside `HaremPanel.svelte`; `src/lib/services/be/sprite.ts` (`selectSprite`, `spriteSeed`, `bandRepresentativeTier`, banded cells — the deterministic band→sprite machinery already exists); portrait generation plumbing (standee-framed by design per research/42 §2).

## TWO open items to settle with Ben BEFORE building (do not guess)

1. **The mockups.** Ben says mockups for this section already exist and were reviewed. They are **NOT saved anywhere in the repo** (searched `research/`, `docs/`, `docs/superpowers/specs/` — none found). Ask Ben to point at them (a file path, an artifact URL, or a screenshot he can drop in). If they were a prior visual-companion session that wasn't saved, confirm you should build from the `research/42` + `research/37` spec + the existing card, and capture the layout decisions in the new plan doc so they're durable this time.
2. **Scope: harem cards vs full VN stage.** Ben's wording ("companion layer … their bust/body states, affection, and BE stats") reads as the **harem-tab cards becoming visual** (the tighter, ship-now piece — buildable on the existing sprite engine). Confirm it's that and not the fuller **VN story stage** (background + positioned sprites + textbox over the feed, research/42 V1). Recommend the harem-card companion first.

## State of play (this session's shipped work)

- **RPG Phase 4 (magic/spells) — SHIPPED, reviewed, LIVE.** Plan `research/50-rpg-phase4-plan.md` (11 rulings, 9 steps). Spells are a new `'spell'` lorebook `Entry` type (no migration; vault decoupled via `VaultEntryType`); closed `EffectTag` vocabulary translated to reducer channels (`be/effects.ts`); `supply_surge` new reducer step-7 path; casting reuses `resolveCheck` (spellId through CheckPhase + schemas + CheckRecord) with R9 anti-double-application dedupe (`dedupeForCast`); in-game generation (`SpellResearchService` + `spellSchema` + `learnSpell` two-surface rollback); `[PLAYER SHEET]` known-spells line + cast directive; `stat_invention` spell arm; spellbook UI (`SpellbookSection.svelte`); alchemy-milk **non-consuming** (O5 deviation — Ben's ack pending on wiring the consuming variant). 3-lens adversarial + fix-diff review; **7 fixes landed** (incl. `check_debuff` was inert→wired, event-less effects dropped on unseeded target→seed-gate, fizzle/untargeted cast directive→gated).
- **Phase 5 (polish/hardening) — PARTIAL.** Plan `research/51-rpg-phase5-plan.md` (playtest-gated W4 balance pass vs playtest-independent W1/W2/W3/W5). Done this session: **W3** (roll-card verbosity + turn-log length settings), **W5-D5** (say/think-mode cast-drop fix), **W2** (cast ✨ markers + verbosity in the turn log), **W5-D2** (`CheckRecord.targetId` — same-name-girl disambiguation), plus a playtest bug fix (**`spellResearch` service was unregistered** → added to `DEFAULT_SERVICE_PRESET_ASSIGNMENTS` + the Agent Profiles UI).
- **Remaining Phase 5 hardening (secondary to the harem tab):** **W1** cache-order audit · **W5-D1** half-applied-delta rollback harness (the flagship long-flagged item — needs a real store test harness) · **D3** RiskAssess context reuse · **D4** behavior-preserving length extraction from `applyRpgTurn`/`applyBeEvents`.
- **Suite: 678 tests green, svelte-check 0, eslint clean.**

## Git + app state (READ THIS before touching anything)

- **All committed. `master` == `be-patches` == `claude/rpg-phase-5-continuation-5a0e9b` == `9a3e8945`.** History is linear; landing this session used clean **fast-forwards**, not merge commits.
- **The live app runs from the MAIN checkout `~/Projects/gaming/Aventuras` on `be-patches`.** It is a **Tauri desktop app** (`npm run tauri dev` → `vite dev` frontend on `localhost:1420` + the Rust shell window). Landing changes = FF `be-patches` from the feature branch, then restart the app (`pkill -f "target/debug/aventura"; pkill -f "tauri dev"; lsof -ti:1420 | xargs kill`, then `cd ~/Projects/gaming/Aventuras && npm run tauri dev` in background). `master` is checked out in the `aventuras-image-gen-quality-372ac2` worktree — FF it there (it's clean).
- **The app is CURRENTLY RUNNING** (background `tauri dev`, was healthy on 1420 at handoff). A settings-store change (like the spellResearch fix) needs a full restart or a webview reload (Cmd+R) — HMR won't re-init the singleton.
- **Push mechanics:** origin's push URL is `DISABLED` (guard); `be-patches` is local-only (no remote). Nothing was pushed to origin this session — all landing was local FF for the live app. Don't rewrite the git config.

## Playtest status + verdicts to collect (feeds Phase 5's W4 balance pass)

Ben is actively playtesting Phases 1–4 (first play-test of ANY of them — four phases of D5 reference defaults stacked). Confirmed working this session: spell research → learn → the spellbook. Verdicts still needed: DC feel + honest odds; bond/dependence velocity; lactation cadence; **magic** — essence-cost affordability, band→effect scaling, research→cast loop, and whether **LLM-generated spells come out balanced** (retune `spellSchema` bounds / the research prompt, or point the `spellResearch` service at a stronger model via Settings→Generation, if they skew).

## Ben's open calls carried forward

- Alchemy-milk consuming variant (O5) — wire it on the `applyMilkYield` capture pattern if Ben wants it after playing the non-consuming version.
- LLM-`spellId`-tagging authoritative dc/cost (Phase 4 deferred) — ships WITH that feature (CheckPhase must resolve the entry); v1 UI casts are already authoritative.
- The four D5 layers of reference defaults are still untuned — the balance pass is the corrective, and it needs Ben's play data.

## Skills to use

- **brainstorming** — only if the harem-card design genuinely needs decisions the plan doesn't cover; Ben pushed back on re-brainstorming a designed feature, so lead with "confirm the existing design" not "explore from scratch."
- **investigating-bugs** — first stop for any playtest bug (the engine is seeded/deterministic; repro is cheap). The `spellResearch` unregistered-service bug this session is the template: new AI services must be added to `DEFAULT_SERVICE_PRESET_ASSIGNMENTS`.
- **code-review** — the two-stage pattern (multi-lens adversarial + fix-diff refutation) earned its keep again this session (the fix-diff pass caught a real defect in a first-cut fix). Repeat it for any server-side/persistence change in the harem/VN work.
- **handoff:handoff** — refresh this doc at session end.

## Artifacts

- Specs/plans: `research/46` (RPG design) · `research/47`–`51` (Phase 1–5 plans) · `research/42` (VN mode) · `research/37` Part III (VN track) · `research/INDEX.md`
- Key Phase 4 code: `src/lib/services/be/effects.ts`, reducer step-7 supply_surge in `be/reducer.ts`, `computeSpellCast`/`learnSpell` in `src/lib/stores/story.svelte.ts`, `SpellResearchService.ts`, `ai/sdk/schemas/spell.ts`, `SpellbookSection.svelte`
- Harem-tab starting points: `src/lib/components/world/GirlStatusCard.svelte`, `HaremPanel.svelte`, `src/lib/services/be/sprite.ts`
- Project memory: `backend-roadmap.md` (Aventuras auto-memory) carries the same state in detail
- Verify: `npx vitest run` (678), `npm run check`, `npx eslint .` (run `npx svelte-kit sync` first in a fresh worktree)
