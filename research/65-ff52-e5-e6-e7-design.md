# research/65 — FF5.2 deferred engines: E5 GM's Notebook, E6 NPC thoughts, E7 Titles

Phase 5 of the FF5.2 port (research/58 Bucket E; D3 deferred these three). Same playbook as E1–E4: classifier extension → deterministic reducer/store pass → rendered block → settings toggle → UI. Each is independent, opt-in (unset = off), byte-stable off (prompt-cache rule), and hosted on existing rollback-covered carriers.

## E5 — GM's Notebook (`gmNotebook` setting)

**What it is (FF):** a capped hidden scratchpad of [R]eminders/[T]hreads the model re-reads each turn. Aventuras' memory stack covers long-term recall; the missing piece is a *small, always-hot, engine-persisted* continuity list ("Stacy doesn't know about the eclipse protocol", "you are posing as a spice merchant").

**Design (research/58 option a):**
- State `GmNotebookState { notes: GmNote[], nextId }`, `GmNote { id: 'n<digits>', kind: 'reminder'|'thread', text, turn }`, hosted at `metadata.gmNotebook` on the SELF character (the chekhov hosting ruling — full rollback/branch/retry coverage; no protagonist ⇒ engine inert).
- Caps: `GM_NOTES_MAX = 12` notes, `GM_NOTE_TEXT_MAX = 160` chars, `GM_NOTES_MAX_ADDS_PER_TURN = 3`, deterministic expiry `GM_NOTE_MAX_AGE = 40` turns (a reminder nobody refreshed for 40 turns is stale). FIFO-oldest drops when over cap.
- Classifier extension (worldsim/notebook-schema.ts): `gmNotesAdd: [{kind, text}]` + `gmNotesDrop: [ids]` against a rendered ACTIVE NOTES list; instructions say what a note is NOT (setups → chekhov, quests → beats, relationship shifts → bond). Truncate-not-reject, `sanitizeDebtText` on text, ids validated against the active list (chekhov rules verbatim).
- Store pass `applyGmNotebookTurn` (single writer, one write, value-identity skip, pauses on a signal-less classify).
- Render: `[GM NOTES]` block in the user-prompt tail (volatile per turn) BEFORE [OFF-SCREEN] — continuity facts are lower authority than the check but frame everything else. `TurnDirectives.gmNotesBlock`.
- Dedup vs chekhov: notes are facts to keep straight, not payoffs; the classifier instruction draws the line and a note that IS a setup is simply redundant, not harmful.

## E6 — NPC inner voices (`npcThoughts` setting)

**What it is (FF):** up to 3 NPCs' raw internal monologue lines shown per turn. Flavor, not mechanics.

**Design (research/58 option b — the `<pic>` precedent):**
- Narrator may end its response with up to `THOUGHT_MAX_PER_TURN = 3` tags `<thought who="Name">one to three sentences of raw inner monologue</thought>` for named NPCs present in the scene (never the protagonist in 1st/2nd/hybrid POV). Template block appended to the narrative system prompt only when the setting is on (per-story constant ⇒ cache-safe).
- `utils/thoughtTagParser.ts`: `extractThoughtTags`, `stripThoughtTags`, `hasIncompleteThoughtTag` (streaming safety like `<pic>`), caps (who ≤ 60, text ≤ 600, 3 per entry).
- Strip points: displayed prose (StoryEntry/StreamingEntry/VnView), narrator history (NarrativeService, next to `stripPicTags`), classifier input, translation/TTS surfaces that already strip pic tags. A `<thought>` never reaches an image prompt or the classifier.
- UI: a collapsed "Inner voices" strip under the entry listing `Name — thought` lines; no persistence beyond the entry content itself (the tag stays in the stored narration exactly like `<pic>`).
- Explicitly NOT engine state: thoughts are never read back into any reducer (research/57 meta-lesson).

## E7 — Titles (`rpgTitles` setting, requires the RPG sheet ⇒ beMode)

**What it is (FF):** earned titles ("Charmer", "Slayer") grant ±1..2 domain-locked roll mods.

**Design:**
- Sheet field `titles: RpgTitle[]`, `RpgTitle { name, skills: SkillId[] (1–3), reason, turn }`; `RPG_TITLES_MAX = 8`; flat `RPG_TITLE_BONUS = +1` per applicable title (FF's ±1..2 collapsed to +1 — penalties are not awarded by an accomplishment detector). Idempotent on normalized name; at most `RPG_TITLES_MAX_PER_TURN = 1`.
- Classifier extension (rpg/titles-schema.ts): `titlesEarned: [{name, reason, skills}]` — only a clear, completed, named accomplishment this response shows; skills validated against `SKILL_IDS`; name ≤ 24 chars sanitized; rendered EARNED TITLES list so the classifier doesn't re-award.
- Modifier: `buildTitleCheckModifiers(sheet, skill)` → `{label: 'title: Charmer', value: +1}` per title whose skills include the check skill; appended in CheckPhase next to `buildTargetCheckModifiers`.
- Render: `[PLAYER SHEET]` gains `Titles: Charmer (Persuasion, Seduction); …` ONLY when titles exist (cache guard like known spells). SheetPanel lists titles. Store pass rides the existing RPG sheet write (`applyRpgSheetTurn` region: add `awardTitles` step before drift).

## Out of scope
E8 NPC-side dice, E9 debug engine (research/58). NPC↔NPC thoughts persistence. Title penalties / item modifiers.

## Settings
`gmNotebook?: boolean`, `npcThoughts?: boolean`, `rpgTitles?: boolean` on StorySettings; three switches in Story Settings next to the E2–E4 toggles.

## Design amendments made during the build (differences from the plan above)
- E5 caps: `GM_NOTES_MAX` 16 (was 12), `GM_NOTES_MAX_ADDS_PER_TURN` 2 (was 3); **reminders never expire** (only threads at 40 turns — a fact honored for 40 turns is still a fact); over-cap eviction is oldest THREAD first, then oldest REMINDER, never a same-turn note (not plain FIFO). Notes keep an `age` counter (relative), not the absolute `turn` named above — a non-empty notebook therefore writes every turn (accepted; chekhov has the same shape).
- E6: protagonist thoughts are forbidden in EVERY POV (the agent judged third-person protagonist interiority belongs in prose too). The panel renders only voices of KNOWN non-protagonist characters (the prompt rule is enforced at render). Thoughts are stripped before translation (panel shows the original-language thought). No VN-view panel yet (VnView strips them) — open item below.
- E7: `RpgTitle` has no `turn` field (not needed by any consumer). Stacking capped at `RPG_TITLE_MAX_STACK = 2` per skill; a proposal whose skills are ALL already covered is not awarded (same deed under a new name is not a new title). Skill ids accept labels/any case. Titles line + panel + modifier are all gated on `rpgTitles`.
- Classifier: when more than one engine extension is attached, one lead line tells the classifier the side-arrays are secondary to base extraction.

## File-level changes
- worldsim: `notebook.ts`, `notebook-schema.ts`, `constants.ts` (GM_* caps), `directives.ts` (`gmNotesBlock`), `index.ts`.
- rpg: `titles.ts`, `titles-schema.ts`, `types.ts` (`RpgTitle`, `titles?`), `metadata.ts` (tolerant `titles`, JSON-clone writer), `context.ts` (Titles line), `index.ts`.
- generation: `ClassifierService.ts` (two extensions + lead line), `NarrativeService.ts` (`[GM NOTES]` render, `buildNpcThoughtInstructions`, history strip), `phases/CheckPhase.ts` (title modifiers), `phases/TranslationPhase.ts` (strip), `classifier-bounds.ts`, `sdk/schemas/classifier.ts` (result fields).
- E6: `utils/thoughtTagParser.ts`, `utils/htmlStreaming.ts`, `templates/narrative.ts`, `templates/variables.ts`, strip points in MemoryService / EntryRetrievalService / TimelineFillService / ActionChoicesService / SuggestionsService / BackgroundImageService; components `StoryEntry.svelte` (panel), `StreamingEntry.svelte`, `VnView.svelte`.
- store: `applyGmNotebookTurn` + call; `applyRpgTurn(result, …)` step 2b. Settings: `types/index.ts`, `story-settings.svelte`. UI: `SheetPanel.svelte` Titles.
- No service-template sync bump: the classifier instructions ride `customVariableInstructions` (code), the narrative templates are story-category (hash-refreshed on startup).

## Review outcome (3-lens adversarial pass + fix-diff round, 2026-08-22)
Three lenses (security/bypass; concurrency/crash-recovery/persistence; edge-case/player-facing behavior) reviewed the merged diff 11128374..18bec9f9. Fixes landed in 65a24a28 and 3f9c56c5.

**CRITICAL (fixed):** `writeRpgSheet` used `structuredClone`; `titles: z.array(z.unknown())` keeps references to the stored objects, which sit on a Svelte `$state` proxy → `DataCloneError` on the FIRST turn after a title was awarded, rolling back every subsequent turn (and breaking point-spend / spell-learn). Verified with a probe by the reviewer; fix = JSON clone (the chekhov/agenda writer rule). Invisible to unit tests (plain objects) — recorded here as the lesson: **any zod `z.unknown()` field in metadata makes the parsed value a proxy reference; every metadata writer must JSON-clone.**

**HIGH (fixed):** title sanitizer was a hand-rolled narrower copy missing the U+E0000 tag block (title names reach the SYSTEM prompt) → delegates to `sanitizeDebtText`. `stripThoughtTags` deleted everything after any unclosed/imperfectly-closed `<thought` (display, narrator history, classifier input, TTS) → now strips only paired tags, a `who=` tag cut off within one monologue of the end, and a trailing partial prefix; tolerant `</thought >`. Notebook churn: 3 adds/turn vs 12 FIFO evicted load-bearing notes in ~4 turns → caps 2/16 + kind-aware eviction; reminders no longer expire (no refresh path existed).

**MEDIUM (fixed):** Titles line/panel advertised +1 with the setting off while CheckPhase did not apply it → gated; uncapped title stacking (+8 on one skill reachable) → stack cap 2 + covered-skills rejection; thoughts leaked into memory summaries, retrieval, timeline fill, action choices, suggestions, background-image analysis, translation → stripped everywhere; skill ids case-sensitive (a label answer voided the award) → label/any-case lookup; VN visual-prose streaming rendered thoughts live → hold-back in VnView and StreamingHtmlRenderer; panel showed thoughts for absent/protagonist `who` → filtered to known non-self cast; unquoted `who` silently dropped the thought → tolerated; one malformed stored note wiped the whole notebook (array-level catch) → element-wise parse; `[GM NOTES]` wording made "Thread" lines read as standing directives and had no precedence vs [CALLBACK] → per-kind wording + "a directive block below wins"; five stacked "Additionally fill…" blocks → lead line.

**LOW (fixed):** nextId ceiling vs id pattern; read trimmed from the wrong end; passthrough junk on notes; drops/turn below the live cap; store title gate without beMode; `titles.test.ts` was binary (raw NUL) → escaped; settings copy promised a UI ("always-visible"); `npcThoughtInstructions` registered as a template variable; readonly typing of the frozen empty notebook.

**Accepted / deferred (not fixed, recorded):** no player-facing notebook view or pin/edit (notes are invisible except through the narrator's behavior) — next UI pass; no VN-view inner-voices panel (VnView strips them; the toggle is pure token cost in VN mode) — next UI pass; title awards surface only on the sheet panel (no toast/turn-log row); a stored title whose skills no longer parse is dropped on the next award (no migration); notes carry relative `age` so a non-empty notebook writes every turn; thoughts are stripped from user-authored text too when a user literally types a paired `<thought who=…>` tag (precedent: `<pic>`); a GM note can duplicate a chekhov bullet (instruction-only guard, harmless).

**Fix-diff round (3f9c56c5 reviewed; fixes in the follow-up commit):** HIGH `hasIncompleteThoughtTag` still matched bare `<thought` — a literal "<thought for later>" in prose wedged streaming (visual prose newly called it) → only `who=` opens count, an open older than one monologue's length is treated as resolved, close tags tolerate attributes, the tail window is measured from the LAST dangling open, prefix hold-back runs after a closed tag too; HIGH-latent `writeBodyState` still used `structuredClone` (passthrough keys are proxy references) → JSON clone; MEDIUM `sanitizeAgendaText` never stripped bidi overrides U+202A–202E (title names reach the system prompt) → added for every consumer; notebook top-level passthrough keys persisted → literal `{notes, nextId}`; thread-first eviction starved threads once reminders filled the list → oldest-first with kind as tiebreak; read walk bounded at 4× cap; "+1 each" wording vs the stack cap → "+1 …, at most +2 from titles on any one skill" in the sheet line and a panel note; flat-union "covered skills" rule could lock titles out → subset-of-one-existing-title rule; panel dropped voices of characters the classifier never created → only the protagonist is filtered, unmatched render with the raw name. Accepted: strip points are not gated on `npcThoughts` (a user-typed paired tag is stripped; `<pic>` precedent); [GM NOTES] at 16 notes costs ~2.8 KB/turn (context-budget note).

Suite 1467, check/lint clean.
