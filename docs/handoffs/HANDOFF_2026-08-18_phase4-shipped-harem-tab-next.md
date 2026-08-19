# Handoff — RPG Phase 4+5 shipped, harem card landed-but-not-rendering; NEXT = make the harem card visible

Written 2026-08-18, end of the Phase 4 (magic) + Phase 5 (partial hardening) + harem-card session. Everything is committed and landed on `be-patches` (the live app) at **`f02ae4ba`**. **READ THE "SESSION 2 ADDENDUM" AT THE BOTTOM FIRST** — it supersedes the original framing below (the harem card got BUILT this session; it just isn't rendering yet), and it carries a hard-won debugging lesson (silent model/service **config** failures).

## Goal of next session

**Fix the top open bug: the harem-card visual companion is LANDED (`GirlStatusCard.svelte` at `f02ae4ba`, with body-state sprite thumbnails) but STILL NOT VISIBLE in the running app** (Ben's last report). No console errors — so first turn ON **Debug Mode** (Settings) to unhide the app's own logs (see the addendum). Likely causes to check, in order: (a) the Harem tab isn't the active sidebar tab / the panel isn't mounted; (b) no PRESENT girls in the current scene (cards render only for scene-present characters via `presentCharacterNames`); (c) a `HaremPanel`/`GirlStatusCard` render gate. Then continue the presentation/VN polish and the remaining Phase 5 hardening (W1, D1, D3, D4).

The harem-card DESIGN work is DONE — the visual companion (portrait/sprite reflecting bust/body state + affection + BE stats) was built this session per `research/52-harem-card-visual-companion.md`. What remains is a rendering/visibility bug, not new design.

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

---

## SESSION 2 ADDENDUM (2026-08-18, late) — READ FIRST

### Current live state
- **`be-patches` == `master` == `f02ae4ba`** — the FULL latest work: Phase 4 magic + Phase 5 hardening (W3 roll-card/log settings, D5 cast-in-any-mode, W2 cast ✨ markers, D2 same-name `targetId` fix) + the spellResearch service-registration fix + the **complete harem-card visual companion** (dynamic body-state sprite thumbnails, `research/52-harem-card-visual-companion.md`). The app runs from this.
- Branches: this session's Phase 4/5 feature branch `claude/rpg-phase-5-continuation-5a0e9b` = `60930d32` (handoff docs; behind — does NOT carry the harem card). The harem card lives on `claude/phase4-harem-tab-next-8d2524` = `f02ae4ba` (built by a parallel session acting on this handoff). Nothing pushed to origin (push URL DISABLED, be-patches local-only).
- Suite 678, svelte-check 0, eslint clean across all of it.

### TOP OPEN BUG — the harem card is landed but NOT VISIBLE
Even with `f02ae4ba` restored (full harem card), Ben reports the harem card still does not show. No console errors (but see the Debug Mode note — errors are hidden by default). This is next session's #1 task. Debug it WITH Debug Mode on. Prime suspects (check in order): active sidebar tab not Harem / panel not mounted; no scene-present girls (cards key off `presentCharacterNames`); a `HaremPanel`/`GirlStatusCard` render/beMode gate. The card code is `GirlStatusCard.svelte` @ `f02ae4ba` and `HaremPanel.svelte`.

### THE BIG LESSON — silent model/service CONFIG failures (cost this session hours)
A long stretch went to a false alarm: **"all options + the dice card + the harem card disappeared."** After reverting Phase 5, then the harem card, then all the way to Phase 4 — and inspecting the DB — the real cause was **the "Suggestions" AI service's MODEL failing** (action choices run on a different model than narration — `deepseek/deepseek-v3.2` via the `suggestions` preset). Narration worked (its model was fine); action-choices came back empty; **nothing logged as an error**. Ben fixed it by changing/re-setting the Suggestions model in Settings → Generation.
- **RULE for next session: for ANY "UI element silently missing / feature does nothing, no console error" symptom, turn ON Debug Mode FIRST** (Settings → the Debug Mode toggle). The app's own `createLogger` logs are SUPPRESSED without it, so "no console errors" is meaningless until it's on. Do NOT bisect code for a symptom that has no error and survives code reverts — it's almost always CONFIG/STATE (model assignment, a service not registered, a story-state row), not code.
- Same class as the **`spellResearch` unregistered-service** bug earlier this session (fixed: added to `DEFAULT_SERVICE_PRESET_ASSIGNMENTS` in `settings.svelte.ts` + the Agent Profiles UI). New AI services MUST be registered there or they error "not assigned to an Agent Profile."
- **DB inspection** (read-only, powerful): `sqlite3 -readonly ~/Library/Application\ Support/com.karelian.aventura/aventura.db "..."`. Useful tables: `stories.settings` (per-story JSON incl. beMode), `settings` (key-value: `system_services_settings`, `service_preset_assignments` — model/profile per service), `entries` (lorebook, incl. `type='spell'`), `characters.metadata` (rpgSheet.knownSpells). Do NOT DELETE/UPDATE the DB without Ben's explicit OK (destructive writes are correctly gated by the harness).

### App run/land mechanics (unchanged, restated)
Tauri desktop app: `cd ~/Projects/gaming/Aventuras && npm run tauri dev` (vite on :1420 + Rust window). Land work by FF'ing `be-patches` from a feature branch then restarting (`pkill -f "target/debug/aventura"; pkill -f "tauri dev"; lsof -ti:1420 | xargs kill`, then relaunch in background). `master` is checked out in the `aventuras-image-gen-quality-372ac2` worktree — FF it there. A settings-store change needs a full restart (HMR won't re-init the singleton).
