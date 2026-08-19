# research/54 — Hardening review findings (RPG/BE/harem/persistence)

Written 2026-08-19. Produced by a 3-lens adversarial review (Opus agents) over the
data-persistence and BE/RPG logic shipped across the recent sessions. **Documented only —
no fixes applied this pass (Ben's call).** Fix in a dedicated follow-up, ranked below.

Lenses: (A) crash-recovery / multi-write partial-failure · (B) BE reducer/lactation/spell
correctness · (C) pack-template persistence + spell-entry handling. Line numbers are as of
commit `7393061d`.

## Fix pass status — 2026-08-19 (continuation session)

Worked the ranked order. **Shipped:** CR-2 (prior session) · **H-1** · **M-1** · **M-2** ·
**M-3** · **M-4** · **M-6** · **L-1**. Each landed with tests; full suite green (694),
svelte-check 0, eslint clean. M-3/M-4 and M-1/M-2 got adversarial review passes.

**M-5 (replay-idempotency guards) — implemented then REVERTED.** Two-reviewer adversarial
pass found: (1) there is **no code path** that re-invokes `applyClassificationResult` for an
existing `entryId` — single call site (`ActionInput.svelte:662`), fresh `crypto.randomUUID()`
per turn — so the guards were **dead code**; and (2) `applyClassificationResult` unconditionally
**overwrites** `worldStateDelta` every run (~`story.svelte.ts:2890`), so on any *future* replay
the guards would produce a *degraded* delta (missing before-states + empty beLog/checkLog →
un-undoable mutations, plus the marker gets snapshotted into the new before-state → rollback
restores it → genuine re-narration stays permanently blocked). Bolting M-5 on independently is
worse-than-nothing. **Replay-safety is folded into CR-1** (below), the only place it's solvable
correctly (mutation writes + delta write made atomic together, with a "delta already exists for
this entryId ⇒ replay ⇒ skip/merge" guard at the top of `applyClassificationResult`).

**New CR-1 sub-items surfaced by the M-3/M-4/M-5 reviews (do inside the CR-1 transaction work):**
- **Delta-overwrite-on-resume** — `applyClassificationResult` must not blindly overwrite an
  existing `worldStateDelta`; detect the replay and skip/merge. (This is what made M-5 unsafe.)
- **BE↔RPG milestone atomicity (pre-existing, reviewer "Finding 2", LOW)** — a character's BE
  body write can land (crossing committed to `crossings`) while the protagonist RPG-sheet write
  then fails; `awardedMilestones` isn't persisted but the mass IS, so it never re-crosses and the
  level is lost. Independent of M-4; needs the turn wrapped atomically. M-5's essence/body guards
  belong here too (guard spend/regen/growth but keep the idempotent level-grant un-gated).

Remaining LOWs (L-2..L-10) intentionally not fixed — see the LOW section / recommended order:
L-2 is not a real one-liner (new conditions bypass decay the turn added, so `ttl:0`=0-turns needs
insertion-time filtering, near-zero value); L-3/L-4/L-5/L-7/L-8 acknowledged-by-design; L-6 folds
into CR-1; L-9 moot (CR-2 became a versioned one-time sync); L-10 latent.

## CRITICAL

### CR-1 — No transaction across a turn's ~12 writes; delta written last, non-fatally → un-rollbackable half-applied state  *(pre-existing; the long-flagged W5-D1)*
`story.svelte.ts:2158–2792` apply every entity write (characters, locations, items, beats,
time, BE body, milk, RPG sheet) as separate committed `await database.*` calls with NO
transaction; the `worldStateDelta` (the rollback record) is persisted LAST at
`2827–2849` inside a try/catch marked "Non-fatal — don't break the main flow" (`2869–2872`).
- Failure: turn advances time + spends essence + grows a girl (all committed), then the
  delta write throws or the app crashes anywhere between 2158–2849 → entry has NO delta →
  `rollbackService.rollbackFromPosition` skips delta-less entries (`rollbackService.ts:72–78`)
  → those mutations are permanently un-undoable, and a mid-sequence crash leaves them
  half-applied (essence spent, growth not written). No error surfaces in the non-fatal branch.
- **Fix (big, deferred):** wrap the whole turn application in a DB transaction (all-or-nothing),
  or write the delta FIRST/atomically with the mutations. Central to the 5223-line store —
  build a real store test harness first (this is the W5-D1 harness that's been flagged).

### CR-2 — `refreshServiceTemplatesAllPacks` silently reverts user-customized service templates every startup  *(self-inflicted, commit 264aa8fc)* — ✅ FIXED
**FIXED 2026-08-19:** replaced the every-startup refresh with a **version-gated one-time sync**
(`syncServiceTemplatesIfStale` + `SERVICE_TEMPLATE_SYNC_VERSION` + a `service_template_sync_version`
settings key). Service templates now sync from code to all packs only ONCE per version bump, not
every startup, so a user's own edit survives normal restarts; overwrite happens only on a deliberate
bump (like an app update resetting a built-in). The same commit fixed **CR-2b** (the sync now SEEDS a
service template missing from a pack, not just updates existing) and **L-9** (code-baseline hashes
computed once, outside the pack loop). The version stamp is written only after a successful sync (a
throw retries next startup); a corrupt/NaN key fails safe (re-syncs once). *Original finding below.*

`pack-service.ts:298–328` (called from `initialize()` :79) overwrites a pack's service-template
row whenever `cur.contentHash !== hashContent(code)` — which is EXACTLY the "user customized
it" condition. The Prompts UI exposes all 27 `category:'service'` templates as editable in
custom packs (`templateGroups.ts:22–70`, saved via `TemplateEditor.svelte:305–309` with no
category guard, badged "modified" in `PromptPackList.svelte:40`). A user edits e.g. the
classifier in a custom pack → sees it saved+badged → silently reverted on next launch, forever.
The documented escape hatch ("customize via a custom pack") does NOT hold for service templates.
- **Fix (top priority):** replace the every-startup clobber with a **versioned one-time sync** —
  a `SERVICE_TEMPLATE_SYNC_VERSION` constant + a `settings` key; run the refresh once when the
  stored version < code version, then bump. Or track a per-row baseline/source hash and skip
  rows whose content diverges from their recorded baseline (distinguishes "stale old baseline"
  from "user edited"). Fold in CR-2b below.
- **CR-2b (MED, same method):** the refresh only UPDATES existing rows (`if (cur)` / `if (curUser)`),
  never SEEDS a service template missing from a custom pack — so a NEW service template added in
  code never reaches existing custom packs, defeating the method's own goal.

## HIGH

### H-1 — Rollback swallows per-entity failures; caller deletes the entries regardless → permanent stuck state, delta destroyed
`rollbackService.ts:156–257` wrap each `deleteCharacter/updateCharacter/...` in try/catch that
only `console.warn`s; `summary` counts successes only. `deleteEntry` (`story.svelte.ts:910–920`)
runs rollback then UNCONDITIONALLY calls `deleteEntriesFromPosition(..., {skipRollback:true})`
with no check that rollback fully succeeded.
- Failure: rollback restores girl A but `updateCharacter` for girl B throws → B stays in her
  post-turn (grown) state, yet the entries + deltas are deleted at 920 → B stuck forever, no
  delta left to retry, zero signal.
- **Fix:** have `rollbackFromPosition` return a per-entity failure list; `deleteEntry` aborts (or
  surfaces an error and preserves the entry/delta) if any rollback step failed.

## MEDIUM

- **M-1 (B) — Cast dedupe over-drops independent classifier growth.** `effects.ts:128–131`
  (`dedupeForCast`) + `story.svelte.ts:3091–3095`: on a cast turn with a growth effect, EVERY
  classifier growth-family event (`catalyst`/`contact`/`attempt`) for the target is dropped
  unconditionally, even a genuinely independent second growth cause (in-prose potion → `contact`).
  The spell catalyst can then roll `fail` → net growth 0 despite two real causes. Same over-drop
  for `milking` (two drains are additive but the classifier one is discarded).
  **Fix:** dedupe by source/one-per-source, not "drop the whole growth family."
- **M-2 (B) — `slow_burn` bypasses the one-growth-per-turn cadence cap.** `reducer.ts:426–432`:
  slow_burn growth accumulates into `pendingGrowth.delta` and never calls `landGrowth`, so
  `cooldown` is never armed and there's no per-turn bound. 3 catalyst events (1+1+2) → next turn
  lands +4 (+1 milestone) = +5 tier in one turn vs the +1 cap a normal girl gets. No per-turn
  tier-delta cap analogous to the bond/dependence velocity caps.
  **Fix:** cap accumulated `pendingGrowth.delta` landed per turn, or gate accumulation by cooldown.
- **M-3 (A) — `currentVisualDescriptors` written but never rollback-captured/restored.**
  `story.svelte.ts:2231–2236` sets it; `CharacterBeforeState` (`types/index.ts:1019–1028`)
  snapshots `visualDescriptors` but NOT `currentVisualDescriptors`; `restoreUpdatedEntities`
  (`rollbackService.ts:202–215`) never writes it back → deleting the turn leaves it mutated.
- **M-4 (A) — Milestone crossing recorded before the body write it depends on.**
  `story.svelte.ts:3291–3299` pushes `crossings` before the body `wrapUpdate` (`3315–3331`,
  swallows failures). A swallowed body-write failure still grants the protagonist a level
  (`awardedMilestones` → permanent) for mass that never persisted.
- **M-5 (A) — Same-`entryId` re-apply double-applies essence spend + body growth.**
  Only milk is idempotency-guarded (`lastYieldEntryId`, `3422–3431`). Essence spend (`3556–3564`)
  and `reduceCharacterBody` (`3244`) have no guard; a resume/replay of the same narration entry
  drains essence + grows twice. Milk correctly refuses (proves replay is considered in-scope).
- **M-6 (C) — Learned spells leak into lorebook exports.** `LorebookExportModal.svelte:20–23`
  passes `story.lorebookEntries` (incl. `type:'spell'`) unfiltered to `exportLorebook`;
  `export/formats.ts:9–11`/`13–30` dump/iterate every entry. `exportToText` (`:51`) DOES drop
  spells via a `typeOrder` omitting `'spell'` — so the intent exists but is inconsistent.
  Re-importing an exported Aventura file recreates a `type:'spell'` entry with no `knownSpells`
  link → orphan. (Full-story backup export is a defensible exception — complete snapshot.)
  **Fix:** filter `type:'spell'` in the lorebook export path (not the full-backup path).

## LOW

- **L-1 (B)** — spell `condition` effect with no ttl becomes permanent (`effects.ts:188–193`;
  `check_debuff` defaults `ttl ?? 2`, generic `condition` doesn't) → can crowd `MAX_BE_CONDITIONS`(6)
  and evict real derived conditions. Fix: default a ttl for spell-applied conditions.
- **L-2 (B)** — `ttl:0` and `ttl:1` behave identically (`reducer.ts:87–90` drops on `ttl<=1`);
  `ttl:0` grants one turn of visibility, off by one vs the "ttl = N turns" contract.
- **L-3 (B)** — milk idempotency key is per-(girl,quality) stack; not robust if a same-`entryId`
  re-apply grades a DIFFERENT band→quality (re-bottles on a different stack). Contingent on the
  determinism invariant being violated; fragile rather than defense-in-depth.
- **L-4 (B)** — body-write-first ordering can LOSE a yield on swallowed partial failure
  (`story.svelte.ts:3314–3337`) — chosen side of a lose-vs-duplicate tradeoff, acknowledged in comments.
- **L-5 (A)** — `learnSpell` compensating delete can itself fail (`story.svelte.ts:1873`) → in-memory
  orphan spell entry until reload. Acknowledged by design (direct action, no delta).
- **L-6 (A)** — new-current-location blanket clear (`story.svelte.ts:2691–2694`) writes
  `current:false` to every location with no per-row before-state; correctness survives via the
  `currentLocationId` restore step but a mid-loop crash compounds CR-1; unbounded write burst.
- **L-7 (C)** — import remaps `type:'spell'`→`'concept'` (`lorebookVault.svelte.ts:237,326,424`)
  rather than rejecting; a crafted import silently becomes vault concept lore. Defensible per O2.
- **L-8 (C)** — leaked COW override row on `learnSpell` rollback (`story.svelte.ts:1857–1880`):
  the compensating delete removes the entry but not a freshly-created COW character override.
  Semantically equivalent to parent (not corrupting), just an orphan override row.
- **L-9 (C)** — perf: `hashContent(code)` recomputed inside the per-pack loop (27 × packCount
  SHA-256 every startup); default-pack service templates processed twice. Hoist code hashes out
  of the loop. (Moot if CR-2 becomes a versioned one-time sync.)
- **L-10 (C)** — `initialize()` has no in-flight re-entrancy guard (`initialized` set only at :81);
  concurrent calls both run the full seed+refresh. Idempotent last-writer-wins; latent.

## Cleared as correct (checked, no defect)

Rollback newest-first ordering vs cross-entry references; COW double-tracking consistency;
`captureCharacterBeforeState` earliest-snapshot dedup; `applyRpgTurn` spend→grant→regen order;
**no double-growth from casts** (spell growth is always `catalyst`, all classifier growth kinds
are in the dropped family); double-induction no-op guard; **velocity caps are sum-then-cap**
(bond/exposure can't be bypassed by multiple events); milk priced at `tierAtDrain` (later growth
can't inflate yield); **immutability holds** (state/events never mutated); pity-fire vs chronic-fire
can't double-land; engorge/overfill thresholds consistently `>=` (no reducer/sprite disagreement);
step ordering sound (fill reads prior-turn supply; surge→adapt→chronic coherent).

## Recommended fix order (for the follow-up session)

1. **CR-2 + CR-2b** (self-inflicted, live) — versioned one-time sync; fixes the clobber, the
   missing-seed, and L-9 perf together. Smallest, highest-urgency.
2. **H-1** — rollback failure surfacing + abort-delete-on-partial-failure.
3. **M-1, M-2** — cast over-drop + slow_burn cadence (gameplay correctness, cheap, seeded/testable).
4. **M-3, M-4, M-5, M-6** — rollback completeness + replay guards + export filter.
5. **CR-1** (the transaction refactor) — LAST and on its own: build the store test harness first,
   then wrap turn application atomically. Highest risk; do not rush.
6. **Lows** — batch as convenient (L-1/L-2 ttl semantics are trivial one-liners).
