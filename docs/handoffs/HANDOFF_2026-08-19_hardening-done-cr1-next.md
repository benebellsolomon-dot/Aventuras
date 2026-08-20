# Handoff — Hardening pass DONE (H-1..M-6, L-1 + store harness); NEXT = CR-1 transaction refactor

Written 2026-08-19. Supersedes `HANDOFF_2026-08-18_harem-gallery-shipped-hardening-next.md`.
Worked the `research/54` ranked fix order end-to-end. Everything below is committed on
branch **`claude/hardening-run-continuation-a6133b`** (a worktree; **not** landed to
`be-patches`/`master` yet — see Land). Base was `5ff5bbb7` (CR-2, prior session).

## Shipped this session (6 commits, all reviewed/tested)

`git log --oneline 5ff5bbb7..HEAD`:
- `b162e111` **H-1** — `rollbackService.rollbackFromPosition` now returns a per-entity
  `failures[]`; `deleteEntry` aborts (throws, keeps entry+delta) on partial rollback instead
  of deleting regardless. Retry is safe (SQLite delete/update on absent/same rows are no-ops).
  +`rollbackService.test.ts`.
- `e73d135a` **M-1 + M-2** — M-1: `dedupeForCast` is one-per-source (an independent classifier
  growth cause survives; the reducer cooldown still caps landed growth to 1/turn). M-2: step-3
  pending land capped at `MAX_GROWTH_LAND_PER_TURN` (1), remainder re-stages — a `slow_burn`
  bank meters out +1/turn instead of dumping +4/+5. **Ben approved overturning the prior
  whole-family-drop / unbounded-accumulate contract** (two existing tests updated).
- `8b12da0c` **L-1** — spell `condition` effect with no ttl now defaults `SPELL_CONDITION_DEFAULT_TTL`
  (3) instead of permanent.
- `69d4adee` **M-3 + M-4 + M-6** — M-3: `currentVisualDescriptors` snapshotted + restored on
  rollback (both capture sites + `restoreUpdatedEntities`, guarded so pre-M-3 deltas stay
  untouched). M-4: milestone `crossings` commit only after `bodyWriteLanded` (no phantom level
  on a swallowed body write). M-6: `exportLorebook` filters `type:'spell'` from every format.
- `0f2d77d3` **docs** — `research/54` marked with fix status + M-5 revert rationale + new CR-1
  sub-items.
- `5f984f0c` **store harness** (the CR-1 prerequisite) — see below.

Verified after each: full suite green, `svelte-check` 0, `eslint` clean. Two adversarial Opus
review passes ran over the M-1/M-2 and M-3/M-4/M-5 diffs (persistence discipline).

## M-5 was implemented then REVERTED (important — do not re-add naively)

M-5 (replay-idempotency guards: stamp `beAppliedEntryId`/`rpgAppliedEntryId` in metadata, skip
on re-apply) was built, reviewed, and **reverted**. Two independent findings:
1. **No re-apply path exists.** `applyClassificationResult` has ONE call site
   (`ActionInput.svelte:662`), fresh `crypto.randomUUID()` per turn. The guards were dead code.
2. **F1 (HIGH):** `applyClassificationResult` unconditionally **overwrites** `worldStateDelta`
   every run (~`story.svelte.ts:2868`). On any *future* replay the guards would rebuild a
   *degraded* delta (missing before-states, empty beLog/checkLog → un-undoable mutations) AND
   poison the marker into the new before-state → rollback restores it → genuine re-narration
   stays blocked forever.

Conclusion: replay-safety is **only** solvable inside CR-1 (delta write + mutations made atomic,
plus a "delta already exists for this entryId ⇒ replay ⇒ skip/merge" guard). Folded in below.

## NEXT SESSION = CR-1 transaction refactor (the last research/54 item)

**Goal:** make a turn's ~12 writes + the delta write all-or-nothing.
`applyClassificationResult` (`story.svelte.ts:2037`–~2895) applies every entity write as a
separate committed `await database.*`; the `worldStateDelta` (rollback record) is written LAST
at ~2868 inside a try/catch marked "Non-fatal." A crash/throw between the entity writes and the
delta write leaves half-applied, un-rollbackable state.

### The harness is READY (built this session, commit `5f984f0c`)
- `vitest.config.ts` now has TWO projects: **`unit`** (pure-TS `*.test.ts`, node) and
  **`svelte`** (`*.svelte.test.ts`, `@sveltejs/vite-plugin-svelte` runes, node env). The runes
  `StoryStore` instantiates and is drivable in tests.
- `src/lib/stores/__harness__/storeHarness.ts` — `makeDbRecorder()` (Proxy `database` mock;
  records every call; `failOn(method)` to simulate a mid-turn write failure) + minimal
  Story/Character/ClassificationResult builders + settings/ui mocks.
- `src/lib/stores/story.harness.svelte.test.ts` — drives `applyClassificationResult`, documents
  the entity-writes-then-delta ordering, and has a **RED-by-design** test ("CR-1 HAZARD") that
  pins current behavior (delta-write failure → trait committed, no delta). **CR-1 must FLIP that
  test**: when the delta write fails the whole turn rolls back, so the trait is NOT committed.

### Approach (decisions Ben approved — A + B)
- **Wrap the turn in `database.withTransaction(...)`** (already exists, `database.ts:163`;
  currently UNUSED so no nested-`BEGIN` risk; single shared sqlite connection). Move the delta
  write INSIDE the transaction (out of its non-fatal try/catch).
- **Decision A — in-memory state:** snapshot the in-memory `characters/locations/items/storyBeats/
  entries` arrays before the turn; on transaction rollback, restore them (+ reload from DB). Do
  NOT attempt the bigger "defer all in-memory mutation until commit" rewrite.
- **Decision B — `wrapUpdate` (`story.svelte.ts:2017`) semantics change:** today it swallows a
  per-write failure and continues (aborts only after 3 consecutive). Inside the transaction the
  FIRST write failure must abort the whole turn (throw → ROLLBACK). Best-effort → all-or-nothing.
  This is the point of CR-1 but is a real behavior change — keep the 3-strike counter for the
  non-transactional/legacy path if one remains.

### Fold in (surfaced by the M-3/M-4/M-5 reviews — see research/54 tail)
- **Delta-overwrite-on-resume guard:** at the top of `applyClassificationResult`, if a delta
  already exists for `entryId`, treat as replay → skip/merge rather than overwrite.
- **BE↔RPG milestone atomicity (reviewer Finding 2, pre-existing LOW):** a BE body write can land
  (crossing committed) while the RPG-sheet write then fails → `awardedMilestones` not persisted,
  mass IS → level lost. Wrapping the turn atomically fixes this for free.
- **M-5 replay guards, done RIGHT (only meaningful once the delta-overwrite guard exists):** guard
  the STATEFUL essence spend / regen / body growth against re-apply, but keep the idempotent
  `applyLevelGrants` UNGATED (a crossing that only persisted on the re-apply must still grant —
  that was the M-3/M-4 reviewer's "Finding 1"). The reverted implementation lives in git history
  (this branch, pre-`69d4adee`) if useful as a starting sketch — but it is NOT safe without the
  delta-overwrite guard.

### Watch-outs
- `maybeCreateAutoSnapshot(entryId)` is called inside the old delta block (~2887) — decide
  whether it belongs inside or after the transaction (probably AFTER commit).
- COW paths (`cowCharacter`/`cowItem`/`cowLocation`) create override rows mid-turn and mutate
  `createdCharacterIds`/`charactersBefore`; make sure the snapshot-restore covers those too.
- Re-run the two-lens adversarial review on the CR-1 diff (persistence discipline) before commit.

## Verify (NOTE: two vitest projects now)
Fresh worktree: `npm ci` → `npx svelte-kit sync` → `npx vitest run` (697 across both projects;
`--project svelte` / `--project unit` to scope) → `npm run check` (0) → `npx eslint .`.
`npm run tauri dev` for the live app (:1420).

## Land (unchanged from prior handoff; nothing pushed — origin push URL DISABLED)
This branch is a local worktree branch. To land: FF `be-patches` from it, FF `master` in the
`aventuras-image-gen-quality-*` worktree, restart the app (`pkill -f "target/debug/aventura";
pkill -f "tauri dev"; lsof -ti:1420 | xargs kill`, relaunch). A settings/pack-template change
needs a full restart. Re-check `be-patches` HEAD before FF (a concurrent 2nd session has landed
there before — rebase if diverged).
