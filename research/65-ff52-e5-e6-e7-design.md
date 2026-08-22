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

## Review outcome
(filled at the end of the phase)
