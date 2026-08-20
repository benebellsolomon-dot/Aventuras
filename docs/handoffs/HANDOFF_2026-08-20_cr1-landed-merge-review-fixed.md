# Handoff — CR-1 LANDED (merge + 2-round review fix pass); NEXT = playtest or D-backlog

Written 2026-08-20. Worktree **`aventuras-tracking-rpg-brainstorm-66abea`**, branch
**`claude/opus-agents-orchestration-82d727`**. Supersedes
`HANDOFF_2026-08-19_image-gen-dedicated-prompt-writer-next.md` (its NEXT — the booru
prompt writer — shipped in `323a3dd1..44534208` before this session).

## What this session did

1. **Merged the CR-1 hardening line into master's line** — merge `99cd8f79`.
   Parents: `44534208` (booru writer, starting grant, sampling knobs) ×
   `951ec2bc` (H-1..M-6/L-1 research/54 fixes, store harness, CR-1 atomic turn
   writes: JS write batch flushed in ONE real SQLite transaction via Rust
   `exec_batch_tx` on a dedicated pool). Conflict only in `story.svelte.ts`;
   resolved by taking CR-1's rewrite wholesale and re-applying the image/RPG
   delta (withStartingGrant pre-grant baseline in applyRpgTurn, sheetOrDefault
   in learnSpell, deferred identity hygiene — placed AFTER the commit point so a
   rolled-back turn never fires it).
2. **3-lens Opus adversarial review of the merge** (atomicity / batch-
   concurrency / client edge cases — the INTERACTIONS neither parent's review
   saw). ~30 findings. **Ledger of record: `research/56-cr1-merge-review-findings.md`.**
3. **Two-round fix pass**, commit `c00bedac`:
   - Round 1: batch lifecycle hardening (double-begin can't abort the other
     turn's batch; commit-on-null THROWS instead of reporting a torn turn as
     success), withTransaction control statements direct, identity hygiene on
     the direct-write path (`updateCharacterDirect` + guards + .catch),
     saveBackground direct, refreshWorldState batch guard, Rust pool
     `app_config_dir` parity (Linux).
   - Round 2 (the fix-diff REFUTATION pass found round-1 defects — keep this
     discipline): reverted a WRONG round-1 fix (close() aborting the batch would
     itself tear turns — the batch deliberately survives close; see comment in
     database.ts), completed the Linux path fix in `backupService.ts`, restored
     persistIdentityHygiene's not-found/cross-branch guards, replaced the
     refresh skip with `waitForBatchClose` defer (+ while-loop), restored the
     deliberate in-place background-image mutation (direct-committed value must
     survive turn revert), friendlier double-begin error, 6 new batch tests.

Gates at `c00bedac`: **831 tests, svelte-check 0/0, eslint 0 errors (198
pre-existing boundary warnings), cargo check clean, prettier clean.**

## State / landing

- **master == be-patches == `c00bedac`** (both FF'd). Live app restarted from
  the MAIN checkout (`~/Projects/gaming/Aventuras`, be-patches) — the previous
  instance had been running STALE Phase-3-era code from the
  `opus-fable-orchestrator-ba2298` worktree. Rust changed → first launch
  recompiles; verify :1420 is up.
- **Nothing pushed to origin** (push URL disabled by design; explicit-URL push
  only when Ben authorizes: `git push https://github.com/benebellsolomon-dot/Aventuras.git master`).
- The old side branches (`claude/hardening-done-cr1-next-3f63ed`,
  `claude/hardening-run-continuation-a6133b`) are fully contained in the merge —
  their worktrees/branches can be cleaned up.

## NEXT (pick with Ben)

1. **Playtest** — Phases 1–4 + CR-1 have NEVER been play-tested end-to-end. A
   real session with Amelia present exercises: atomic turn (watch for the
   rollback toast — it should never fire in normal play), booru writer (expand a
   `<pic>` prompt → should open with her locked tags), starting grant (sheet
   shows 8/6 creation points), DC rubric.
2. **D-backlog from research/56** — top items: D-1 stop-generation ordering,
   D-2 world-panel + story/branch-switch gating during turns, D-3 background
   writers still proxy-routed, D-4 beMode-without-stateTracking legacy path.
3. Remaining research/51 Phase-5 items (W1 cache audit, D3 RiskAssess perf, D4
   length extraction) and the research/55 follow-ups (identity backfill
   parallelization; 11 of 13 characters still bank-less — Ben runs the modal).

## Watch-outs

- `promptModel`/`promptProfileId` on imageGeneration settings are DEAD — image-
  prompt LLMs ride the **imageGeneration service preset**; keep it a fast
  non-thinking model (memory: image-prompt-model-selection).
- The store harness now stubs `getServicePresetId`/`isBatchOpen`/
  `waitForBatchClose`; any new database surface used inside a turn needs a
  harness stub or store tests unhandled-reject.
- New DB writes that can fire OUTSIDE the turn (background/deferred) must use
  the direct handle (see invariant comment atop `writeBatch` in database.ts);
  new AI services must be registered in `DEFAULT_SERVICE_PRESET_ASSIGNMENTS`.

## Verify

`npm ci` → `npx svelte-kit sync` → `npx vitest run` (831, two projects) →
`npm run check` (0) → `npx eslint .` (0 errors). App: `npm run tauri dev` from
the main checkout (:1420).
