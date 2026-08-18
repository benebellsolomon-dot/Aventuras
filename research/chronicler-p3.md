# Phase 3 / Module 12 — The Chronicler (GM-aware living-lorebook): design recommendation

*Research + build doc. Not production code. Elevates the Lorebook Growth Reviewer
(`reference/Lorebook_Growth_Reviewer.naiscript`, research/11) into a GM-aware subsystem of
Ambrosia. Confirms the BUILD_PLAN-locked design (Module 12, lines 220–239) and makes it concrete
enough to build #P3 with node tests, the way harem-dynamics-17.md enabled #17. Every claim is
cited `file:line`.*

Scope of #P3 (from BUILD_PLAN Module 12 + Phase 3, lines 220–239 / 576–579 / 607–611):

1. **Source canon from Ambrosia's structured state-diff** (resolved Oracle threads/eventlog, entity
   growth milestones, discovered locations, quest state) — *not* blind text-scraping. **This is THE
   elevation** vs the Reviewer.
2. **Write + compact `Ambrosia: Canon`** as sole writer; **skip `Ambrosia: Bodies`** (body-engine
   single-state, no accumulation) and **skip `Ambrosia: Scene`** (world-state, already auto-written).
3. **Reuse the Reviewer's proven mechanics**: word-interval trigger, two-pass JSON salvage, anti-dup,
   compaction, accept/decline modal (per-fact toggles, auto-accept, per-entry Default/Skip/Force,
   round-robin cursor), honoring the `----`/name/`Type:` header format.
4. **SE-owned entries**: MAY be written directly on **explicit accept** (SEGA-overwrite-warned),
   tracked in `be:se_augments` (already snapshot-covered) for **re-apply after a regen**; proposal by
   default.
5. **`lorebookEdit` permission**; respect the **single-writer law** (the Chronicler NEVER touches
   `bodyState`/growth — it reads the diff and writes lore) and **R3** (word-baseline resets on undo).

---

## 0. The load-bearing realization #P3 must get right first

The Reviewer asks the LLM *"what new facts does this story text establish?"* **because it has no
structured state** — blind text is its only input. Ambrosia **already knows the facts**: a tier
crossing `D→G` (`be:growth_history:<id>`, src 3604–3624), a resolved thread / fired world event
(`be:oracle_eventlog`, src 2852–2859, whose own comment says *"for the Chronicler + undo"*), a
discovered location, a quest moving to `completed` (entity `storyState`, BUILD_PLAN 191/194). So the
Chronicler's primary candidate channel is **deterministic formatting of the state-diff — zero GLM**.
The Reviewer's GLM-per-entry blind-text review demotes to a *secondary, deferred* pass (BUILD_PLAN
231: *"the GLM text-review is the secondary pass"*), and GLM survives only for **compaction of an
oversized Canon entry**. This single reframing drives the whole design: the budget win, the
reuse-vs-new split, and the v1 scope all fall out of it.

**The second realization — "since last review" is not one uniform diff.** The state-diff sources
split into two kinds with *different change-detection mechanics*, and conflating them is the
hand-wave that makes a Chronicler doc unbuildable:

- **Turn-/timestamp-stamped append-logs** — `oracle_eventlog` (each entry has `turn`, `kind`
  world/body/social, `name`, `desc`, `fluff`, `npc`, `thread`; src 3046). Snapshot-covered.
  **Diff = entries newer than a watermark.** Trivial.
- **Log-less current state** — entity tier, quest `storyState`, discovered locations, entity
  existence/identity. The #15 ActionRule executor writes `storyState` **directly**, with no
  change-log (BUILD_PLAN 191, 194), and the player-facing canon truth of a body is its *current* tier
  (the Bodies entry is single-state for the same reason). You **cannot watermark-diff** these.
  **Diff = a fingerprint compare** — a tiny snapshot of
  `{entityId→lastCanonizedTier, questId→state, knownLocationIds[]}` compared against the live world
  each review; whatever differs is a candidate.

The recommended state-diff is therefore a **hybrid: watermark for the append-logs, fingerprint for
the log-less state**, both living in one snapshot-covered key (§3).

**One growth channel, not two (the fork to resolve up front).** `growth_history` (src 3604–3624) is
*also* turn-stamped and *looks* like a watermark source — but it is an **undo/audit structure, not a
canon source**, and sourcing growth from *both* the `growth_history` watermark *and* the tier
fingerprint would double-write one growth as two differently-worded Canon lines that `isRepeatedAddition`
(fuzzy Jaccard) may fail to merge. **Recommendation: canon records NET milestones** — a growth fact is
sourced **only** from the tier fingerprint (`member.tier_index > fingerprint.tiers[id]` →
`"<name> reached <letter>-cup"`), and `growth_history` is **dropped from the state-diff entirely**.
This canonizes *where she is now* (D→G in one line), not every intermediate D→E→F→G crossing, which
matches the Bodies-entry "current state" posture and avoids a chatty per-step Canon. (Alternative, if
per-crossing beats are wanted instead: source growth from the `growth_history` watermark and drop
`tiers` from the fingerprint — but never both. This flips §8 assertion 2 to the chosen channel.)

---

## 1. What the Reviewer actually does (the proven mechanics, cited)

Verified against the real `reference/Lorebook_Growth_Reviewer.naiscript` (1220 lines; the research/11
note's line numbers were from an older cut but map closely — re-cited here against the live file).

| Mechanic | Reviewer location | What it does |
|---|---|---|
| **Word-interval trigger** | `onGenerationEnd` skips `inlineGeneration` → `runLorebookReview` (1198–1204); `getStoryWordCount` sums `api.v1.document.scan()` sections (303–320); `wordsSinceLastCheck = currentWordCount − state.lastAutoCheckWordCount` (1034); fires when `≥ intervalWords` (1039) | Reviews only after enough new words accrue. Cheaper than per-turn. |
| **Baseline state** | `ReviewerState { lastKnownWordCount, lastAutoCheckWordCount, reviewCursorEntryId }` in `storyStorage` (33–37, 345–376); `initializeBaselineIfNeeded` seeds at current count on first run (345–368) | The word-baseline + cursor. |
| **Navigate reset** | `onHistoryNavigated` clamps `lastAutoCheckWordCount` down to current count so undo doesn't double-count (1206–1218) | Undo-safety of the baseline. **Does NOT port — see §3.4.** |
| **Two-pass JSON salvage** | `reviewSingleLorebookEntry` loops `[false, true]` strict-retry (589–636): pass 1 normal, pass 2 appends *"Return only valid JSON…"* (600–602); `parseReviewResult` extracts fenced/brace JSON (406–423); on throw, `salvageReviewResult` regex-recovers `"fact"…"addition"` pairs / `no new facts` / `proposed:` from truncated non-JSON (503–557) | Robust JSON roundtrip in the sandbox. **The salvage layer is gold — port verbatim.** |
| **Anti-dup** | `isRepeatedAddition(currentText, addition)` (114–145): normalize (81–87), substring containment, then chunk-similarity ≥ 0.9 Jaccard (`splitIntoComparableChunks` 89–95, `chunkSimilarity` 97–112); applied as `.filter(item => !isRepeatedAddition(...))` (648) | Never re-adds a known fact. **Port verbatim.** |
| **Compaction + format validation** | `compactOversizedLorebookEntry` when `text.length > MAX_LOREBOOK_ENTRY_CHARS` (568–569, 430–501): GLM rewrites shorter; `normalizeCompactedLorebook` (170–189) + `validateCompactedLorebook` (202–224) enforce **line 1 = `----`, line 2 = exact name line, line 3 begins `Type:`** else reject ("") | Bounds entry size; enforces the lorebook header schema. |
| **Accept/decline modal** | `showSuggestionsModal` (773+): per-fact checkbox toggles via a `Set<number>` of selected indices (787), `applySelectedLorebookSuggestion` (694–722); **auto-accept** path (`loadAutoAcceptEnabled` 264–267, applied 1061–1078); per-entry **Default/Skip/Force override** (`cycleEntryOverride` 392–404, `showOverridesModal` 967+); **round-robin cursor** (`rotateEntriesFromCursor` 751–766) + per-run fact budget (`TARGET_FACTS_PER_RUN` 23, `collectLorebookSuggestions` 891–965) | Human-in-the-loop apply surface. |
| **Apply / append semantics** | `applyLorebookSuggestion` (676–692): compaction ⇒ replace; additions ⇒ `` `${currentText}\n\n${additions.join("\n\n")}`.trim() `` (685–687) | Canon *appends*; compaction *replaces*. **This is the append rule the Chronicler adapts.** |
| **Permission gate** | `ensureLorebookEditPermission` requests `lorebookEdit` only at apply-time (664–674) | Gated write. |
| **Re-entry guard** | `let isReviewRunning` (66), checked/cleared in `runLorebookReview` (1021–1028, finally 1088) | One review at a time. |

Constants worth porting as tunable config: `DEFAULT_CHECK_INTERVAL_WORDS = 2000` (16),
`MAX_LOREBOOK_ENTRY_CHARS = 2000` (19), `MAX_REVIEW_OUTPUT_TOKENS = 220` (22),
`TARGET_FACTS_PER_RUN = 15` / `MAX_FACTS_PER_ENTRY = 3` (23–24), `MODEL = "glm-4-6"` (15).

---

## 2. What Ambrosia already provides (the helpers #P3 builds on, cited)

| Ambrosia asset | src:line | Role for the Chronicler |
|---|---|---|
| `oracle_eventlog` (cap 30, snapshot-covered) | `appendOracleEventLog` 2852–2859; entry shapes 3046 (world), 3068 (body), 3086 (social) | **Append-log diff source.** Each entry has `turn` → watermark-diffable. |
| `growth_history:<id>` (cap 30, per-entity, snapshot-covered) | `applyGrowthAndHistory` 3604–3624; `createGrowthEvent` 1763–1777 | **NOT a canon source** — an undo/audit structure. Growth is canonized from the tier *fingerprint* (NET milestones), not this log, to avoid a double-write (§0). May be read read-only for fact *phrasing* (cause/magnitude) but is not the diff trigger. |
| `oracle_threads` | read at 3108; snapshot-covered (2109) | Thread set — resolution detected by fingerprint (thread present last review, absent now). |
| Quest / entity `storyState`, placement, discovery | entities at `be:entity:<id>` (SK 409); world layer #15 writes `storyState` directly | **Fingerprint diff source** (no change-log). |
| `se_mapping` / `se_augments` (both snapshot-covered) | SK 424–425; in `SNAPSHOT_SINGLETONS` 2110 | SE-entry ↔ entity map; **`se_augments` is the re-apply tracker (already a snapshot key — reuse, do not add).** |
| `ensureBodiesCategory` / `ensureSceneCategory` | 3520–3528 / 3563–3571 | **Pattern to clone** for `ensureCanonCategory` (find-or-create, the `category`-not-`categoryId` fix). |
| `writeBodyEntry` / `writeSceneEntry` | 3531–3558 / 3576–3601 | **Pattern, not clone** — both are *single-subject full-text overwrites* (self-healing). Canon *accumulates* (append + compact) — see §4 trap. The `displayName`-lookup + `category` patch idiom ports. |
| `getHaremMembers` / `getProtagonist` / `loadEntity` / `saveEntity` | used throughout (e.g. 3731, 3580, 3914, 3556) | Read entity state for the fingerprint + per-subject keying. |
| `SNAPSHOT_SINGLETONS` / `SNAPSHOT_COLLECTIONS` / `pushSnapshot` / `restoreMutableSnapshot` | 2107–2164 | **The R3 spine.** The new Chronicler key gets enumerated here (§3). |
| `onGenerationEnd` hook (tail, after growth + `writeSceneEntry`) | 3898–3927 | **Where the review fires** (§5). Note: Ambrosia's `onGenerationEnd` currently does **not** check `inlineGeneration` — the Chronicler tail must (Reviewer 1199). |
| `onHistoryNavigated` = `restoreMutableSnapshot` | 3955–3958 | Already atomic-restore. **Subsumes** the Reviewer's manual baseline clamp (§3.4). |
| `safeLog` / `safeError` / `safeToast` / `getAllowedOutput`(budget) / `suppressScriptHooks` | house helpers | Required wrappers on every GLM call + every async hook body (BUILD_PLAN 504–514). |

**Gap:** Ambrosia does **not** currently call `api.v1.document.scan()` or count words anywhere (grep
confirms zero hits). The Chronicler introduces word-counting — port the Reviewer's `countWords`
(68–71) + `getStoryWordCount` (311–320) + `getRecentStoryExcerpt` (322–343, only needed if the
deferred blind-text pass is built).

---

## 3. Storage & R3 (the sharpest design call)

### 3.1 Exactly ONE new snapshot singleton — and that is correct

Unlike #17 (which contorted to add *zero* keys because everything rode the entity record), the
Chronicler's watermark/fingerprint **must be snapshot-covered**, so adding one singleton is the
*right* answer, not a failure:

```
SK.chronicler_state = 'be:chronicler_state'   // ONE new singleton
//   {
//     wordBaseline,        // last-review story word count (Reviewer's lastAutoCheckWordCount)
//     logWatermark: { oracleTurn },   // newest consumed oracle_eventlog turn (the ONE append-log)
//     fingerprint: {       // log-less state snapshot for diff-compare
//        tiers:     { <entityId>: <lastCanonizedTierIndex> },   // the growth channel (NET milestones)
//        quests:    { <questId>: <storyState> },
//        locations: [ <knownLocationId>, ... ]
//     },
//     cursor               // round-robin review cursor (Reviewer reviewCursorEntryId)
//   }
```

**Why snapshot-covered (not `be:settings`):** if the watermark lived in undo-invariant settings,
then on undo the `oracle_eventlog`/`growth_history` would revert (they ARE snapshotted) but the
watermark would stay *ahead* of the reverted logs → the Chronicler would **silently skip
re-proposing** the reverted-then-replayed events. Snapshot-covering it means restore reverts the
watermark in lockstep with the logs — correct by construction.

**Add it to `SNAPSHOT_SINGLETONS` (src 2107) in the same commit.** This satisfies the **harness_18
enumeration-completeness guard** (test/harness_18.js 161–180) *automatically*: that standing
invariant iterates `Object.values(SK)` and fails unless every key is a snapshot singleton, a
collection, or in `EXCLUDED = [SK.settings, SK.db_version]`. A forgotten enumeration fails the test
instead of corrupting undo in the wild. **This is the single most important build-rule line for #P3.**

### 3.2 Reuse `be:se_augments` — do NOT add a key for it

`be:se_augments` already exists (SK 425) and is already in `SNAPSHOT_SINGLETONS` (2110). It is the
re-apply tracker. Shape (proposed, append-only list):

```
be:se_augments = [ { seEntryId, entityId, addition, appliedAt, augmentHash } , ... ]
```

`augmentHash` (a cheap normalized-text hash of `addition`) powers regen-detection: an augment whose
`addition` substring is **absent** from the live SE entry text ⇒ SEGA re-ran and clobbered it ⇒
offer re-apply. No new key.

### 3.3 User preferences → `be:settings` (undo-invariant, correct)

Skip/Force overrides, auto-accept, and the word-interval are **user preferences**, not story state —
they must survive undo. Put them in `be:settings` (SK 427, in `EXCLUDED`), mirroring the Reviewer's
`STORAGE_OVERRIDES_KEY`/`STORAGE_AUTO_ACCEPT_KEY`/`STORAGE_INTERVAL_KEY` (25–28) but folded into
Ambrosia's single settings blob. Also expose via the `config:` front-matter
(`chronicler_interval_words`, `chronicler_auto_accept`, `chronicler_enabled`,
`chronicler_se_direct_write`) so they're toggleable without code, like the Reviewer's
`check_interval_words` (227) and Ambrosia's `lateblock_enabled` (3460).

### 3.4 No persistent candidate queue; the navigate-clamp does NOT port

- **No candidate queue.** The Reviewer computes-candidates-and-shows-the-modal **synchronously**
  inside one `runLorebookReview` call; candidates are never persisted. Do the same. Candidates are
  *recomputable* from the diff next review, so persisting them would be a second key for nothing.
- **The Reviewer's `onHistoryNavigated` baseline clamp (1206–1218) is a "do NOT port verbatim"
  item.** Ambrosia's `onHistoryNavigated` is already `restoreMutableSnapshot` (3955–3958). Because
  `chronicler_state` is snapshot-covered (§3.1), restore reverts `wordBaseline`/`logWatermark`/
  `fingerprint` **automatically and atomically**. Adding a second navigate handler that re-clamps
  the baseline would be *wrong* (double-handling, and it would fight the snapshot restore). The
  BUILD_PLAN line *"reset Chronicler word-baseline on navigate"* (502, 611) is **satisfied by
  snapshot coverage**, not by a separate handler.

### 3.5 The deliberate R3 story for the lorebook side (the "what happens to Canon on undo" answer)

Lorebook entries are **not** in `SK` and **not** snapshotted (this matches BUILD_PLAN 237–239:
*"accepted lorebook edits aren't snapshot-critical so no undo-unsafe messaging is introduced"*, and
the `Ambrosia: Bodies`/`Scene` entries aren't snapshotted either). So on undo:

1. `chronicler_state` (watermark/fingerprint) **reverts** with the snapshot.
2. The `Ambrosia: Canon` entry text **persists** (not snapshotted).
3. Next review re-scans the now-replayed events → re-proposes the same facts → **`isRepeatedAddition`
   sees them already in the Canon entry → idempotent no-op.**

So Canon is **convergent under an identical replay**, not corrupted. **Caveat (accepted):** on a
*divergent* undo (the player undoes a `G`-cup growth, then grows to `E` instead), append-only Canon
keeps the stale "reached G-cup" line — it cannot retract a fact. This is acceptable because Canon is
append-only and not snapshot-critical (BUILD_PLAN 237–239); compaction (§4) eventually prunes a stale
line, and the live Bodies entry always carries the *correct* current size. The same idempotency
covers the `se_augments` caveat: undoing an accept-turn reverts the *tracker* (snapshot-covered) but
not the SE entry *text* (not snapshotted) → harmless, re-apply simply forgets that augment; flagged
as an **accepted caveat** (mirrors #17's "harem_rank not snapshotted" cosmetic caveat,
PHASE2_HANDOFF).

---

## 4. Mechanism — end-to-end flow

```
onGenerationEnd  (TAIL — after applyGrowthAndHistory + writeSceneEntry, src ~3925)
└ if (inlineGeneration) return;                         // Reviewer 1199; Ambrosia's hook lacks this
└ if (!chronicler_enabled || isChronReviewRunning) return;
└ wordCount = getStoryWordCount()                       // document.scan, Reviewer 311–320
   if (wordCount − chronicler_state.wordBaseline < interval) { save wordBaseline-touch; return; }
└ isChronReviewRunning = true; try {
   ① STATE-DIFF (0 GLM) — the elevation
      • append-log:   oracle_eventlog entries with turn > logWatermark.oracleTurn   (world/social)
      • log-less:     diff live world vs chronicler_state.fingerprint
                        - tier:     member.tier_index > fingerprint.tiers[id] → NET growth milestone
                                    (the ONLY growth channel — growth_history is NOT read; see §0)
                        - quest:    storyState changed  → "Quest <name> is now <state>."
                        - location: id in live tree, not in fingerprint.locations → "Discovered: <name>."
      → a flat list of candidate facts, each tagged { subject, kind, text }
   ② DETERMINISTIC FORMAT → canon facts (0 GLM)
      growth:    "<name>'s breasts reached <to_letter>-cup (a <magnitude> change, by <cause>)."
      thread:    "<thread/event name> resolved: <desc>."         (oracle_eventlog world entries)
      social:    "<a> and <b>: <name>."                          (oracle_eventlog social entries)
      quest:     "Quest <name> — <storyState>."
      location:  "<name> discovered."
      → group facts by SUBJECT (character name / location name / "World History")
   ③ DEDUP — anti-dup, CROSS-CATEGORY (BUILD_PLAN 237)
      for each fact, isRepeatedAddition(combinedExistingText, fact.text) where combinedExistingText =
        the matching SE entry + Ambrosia: Bodies entry + Ambrosia: Canon entry for that subject.
      (Else you re-canonize body prose the Bodies entry already carries.)
   ④ COMPACTION — if a target Canon entry exceeds MAX_CANON_ENTRY_CHARS, GLM-compact it
      (Reviewer 430–501, format-validated to ----/name/Type:).  ← the ONLY routine GLM call.
   ⑤ SURFACE
      auto-accept on  → applyCanon directly (per-fact), toast count   (Reviewer 1061–1078)
      auto-accept off → showSuggestionsModal: per-fact toggles, per-subject Default/Skip/Force,
                        round-robin cursor + TARGET_FACTS_PER_RUN budget (Reviewer 773+/891–965)
   ⑥ ON ACCEPT
      Canon fact     → writeCanonEntry(subject, acceptedFacts)  (append; §4.1)
      SE-entry fact  → proposal by default; on EXPLICIT accept + chronicler_se_direct_write,
                        SEGA-overwrite-warn → append into the SE entry → record in be:se_augments (§4.2)
   ⑦ ADVANCE chronicler_state: wordBaseline = wordCount; logWatermark = newest consumed positions;
      fingerprint = live snapshot; cursor = lastProcessedSubject.  (the watermark/fingerprint commit)
} finally { isChronReviewRunning = false; }
```

### 4.1 `writeCanonEntry` — adapts the Reviewer's append, NOT a clone of `writeBodyEntry`

`writeBodyEntry` (3531) / `writeSceneEntry` (3576) are single-subject **full-text overwrites**
(self-healing). Canon **accumulates**, so `writeCanonEntry` = the Reviewer's *append* rule
(`` `${currentText}\n\n${additions.join("\n\n")}`.trim() ``, 685–687) wearing Ambrosia's
find-or-create idiom:

- `ensureCanonCategory()` — clone `ensureBodiesCategory` (3520–3528) for `'Ambrosia: Canon'`; the
  `category` (NOT `categoryId`) field set on every write (the known v0.3.3 fix, 3540/3591).
- **Granularity = per-subject keyed entries** (recommended; §7 Q2): one Canon entry per character
  (`displayName: '[BE] <name> — Canon'`, `keys: [name]`) so it **layers** with the SE + Bodies
  entries at generation; one per discovered location; plus a single **`[BE] World History`** entry
  (`keys` broad) for thread/quest/world resolutions. Each entry conforms to the
  `----`/name/`Type:` header so the Reviewer's own validators would accept it (and so a later
  compaction round-trips). A new entry is seeded with that 3-line header; facts append below.

### 4.2 SE-entry direct-write path (proposal-by-default → explicit-accept → tracked)

Per BUILD_PLAN 233–237 / 576–579 (Ben's pick):

1. A fact about an SE-owned subject (the entity has a non-null `seEntryId` in `se_mapping`) is
   surfaced as a **proposal** by default.
2. On **explicit accept** *and* `chronicler_se_direct_write` enabled: show a one-time
   **SEGA-overwrite warning** ("re-running SE's Forge/SEGA/Refine will clobber this addition"),
   then `lorebook.updateEntry(seEntryId, { text: currentSEtext + "\n\n" + addition })`.
3. Record `{ seEntryId, entityId, addition, appliedAt, augmentHash }` in `be:se_augments`.
4. **Re-apply after regen:** on init / each review, for each tracked augment, if its `addition` is
   substring-absent from the live SE entry text ⇒ SEGA regenerated ⇒ offer **"Re-apply N Chronicler
   augments?"**. (No new key — rides `se_augments`.)

This is the **only** path that writes outside `Ambrosia:` categories, and it is doubly gated
(explicit accept + config). Default off-by-config keeps the system to `Ambrosia: Canon` only.

### 4.3 Category discipline (confirmed)

- **`Ambrosia: Canon` — sole writer = the Chronicler.** No other module writes it.
- **`Ambrosia: Bodies` — SKIPPED.** Owned by `writeBodyEntry` (3531), single-state snapshot prose,
  rewritten each growth — *no accumulation*, so the Chronicler must not touch it (BUILD_PLAN 232).
- **`Ambrosia: Scene` — SKIPPED.** Owned by `writeSceneEntry` (3576), already auto-written
  world-state. The Chronicler reads world state for the diff but does not write Scene.
- **`SE:` entries — read for anti-dup; written ONLY via §4.2.**
- **Single-writer / no-bodyState law:** the Chronicler reads `tier_index`/`growth_history`
  *read-only* for the diff and **never writes `bodyState` or growth** (asserted in tests, §6).

---

## 5. Hook placement & GLM budget

### 5.1 Where the review fires

**Tail of `onGenerationEnd`** (src 3925, after `writeSceneEntry`), so the review sees *this turn's*
committed diff (growth applied at 3916, threads/quests already written). This matches the Reviewer's
`onGenerationEnd` trigger (1198) and Ambrosia's existing "lorebook writes happen at end-of-turn"
posture. Guards: `if (params.in, inlineGeneration) return;` (the Reviewer has it 1199; Ambrosia's
`onGenerationEnd` currently does **not** — add the check) + the module-scoped `isChronReviewRunning`
re-entry flag (Reviewer 66). The whole tail wrapped in `try/catch` + `safeError` (house rule).

Because it's gated on the **word-interval** (default 2000 words = many turns), the review does *not*
run every turn — most turns it's a single `getStoryWordCount` + a sub-interval early-return (near-zero
cost). It fires roughly once per ~10–20 turns.

### 5.2 GLM budget — the headline efficiency win

Ambrosia targets ~2–3 GLM/turn today (Judge 1 + Oracle freq-gated + reconcile; BUILD_PLAN 513–514).
The Chronicler is designed to **add 0 GLM on the vast majority of turns**:

| Step | GLM calls |
|---|---|
| Sub-interval turn (most turns) | **0** (word-count check, early return) |
| Review turn, candidate sourcing (state-diff) | **0** — deterministic format, the elevation |
| Review turn, dedup | **0** — `isRepeatedAddition` is pure |
| Review turn, compaction | **0 or 1 per oversized entry** (rare; only when a Canon entry exceeds `MAX_CANON_ENTRY_CHARS`) — gate via `getAllowedOutput()`, `suppressScriptHooks:'self'`, `behaviour:'blocking'` (Reviewer 449–457) |
| (Deferred) blind-text secondary review | **up to 2 per entry × N entries** — NOT in v1 (§7 Q3) |

So a *typical* review turn = **0 GLM**; an occasional review turn that triggers a compaction =
**1 GLM**. This is strictly better than the Reviewer (which burns ~2 GLM × up to 5 entries = ~10 per
review) precisely because Ambrosia already holds the facts. Every call gated by `getAllowedOutput()`
(BUILD_PLAN 514) and `suppressScriptHooks:'self'` (504).

---

## 6. Reuse vs new — the concrete table

| Concern | Verdict | Detail |
|---|---|---|
| `countWords`, `getStoryWordCount`, word-interval check | **Port as-is** | Reviewer 68–71, 311–320, 1034–1042. |
| `ReviewerState` baseline | **Adapt** | Folds into `chronicler_state` (snapshot-covered, not raw storyStorage); `lastAutoCheckWordCount` → `wordBaseline`. |
| `onHistoryNavigated` baseline clamp (1206–1218) | **Do NOT port** | Subsumed by `restoreMutableSnapshot` (§3.4). |
| Two-pass JSON salvage (`parseReviewResult`/`salvageReviewResult`) | **Port verbatim** | 406–423, 503–557. Used by compaction (and deferred blind-text). |
| `isRepeatedAddition` + chunk-similarity | **Port verbatim, widen scope** | 81–145. **Cross-category** combined-text input (§4 ③). |
| `compactOversizedLorebookEntry` + `normalize/validateCompactedLorebook` | **Port** | 170–224, 430–501. Re-key the header validator generically (`Type:` not only `Type: character`, since Canon has character/location/world entries). |
| Accept/decline modal (per-fact toggles, auto-accept, Default/Skip/Force, cursor, budget) | **Port** | 264–404, 751–965, 1061–1081. Per-**subject** override instead of per-entry-id. |
| `ensureLorebookEditPermission` | **Port** | 664–674; Ambrosia already requests `lorebookEdit` at init (4016–4017) — reuse `permissions.has`. |
| `applyLorebookSuggestion` append rule | **Adapt → `writeCanonEntry`** | 685–687 append; wrapped in `ensureCanonCategory` + `category` fix (§4.1). |
| **State-diff sourcing** (watermark log + fingerprint state) | **GENUINELY NEW** | The elevation. Reads `oracle_eventlog` (2852, watermark) + the tier/quest/location fingerprint (growth = NET tier, not `growth_history`); **0 GLM**. |
| **Deterministic fact formatting** | **GENUINELY NEW** | Replaces the Reviewer's GLM extraction (§0). |
| **SE-augment direct-write + re-apply** | **GENUINELY NEW** | Rides `se_augments` (§4.2). |
| Blind-text GLM review (`reviewSingleLorebookEntry`, `getRecentStoryExcerpt`) | **Port but DEFER** | 322–343, 559–662. Secondary pass, not v1 (§7 Q3). |

---

## 7. Open questions / risks

1. **Log-less diff: fingerprint-compare vs world-layer change-events.** *Recommend fingerprint*
   (self-contained, touches no #15 code, recomputable). The alternative — having the #15 ActionRule
   executor emit a `world_eventlog` on every `storyState`/placement change — is cleaner long-term but
   is scope-creep into Phase-2 code and adds a key. Confirm fingerprint for v1.
2. **Canon granularity: per-subject keyed entries + a World-History entry vs one monolithic blob.**
   *Recommend per-subject* (layers with SE + Bodies at generation via shared keys; compaction stays
   local; matches the `----`/name/`Type:` schema per subject). Monolithic is simpler to write but
   activates on every generation and compacts globally (worse). Confirm.
3. **v1 scope: deterministic state-diff only, defer the Reviewer's blind-text secondary review.**
   *Recommend defer* (BUILD_PLAN itself calls blind-text "secondary", 231; the GLM-free diff is the
   point). Exactly as harem-dynamics deferred AE surface-detection to its §5. The hooks are designed
   so blind-text drops in later as a second candidate channel without rework.
4. **Auto-accept default on/off.** *Recommend OFF* (the Reviewer defaults off, 264–267; a BE-harem
   world has consent/identity facts a player wants to gate). A "trust deterministic growth/quest
   facts but gate social/identity" middle setting is a tunable.
5. **Review cadence / interval — coupled to the `oracle_eventlog` cap-30.** *Recommend 2000 words*
   (Reviewer default, 16) — but Ambrosia turns are short; live-tune. Risk: too-frequent → modal
   fatigue; too-rare → stale Canon. **Hard constraint:** `oracle_eventlog` shifts at 30
   (`while (arr.length > 30) arr.shift()`, src 2857), so if **>30 Oracle events accrue between
   reviews**, the oldest are dropped before the watermark ever sees them → **silently lost canon**.
   At a 2000-word interval this is safe (Oracle fires freq-gated, ~7–13 events per interval), but the
   review interval **must stay below the cap-30 fill rate** (or raise the cap). The per-entity
   `growth_history` cap-30 is irrelevant here since growth is fingerprint-sourced (NET tier, never
   the log). A LIVE_TEST dial.
6. **Compaction aggressiveness / `MAX_CANON_ENTRY_CHARS`.** Canon *grows* (unlike Bodies/Scene), so
   this is the one entry type that genuinely needs the Reviewer's compaction. Start at the Reviewer's
   2000 chars (19); confirm it preserves the `----`/name/`Type:` header through round-trips.
7. **SE-entry overwrite safety + SEGA-regen interaction.** The §4.2 direct-write is the riskiest
   surface. *Recommend* `chronicler_se_direct_write` **default off** + a one-time SEGA warning +
   `se_augments` re-apply. Flag: the augment is reverted-on-undo only at the *tracker* level, not the
   SE text (§3.5) — accepted caveat.

**Flagged conflict-check (locked design vs code):** none fatal. Three notes for the implementer —
(a) Ambrosia's `onGenerationEnd` lacks the `inlineGeneration` skip the Reviewer relies on (1199);
add it to the Chronicler tail only, not the whole hook. (b) The BUILD_PLAN line "reset Chronicler
word-baseline on navigate" (502/611) is satisfied by *snapshot coverage of `chronicler_state`*, not a
new navigate handler — don't double-handle. (c) `validateCompactedLorebook` hard-codes
`Type: character` (219); Canon has location/world entries too, so the ported validator must accept
any `Type:` line.

---

## 8. Node-test plan — `harness_p3.js` (mirrors harness_17/18)

**Prelude extension (required — the agent confirmed the gap).** The shared `test/prelude.js` mock
does NOT provide `document.scan`, `ui.modal.open`, and its `generate` routes only Oracle/Judge by
system-prompt regex (prelude 51–56). `harness_p3.js` (or a small prelude patch) must add, before the
IIFE:

- `api.v1.document.scan` → returns a settable array of `{ sectionId, section:{ text } }` so
  `getStoryWordCount` works and word-interval crossing is drivable.
- `api.v1.ui.modal.open` → a no-op that records the content (keep the *apply* logic a pure function
  so the deterministic core is modal-free and node-testable, à la harness_17). **Note (house rule):**
  `ui.modal.open` is a separate API from `ui.register`, so the accept/decline modal **coexists with**
  Ambrosia's existing single-`ui.register` sidebar (`refreshPanel`) — the Chronicler must NOT call
  `ui.register` again (BUILD_PLAN 506: "ui.register exactly once"); add at most a panel button that
  opens the modal, merged into the existing panel registration.
- a `generate` branch matching a **stable substring of the compaction system prompt** (e.g.
  `"compact oversized lorebook"`), returning valid `----`/name/`Type:` compacted JSON — else the
  prelude returns the JSON-classifier shape (55) and compaction tests get garbage.

**Deterministic (no mock-`generate` needed):** state-diff computation, fingerprint diff, dedup,
fact formatting, header formatting, `se_augments` tracking, accept/decline state machine, R3 reset,
single-writer assertion. **Needs mock `generate`:** compaction only.

Proposed assertions (~14):

1. **Watermark log-diff** — append two `oracle_eventlog` entries (`turn` 5, 6), set
   `logWatermark.oracleTurn = 5`; the diff yields **only** the turn-6 entry. Advance watermark; a
   re-run yields **nothing** (idempotent).
2. **Growth milestone diff — fingerprint channel only** — set `fingerprint.tiers[id]` to D, grow the
   member through `D→E→F→G` (multiple `applyGrowthAndHistory` steps); the diff yields **exactly one**
   NET growth fact ("reached G-cup"), **not** one per crossing (proving `growth_history` is not a
   second channel). After the review `fingerprint.tiers[id] === G` so a re-run yields nothing.
3. **Fingerprint quest diff** — flip a quest `active→completed` (no log); diff yields "Quest …
   completed"; commit fingerprint; re-run yields nothing.
4. **Fingerprint location discovery** — add a location entity not in `fingerprint.locations`; diff
   yields "Discovered: …"; re-run after commit yields nothing.
5. **Word-interval gate** — with `wordBaseline` set and `document.scan` below `baseline+interval`,
   the review early-returns (no candidates, `chronicler_state` untouched); push word count over the
   interval → it fires.
6. **Cross-category anti-dup** — seed a Canon entry already containing the Aria growth fact; the diff
   re-proposes it; `isRepeatedAddition` filters it out (0 surfaced). Seed the same fact in a *Bodies*
   entry instead → still filtered (cross-category).
7. **Canon append + header** — `writeCanonEntry('Aria', [fact])` on a fresh subject creates an entry
   whose line 1 = `----`, line 2 = the name line, line 3 begins `Type:`; a second accept **appends**
   below (entry text grows, header unchanged).
8. **Compaction round-trip** — set a Canon entry over `MAX_CANON_ENTRY_CHARS`; the mock `generate`
   returns a valid compacted body; `validateCompactedLorebook` accepts it; an invalid (missing
   `----`) mock reply is **rejected** (entry unchanged).
9. **Accept/decline state machine** — given 3 candidate facts and a selected-index `Set {0,2}`, the
   pure apply fn appends only facts 0 and 2; an empty set is a no-op.
10. **Per-subject Skip/Force override** — a subject set to `skip` is excluded from the diff surface;
    `force` includes it even when it would be filtered; cursor round-robins to the next subject.
11. **SE-augment track + re-apply detect** — explicit-accept an SE fact → `be:se_augments` gains the
    record; mutate the live SE entry text to drop the `addition` (simulate SEGA regen) → the
    re-apply detector flags exactly that augment; with the addition present → no flag.
12. **Single-writer law** — deep-snapshot every member's `bodyState` before a full review+accept;
    assert byte-identical after (tier_index, fill_percent, everything). The Chronicler reads the
    growth diff but writes only lore + `chronicler_state` + `se_augments`. (Mirrors harem #9.)
13. **R3 undo reverts the watermark/fingerprint** — `pushSnapshot`; run a review that advances
    `chronicler_state` (and grows a member post-snapshot, like harness_18); `restoreMutableSnapshot`;
    assert `wordBaseline`/`logWatermark`/`fingerprint` revert. Then assert the Canon entry **persists**
    (not snapshotted) and a re-review is a **no-op** via anti-dup (the §3.5 idempotency proof).
14. **harness_18 enumeration guard still passes** — add `SK.chronicler_state` to `SNAPSHOT_SINGLETONS`
    and re-run scenario 5 (test/harness_18.js 161–180): every `SK` key covered, no new uncovered key.
    (This is the build's regression net for the new key.)

Wire `harness_p3` into `test/run.sh`'s loop (line 18) alongside the others.

---

## 9. Build increments (each independently node-verifiable)

> **STATUS (v0.3.21): increments 1–8 BUILT + LIVE → the Chronicler is COMPLETE** (node-verified,
> `harness_p3.js`, 111 assertions). The Chronicler fires at the `onGenerationEnd`
> tail, word-interval gated, sourcing canon from the state-diff at 0 GLM, and (auto-accept OFF, the default) surfaces it
> through an accept/decline **modal** with per-subject Skip/Force overrides (in undo-invariant `be:settings`). **COMMIT
> MODEL (#5, advisor-revised from the §4 ⑦ sketch):** the review commits cadence (`wordBaseline`) + the lapping
> **watermark** + the display cursor, but the **fingerprint commits per-subject ON ACCEPT** (`commitAcceptedFacts`) —
> committing it at review/modal-open would silently lose a structural fact on a *dismissed* modal. So **dismiss ≠ decline**
> for structural facts (they re-offer); FLAVOR (world/social) is best-effort (watermark-committed at review). The
> Reviewer's `TARGET_FACTS_PER_RUN` budget is dropped (no GLM cost to cap); `writeCanonEntry` is self-deduping.
> **COMPACTION (#6→#8): now MODAL-REVIEWED + default-ON.** inc 6 shipped it config-gated DEFAULT-OFF as a stopgap (the
> gate validates the `----`/name/`Type:` HEADER, not the facts, so an auto-applied compaction could silently drop a fact —
> Canon isn't snapshotted + the fingerprint already committed). **inc 8 implemented the §4 ⑤ design:**
> `gatherCompactionProposals` proposes a per-entry **replace-suggestion in the modal** (Accept Compaction → replace;
> Decline → it rides), applied silently only under auto-accept ON — so `chronicler_compaction` now **defaults ON** (review
> makes it non-silent). **Clobber-safe:** `gatherCompactionProposals(overrides, built.batch)` skips any subject gaining a
> fact this review (its compactedText predates the append → would overwrite the just-accepted fact), compacting it next
> review instead (pinned by a discriminating test). ⚠ Known minor: a perpetually-DECLINED oversized entry re-proposes (one
> GLM call) each review, and Skip — the only silencer — also stops chronicling that subject's new facts. **inc 8 also
> pinned R3 + single-writer:** a full review+accept leaves `bodyState` byte-identical; undo reverts
> `chronicler_state`+`bodyState` together while the Canon entry persists; re-grow→re-review is idempotent (anti-dup).
> `be:chronicler_state` is snapshot-covered (harness_18 enumeration guard).
> **SE-DIRECT-WRITE (#7, the last increment, v0.3.21): DONE.** An accepted fact about an SE-owned character (entity with a
> non-null `seEntryId`) is *also* mirrored into its SE lorebook entry — in ADDITION to the always-written Canon entry,
> never instead of it (the discriminator: with direct-write OFF the strict either/or reading would drop SE-owned canon
> entirely → forbidden by the anti-silent-loss law). Tracked in `be:se_augments` (already snapshot-covered → **no new
> key**) as `{seEntryId, entityId, addition, appliedAt, augmentHash}`; `detectSeAugmentReapplies` flags an augment whose
> `addition` is substring-ABSENT from the live SE entry (SEGA clobbered it) → a Re-apply-all action in the modal +
> a one-time SEGA-overwrite warning. Doubly gated (explicit Accept + `chronicler_se_direct_write`, default OFF),
> best-effort (`applySeAugment` never throws → a stale `seEntryId` can't block the Canon write or the fingerprint). The
> mirror lives at the tail of `commitAcceptedFacts` → covers BOTH the modal-accept and auto-accept paths. ⚠ DORMANT until
> `se_mapping`/`seEntryId` are populated (no entity is SE-owned in the live build) — wired + node-verified now
> (`harness_p3` §14, assertion 11 + single-writer + config-OFF inert). **REMAINING: nothing — the Chronicler is COMPLETE
> (increments 1–8). Next phase: P4 stills.**

1. **State-diff extractor (0 GLM)** — `computeStateDiff()` reading `oracle_eventlog` (watermark) +
   the tier/quest/location fingerprint (growth = NET tier, the single channel; `growth_history` not
   read as a trigger); returns tagged candidate facts. *Verify:* assertions 1–4. (No lorebook writes
   yet.)
2. **Deterministic fact formatter + cross-category dedup** — `formatCanonFacts()` + the widened
   `isRepeatedAddition`. *Verify:* 6, 9.
3. **`ensureCanonCategory` + `writeCanonEntry` (append, header-conformant)** — the Canon write path,
   per-subject keying. *Verify:* 7.
4. **Word-interval trigger + `chronicler_state` + hook tail** — port word-count, fire at the tail of
   `onGenerationEnd` with the `inlineGeneration`/`isChronReviewRunning` guards; advance
   `chronicler_state`. *Verify:* 5; add `SK.chronicler_state` to `SNAPSHOT_SINGLETONS` here → run 14.
5. **Accept/decline modal + auto-accept + Skip/Force/cursor** — port the modal surface, apply logic
   as a pure fn. *Verify:* 9, 10.
6. **Compaction** ✅ (v0.3.19→0.3.20) — port `compactOversizedLorebookEntry` + the (generalized) format validators.
   inc 6 shipped config-gated default-OFF; **inc 8 made it MODAL-REVIEWED** (`proposeCanonCompaction` →
   `gatherCompactionProposals` → a modal replace-suggestion; default-ON, clobber-safe). The two-pass FACT salvage does
   NOT port (no GLM fact path here). *Verify:* 8.
7. **SE-augment direct-write + re-apply** ✅ (v0.3.21, the LAST increment) — the §4.2 path on `se_augments`:
   `applySeAugment` (best-effort SE-entry append + track), `mirrorAcceptedFactsToSE` (at the tail of
   `commitAcceptedFacts` → both accept paths), `detectSeAugmentReapplies` + `reapplySeAugment` (substring-absent ⇒
   re-apply), a Re-apply-all modal section + a one-time SEGA warning. default-off config, no new snapshot key, dormant
   until SE-linking lands. *Verify:* 11. **The Chronicler is now COMPLETE (1–8).**
8. **R3 wiring + single-writer + full-review integration** ✅ (v0.3.20) — snapshot round-trip, body
   bytes untouched, undo idempotency confirmed. *Verify:* 12, 13, 14.

---

## 10. One-paragraph recommendation

Source canon candidates from Ambrosia's **structured state-diff** — a **hybrid of watermark-diffing
the turn-stamped `oracle_eventlog`** (src 2852) **and fingerprint-diffing the log-less current
state** (NET entity tier, quest `storyState`, discovered locations — growth is canonized from the
*current tier*, not the `growth_history` audit log, so one growth is one Canon line) — and
**format the facts deterministically with zero GLM**, demoting the Reviewer's
blind-text GLM extraction to a deferred secondary pass and keeping GLM only for occasional compaction
of an oversized Canon entry. Port the Reviewer's two-pass JSON salvage, `isRepeatedAddition`
anti-dup (widened to check SE + Bodies + Canon cross-category), compaction + `----`/name/`Type:`
validators, and the accept/decline modal verbatim; adapt its append rule into `writeCanonEntry`
(per-subject keyed `Ambrosia: Canon` entries, sole-writer; Bodies/Scene skipped). Store one new
snapshot-covered singleton `be:chronicler_state` (word-baseline + log-watermark + state-fingerprint +
cursor) added to `SNAPSHOT_SINGLETONS` in the same commit so the standing harness_18 enumeration guard
passes; reuse `be:se_augments` for SE-direct-writes (proposal-by-default, explicit-accept,
SEGA-warned, re-apply-after-regen); keep user prefs in undo-invariant `be:settings`. R3 is correct
by construction: on undo the watermark/fingerprint revert with the snapshot while the Canon entry
persists, and re-review is idempotent via anti-dup — so the Reviewer's manual navigate-clamp does NOT
port. Fire the review at the tail of `onGenerationEnd` (with the `inlineGeneration` skip + a
re-entry guard), gating every GLM call via `getAllowedOutput()` so a typical review turn spends 0 GLM.
```

---

## 11. Advisor refinements (folded into the build — these supersede where they touch the above)

The design is approved; build increments-first. Four refinements, folded in:

1. **Cap-30 lap-detection is a BUILD item in increment 1, not a live-tune dial (§7 Q5 upgraded).** The
   watermark assumes `oracle_eventlog` is a complete record since last review, but it `shift()`s at 30
   (src 2857) — if events outpace the interval the oldest drop *silently* before the watermark sees
   them. Build the guard into `computeStateDiff`: if the oldest retained eventlog entry's
   `turn > logWatermark.oracleTurn + 1`, you've been **lapped** → `safeLog` it (don't pretend coverage
   was complete). **Bounded-loss nuance:** a lap only drops world/social **flavor** beats — the
   structural canon (tier, quest, location, **and oracle thread resolutions**) is **fingerprinted, hence
   lap-immune**. So the loss is bounded to flavor, but "bounded and silent" still earns the 3-line guard
   + one assertion (fill the log past 30 between reviews → confirm detection).
   - **Thread-source clarification (reconciles §2 vs §4):** thread *resolutions* are sourced from the
     **thread-set fingerprint** (a thread present last review, absent now = resolved) — lap-immune — NOT
     from the eventlog watermark. The watermark sources only world/social **flavor** entries. So the
     fingerprint carries `{ tiers, quests, locations, threads[] }`; the watermark carries flavor.
2. **Deterministic templating trades natural GLM prose for templates — a NAMED live-test/feel item.**
   `"Aria's breasts reached G-cup (a moderate change, by catalysis)"` is structurally correct but may
   read robotically when it feeds back into generation as canon. Node can't verify prose feel (same
   class as #17 pacing). Flagged here + in the handoff as a live-test check, not a surprise. (Lever if
   it reads badly: a thin optional GLM "polish" pass on accepted facts — but default to templates.)
3. **Build increments 1–4 (the elevation core: state-diff → format → Canon write → trigger), then STOP
   and check in.** The user can't live-test, so polishing feel-dependent parts (cadence, modal UX) before
   they can react is premature; and **SE-direct-write (increment 7) is the ONLY path that writes outside
   `Ambrosia:` categories** — risky, default-off, deferred from the core entirely. Three genuinely
   user-facing forks are surfaced for the user to pick (recommended defaults in parens), NOT silently
   adopted: **auto-accept default** (off), **whether SE-direct-write is in v1 scope at all** (no — defer),
   **review cadence** (2000 words, but cap-30-constrained per §7 Q5).
4. **Retry idempotency — the Chronicler tail runs OUTSIDE the `if (pd)` block (cf. the #18 finding).**
   `onGenerationEnd` has no re-entry guard; the `if (pd)` + `pd=null` consume is the de-facto
   idempotency guard for growth-apply, and the Chronicler tail is *after* it → on a retry it re-fires.
   It IS self-idempotent (the advanced `wordBaseline` makes a re-fire early-return), but **assert it**
   (double-fire `onGenerationEnd` → expect exactly one review). If the deferred `endOfTurnTicks`-gating
   fix is later built (move ticks out of `if (pd)` + add an `onGenerationEnd` re-entry guard), that same
   guard should also cover the Chronicler tail.

(Doc path: `research/chronicler-p3.md`.)
