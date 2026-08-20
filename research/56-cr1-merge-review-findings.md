# CR-1 Merge Review — Findings Ledger (2026-08-20)

Merge `99cd8f79` landed the CR-1 hardening line (`951ec2bc`: atomic turn writes via
Rust-backed write batch, plus H-1..M-6/L-1 from research/54 and the store harness)
into the image-gen/RPG line (`44534208`: booru prompt writer, starting grant,
sampling knobs). Each parent was adversarially reviewed on its own branch; this
review covered the MERGED result — three parallel Opus lenses (crash-recovery/
atomicity, concurrency/batch-contamination, edge-case client behavior) attacking
specifically the interactions neither parent's review could see.

Key context for severity calibration: the write batch is open only for the
duration of `runWrites` inside `applyClassificationResult` — pure write
application with **zero I/O or LLM calls inside** — so the contamination window
is milliseconds per turn. Findings whose trigger is "another writer lands while
the batch is open" are real but narrow; findings on the batch lifecycle itself
are not window-limited.

## FIXED in the post-merge fix pass (see commit following the merge)

- **C-1 (CRITICAL): batch stealing → torn turn reports success.** Stop pressed
  mid-batch flips `isGenerating` early; a second turn's `beginWriteBatch()`
  threw inside the first turn's try, whose catch aborted the OTHER turn's batch;
  the first turn then "committed" a null buffer and returned true. Fixed:
  `beginWriteBatch` moved outside the try; `commitWriteBatch` throws on no open
  batch; abort is a safe no-op when nothing is open. (The stop path's
  retry-flood into a live batch is narrowed to the ms window and now fails loud,
  not silent — the full stop-ordering rework is deferred, D-1 below.)
- **C-2 (CRITICAL): `withTransaction` poison pill.** Its `BEGIN`/`COMMIT`/
  `ROLLBACK` went through the buffering proxy; called mid-batch (e.g.
  RuntimeVariableManager deletes during a turn) the buffered `BEGIN` failed
  inside the Rust transaction and rolled back the whole turn. Fixed: transaction
  control statements now use the raw handle.
- **H-1 (HIGH, found by all three lenses): identity-hygiene write violated the
  `executeDirect` invariant.** The deferred (LLM-latency) fire-and-forget
  hygiene persist went through the buffered `updateCharacter` and could be
  swept into a LATER turn's transaction — silently discarded on that turn's
  abort (hygiene fires once per character, so the loss is permanent), or
  committed inside a transaction whose delta doesn't record it. Fixed:
  `database.updateCharacterDirect` + a store helper that updates memory
  immutably and writes direct; `.catch` on the void call; the service-preset
  lookup in `identityExtraction` moved inside the guarded region (it could
  reject the whole promise unhandled); harness `makeSettings` extended so
  future character-creating tests don't unhandled-reject.
- **H-4 (HIGH): `saveBackground` buffered + un-revertable in-place mutation.**
  Background-image saves joined the turn batch, and
  `this.currentStory.currentBgImage = ...` mutated the snapshotted object so
  rollback couldn't revert it. Fixed: direct write + immutable reassignment.
- **H-3 (HIGH, partial): `refreshWorldState` mid-batch clobber.** The
  world-state translation service ends with a `refreshWorldState()` that can
  fire minutes later; its SELECTs bypass the buffer and reassigned store arrays
  from pre-batch DB state while a turn was mid-flight, corrupting the turn's
  view and its delta. Fixed: `refreshWorldState` no-ops (logged) while a batch
  is open. The buffered translation entity-writes themselves remain proxy-routed
  (best-effort class, D-3).
- **M-3: `close()` left the batch open** across a reopened handle (backup
  during a turn). Fixed: close aborts an open batch with a warning.
- **H-7 (HIGH on Linux only): Rust pool path mismatch.** `turn_tx.rs` resolved
  the DB under `app_data_dir` while tauri-plugin-sql uses `app_config_dir`;
  identical dirs on macOS/Windows, different on Linux → every tracked turn
  would fail there. Fixed: pool resolves via `app_config_dir`.
- Comment corrections: the false "wrapUpdate swallows" comment in the BE/RPG
  section (wrong in transactional mode) and ActionInput's overclaiming
  `worldStateApplied` comment (real image gen runs in ImagePhase against the
  pre-turn snapshot regardless; the gate only guards manual-image context +
  translation).

## Fix-diff refutation pass (round 2) — the discipline paid for itself again

An adversarial review of the ROUND-1 fix diff found real defects; a corrective
round 2 landed same session:

- **Round-1's close()-aborts-batch fix was WRONG and reverted.** The batch is a
  plain JS buffer flushed via the separate Rust pool — it is NOT tied to the
  plugin connection, so it legitimately survives `close()`; aborting it there
  would have made the rest of the turn execute unbuffered and then reported a
  clean rollback over half-persisted data. `close()` no longer touches the batch.
- **FIX-7 was incomplete:** `backupService.ts` still resolved the DB under
  `appDataDir` (export, restore, safety copy, WAL cleanup) — on Linux a restore
  would report success while writing to a file the app never reads. Now
  `appConfigDir` everywhere.
- **`persistIdentityHygiene` had dropped `updateCharacter`'s guards** — it could
  phantom-write after a mid-extraction story switch and overwrite a parent
  branch's row after a branch switch. Now throws on not-found and skips when the
  COW condition holds (hygiene is best-effort; skipping beats a wrong-row write).
- **The `refreshWorldState` skip made translations silently invisible** (the
  refresh is the only path surfacing them into memory). Replaced with
  `database.waitForBatchClose()` — commit (post-flush, in a finally) and abort
  both drain waiters; the refresh defers to post-turn truth instead of dropping.
- **The background-image reassignment was the wrong half of FIX-4** — with
  `saveBackground` direct-committed, the in-memory value must SURVIVE a turn
  revert (and whole-object reassignment woke four world-panel `$effect`s, 8
  queries per background). Restored the deliberate in-place mutation, commented.
- Friendlier double-begin error ("Previous turn is still saving…"), six new
  batch tests (direct-write bypass, withTransaction control statements,
  close-preserves-buffer, waiter semantics), harness `isBatchOpen`/`waitForBatchClose`
  stubs. Final suite 831.

Still-open notes from the refutation pass, folded into the backlog below:
translation persist callbacks remain proxy-routed (D-3); withTransaction bodies
mid-batch (D-2b); first-run of `apply_checksum_patch` on existing Linux installs
is a new behavior (benign, worth knowing); raw `rowsAffected` fabrication
unchanged (D-9).

## D-backlog session 2 (2026-08-20, same day): D-3/D-4/D-5/D-12/D-13 SHIPPED

Two Opus implementation agents + a refutation review of their combined diff + a
round-3 correction pass. Landed:

- **D-3**: `database.whenBatchIdle()` + guards on every reachable background
  write site (suggested-actions persist, the four translation callbacks, the
  chapter + four lore callbacks in ActionInput, retry-state and style-review
  chains in ui.svelte.ts). Coordinators do no direct DB access (audited) — the
  ActionInput callback boundary covers every caller.
- **D-4**: the tracking-off path now runs through the same `runTurnTransaction`
  (snapshot → begin → runWrites → commit; abort+revert+toast on failure) minus
  the delta. Tracking-off turns are all-or-nothing (approved Decision-B
  semantics extended). wrapUpdate's 3-strike swallow is dead code retained as a
  guard (caller audit: all 12 sites are inside the turn).
- **D-5**: sprite generation defers via whenBatchIdle at band AND per-cell
  level; `deleteStaleSprites` now routes DIRECT (round 3) so the delete can
  never be buffer-reordered against the raw inserts — the structural fix, not
  just the timing guard. Also closes the M-1 FK case.
- **D-12**: harness grew 5→10 tests — beMode transactional rollback + passing
  control, delta-write throw, tracking-off atomicity, and beMode+tracking-OFF
  engine rollback (the literal D-4 scenario). Plus a latent harness bug fixed
  (failOn leaked across tests).
- **D-13**: identity hygiene skips only when NOTHING consumes it
  (imageGenerationMode 'none' — defaulting unset to 'agentic' like the
  pipeline — AND beMode off, since sprites/portraits consume hygiene output
  regardless of mode); null-safe currentStory read; the concurrency cap is a
  GLOBAL 2-worker pool shared across turns.
- **Refutation round-3 fixes**: the HIGH mid-flush window — `commitWriteBatch`
  clears `writeBatch` before the Rust invoke, so `isBatchOpen()` lied during
  the actual transaction; a `flushing` flag now keeps `isBatchOpen()` true (and
  `waitForBatchClose` parking) until the flush settles, with a gated-invoke
  regression test. Suite 842.

Residuals noted by the refutation pass (accepted, documented):
- **check-then-act gap** on every whenBatchIdle guard: a batch can open between
  the guard resolving and the write executing (begin is synchronous at turn
  start only, window is microtasks-to-one-await). Multi-step sites are worst
  (lore merge = delete-then-add). The immune shape is executeDirect routing or
  D-2's UI gating — revisit if seen in practice.
- Retry-state persistence now lands after batch close → a crash in that window
  leaves stale persisted retry state (was: dropped-on-abort; strictly better).
  Both ui chains are serial: a stuck head-of-line blocks later writes.
- Tracking-off turns can now surface the "Previous turn is still saving" error
  (loud, recoverable — previously could not throw there at all).
- The rollback snapshot still omits `lorebookEntries`/`chapters` (residual
  in-memory phantom if a buffered lore write slips the guard gap).
- Manual-image button dead path (pre-existing): `lastImageGenContext` only
  assigned when mode ≠ 'none' but the button requires mode == 'none'.

## D-backlog session 3 (2026-08-20, same day): D-1/D-6/D-7/D-11 SHIPPED

- **D-1** (conservative scope — instant-stop UX preserved): the retryService
  cleanup (Stop AND retry-last-message paths) and new turn starts in
  handleSubmit await `whenBatchIdle()`, so post-Stop writes can't race or join
  a dying turn's batch and the double-begin error is unreachable.
- **D-7**: `applyClassificationResult` returns a discriminated outcome
  (`rolled_back`/`replay`/`no_story`); genuine rollback → actionable toast
  (narration kept, use Retry); the whole post-turn tail (entry time end, TTS,
  chapter/lore/style background tasks) is skipped when the world didn't
  advance. pendingCheckRecord discard stays unconditional (a kept record would
  flash into the next turn's streaming panel).
- **D-6**: turn-tx pool runs `synchronous=FULL` — the flush is the atomicity
  anchor; one fsync per turn. Background writes keep WAL+NORMAL.
- **D-11**: unparseable stored rpgSheet is PRESERVED, never reset/re-granted:
  `hasStoredRpgSheet`/`isStoredRpgSheetInvalid` guards on the three writers
  (applyRpgTurn skips the RPG turn with a warn; learnSpell throws before
  creating the entry; SheetPanel toasts). Readers still render defaults.
  Bonus fix: SpellbookSection's research() had no catch — every learnSpell
  rejection was an invisible unhandled rejection; now toasted.

Suite 847. Remaining open: **D-2/D-2b (world-panel + story/branch-switch gating
during turns — UX call, Ben decides), D-8 (two-pool contention, revisit if seen),
D-9 (fabricated rowsAffected for buffered maintenance calls — deleteStaleSprites
now direct, rest are cleanup paths), D-10 (bind divergence trap, documented).**

## DEFERRED — documented backlog, roughly ranked

- **D-1 (MED): stop-generation ordering.** `handleStopGeneration` sets
  `isGenerating=false` before the pipeline loop exits, re-enabling submit and
  letting `retryService` cleanup writes race a still-open batch (now they fail
  loud instead of corrupting silently, but the UX on that collision is an
  errored turn). Proper fix: don't flip the flag until the loop drains, or hand
  the stop to the pipeline as a cooperative cancel that closes the batch first.
- **D-2 (MED): world panels are not gated during a turn.** CharacterPanel /
  SheetPanel / BeStatePanel / InventoryPanel / LocationPanel edits during the
  ms batch window are buffered into the turn's transaction (dropped on its
  abort, before-state-less on its commit); an edit racing `applyRpgTurn`'s
  whole-`metadata` write is last-write-wins either direction. Same class:
  story/branch switching mid-turn (`loadStory`/`switchBranch` are ungated and
  would corrupt the turn's in-memory view — narration entry writes are ungated
  too). Fix direction: disable world-panel writes + story/branch switch while
  `ui.isGenerating`, or route panel saves through a queue that waits for batch
  close.
- **D-2b (LOW-MED): `withTransaction` mid-batch is defanged, not isolated.**
  After the C-2 fix its BEGIN/COMMIT run direct (no longer poisoning the turn),
  but a call made while a turn batch is open runs an EMPTY real transaction
  while its body statements still buffer into the turn batch — the
  runtime-variable delete path is still not properly isolated mid-turn. Falls
  out naturally if D-2's UI gating lands.
- **D-3 (MED): background writers still proxy-routed.** Chapter creation, lore
  management, style review, retry-state saves, suggested-actions persist,
  translation entity-writes — all fire-and-forget, all buffered if they land
  in the ms window (dropped on that turn's abort; store-side lorebook additions
  aren't in the rollback snapshot → in-memory phantom until reload). Fix
  direction: either direct-route them (like portraits/sprites/backgrounds now)
  or serialize them behind a batch-close await.
- **D-4 (MED): beMode with stateTracking OFF runs the whole engine (essence,
  growth, milk, grant) through the legacy non-atomic path with wrapUpdate
  swallowing failures, no delta, no replay guard — and returns `true` even
  after swallowed failures. Fix direction: gate beMode on stateTracking (they
  are effectively coupled already) or wrap the legacy path.
- **D-5 (MED): sprite `$effect` mid-batch reorder.** VnView/girlSprite effects
  keyed on `story.characters` can flush during `runWrites`; a buffered
  `deleteStaleSprites` (proxy) executing at commit AFTER a raw `upsertSprite`
  can delete the fresh rows (stale hash filter), leaving an in-flight cell
  never regenerating until reload. Also M-1: a raw sprite write keyed on a
  turn-created character hits an FK failure (parent row still in the buffer).
  Fix direction: sprite service should defer while a batch is open.
- **D-6 (LOW-MED): durability posture.** WAL + synchronous=NORMAL means a
  committed turn can be lost to an OS crash while the earlier narration row
  survives (same orphan shape as D-7). Consider synchronous=FULL on the turn
  pool; note the NORMAL pragma only lands on one plugin-pool connection anyway.
- **D-7 (MED): narration orphan on rollback.** The narration entry is written
  before classification, outside the batch. A rolled-back turn keeps prose
  describing growth/checks that never landed, with no delta (rollbackService
  skips it forever) and the roll card discarded; one toast is the only signal,
  and the post-turn tail (updateEntryTimeEnd, TTS, background tasks
  summarizing the unbacked narrative) runs regardless. Fix direction: on
  rollback, offer retry explicitly (the retry backup is intact) and skip the
  tail.
- **D-8 (LOW): two-pool lock contention** — a multi-MB plugin-pool write (or
  VACUUM INTO backup) can starve `exec_batch_tx` past the 5s busy timeout →
  turn rolls back (loud, recoverable). Inverse direction likewise. Revisit if
  seen in practice.
- **D-9 (LOW): buffered writes return fabricated `rowsAffected: 0`** —
  maintenance/cleanup callers mid-batch log wrong counts; `rawQuery` from the
  debug console mid-batch executes minutes later inside someone else's
  transaction.
- **D-10 (LOW, latent): numeric/bool bind divergence** between turn_tx (i64 /
  bool-as-int) and the plugin (f64 / bool-as-JSON-text). No current caller
  passes raw booleans (all use `? 1 : 0`); a trap for future contributors.
- **D-11 (LOW): schema-invalid stored sheet silently resets** (readRpgSheet →
  null → defaultRpgSheet persists, discarding level/spells/milestones and
  re-granting). Pre-existing, amplified by the grant. Consider preserving the
  raw blob on parse failure.
- **D-12 (LOW): harness/test gaps** — no transactional test exercises beMode/
  RPG under the batch (makeStory settings: {}); the delta-write-throw case
  (failOn('updateStoryEntry')) lost coverage in the CR-1 rewrite; the
  batch-contamination test only covers already-fixed writers. Good next
  additions to story.harness.svelte.test.ts.
- **D-13 (LOW): identity hygiene fan-out** — one un-throttled LLM extraction
  per new character even when the story's imageGenerationMode is 'none'; a
  crowd scene fires N concurrent calls. Consider gating on image settings +
  small concurrency cap.

## Cleared as correct by the review (selection)

applyRpgTurn/applyBeEvents genuinely inside the batch, delta written last;
six-array snapshot is a complete revert of the TURN's own mutations (every
mutation reassigns; zero DB reads inside runWrites — verified independently by
two lenses); rollback returns false before emit/hygiene; starting grant is
idempotent and rollback-safe (marker persisted by every sheet writer, re-derives
after revert); replay guard has no legitimate re-apply path today (all retry
flows mint fresh entry ids); turn_tx.rs is injection-safe (all binds), ordered,
error-propagating, lazily-init-race-free; FK parity holds across both pools;
inline/portrait/sprite/embedded-image writes correctly bypass the buffer;
booruPromptWriter is read-only; translation gating correct in both directions;
learnSpell/sheetOrDefault swap safe.
