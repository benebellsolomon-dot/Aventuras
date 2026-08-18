# 31b — Aventuras integration surface: where native BE fields plug in

**Date:** 2026-07-16 · **Repo:** `/Users/benjaminsolomon/Projects/gaming/Aventuras` (Ben's fork, branch
`be-patches`, tip `a09efeb6`) · **App version:** 0.7.6-be.1 · **Method:** read-only source inspection +
one read-only query against the live app DB (`~/Library/Application Support/com.karelian.aventura/aventura.db`,
81MB, at migration 35, Ben's actual in-use story data).

**Relationship to prior docs:** `research/30-aventuras-evaluation.md` evaluated Aventuras as a platform in
general terms. `research/31a-be-engine-portable-spec.md` specifies what the BE engine must DO,
platform-independently. This document is the missing link between them: the precise file/line integration
surface inside Aventuras for the feature described in the task brief — native per-character body state,
a deterministic reducer fed by LLM-extracted events, template + image exposure, undo/branch safety, and UI.

**No files were modified. No builds were run.** Every claim below cites a file path and line range from a
direct `Read`/`grep` of the source, cross-checked against the live DB schema where noted.

---

## 0. Executive summary

| Question | Answer | Confidence |
|---|---|---|
| Storage: new column vs `metadata` vs runtime-variables table? | **`character.metadata.bodyState`** — a new sub-key alongside the existing `metadata.runtimeVars`, same column, same pattern, but *not routed through the runtime-variables system itself*. Rejected: a new column (more code, no safety gain — §3.2). Rejected: the runtime-variables system as the mechanism (same underlying `metadata` column, so no safety difference — but it's LLM-sets-the-value + a stateless clamp only, with no stateful `f(oldTier, event)` hook anywhere in it, and no boolean type for the lock — structurally incompatible with a deterministic reducer — §3.2a). | High — see §3.2/§3.2a |
| Snapshot-safety verdict | Metadata **already flows automatically** through checkpoints, world-state snapshots, and CoW branch-copy (all three copy full `Character` objects). It is **hand-enumerated and must be added explicitly** to the rollback/undo path (`CharacterBeforeState`) only if a *new column* is chosen — piggybacking on `metadata` **skips that edit entirely**, since `metadata` is already a field on `CharacterBeforeState`. One real, pre-existing gap remains regardless of storage choice: the persisted cross-session retry snapshot (`PersistentCharacterSnapshot`) never included `metadata`, even before this feature. | High — see §3 |
| Pipeline insertion point | **Not** a new `GenerationPipeline` phase. `ClassificationPhase` only extracts; the applier + undo-capture both live in `StoryStore.applyClassificationResult()` (`src/lib/stores/story.svelte.ts:1925`). The reducer must run **inside that function**, after the existing character/location/item/beat update loops and **before** the `WorldStateDelta` is built and saved (`story.svelte.ts:2688`) — otherwise its changes are invisible to rollback. | High — see §2 |
| Classifier-apply write site | `StoryStore.applyClassificationResult()`, `src/lib/stores/story.svelte.ts:1925`, character loop at `:2059-2153`, persisted via `database.updateCharacter()` at `:2141`. (Not `ClassifierService.ts:312` — that loop only clamps numbers pre-return, never touches the DB.) | Confirmed, resolves the prior agent's open question |
| Template exposure | New method on `ContextBuilder` (`src/lib/services/context/context-builder.ts`), mirroring `loadRuntimeVariableContext()` (`:185-284`). **Must also edit the shipped `narrative.ts`/`analysis.ts` template bodies** — the equivalent `runtimeVars_characters` variable is built and documented but referenced by **zero** shipped templates today; it's a power-user-only hook, not something the narrative model sees by default. | High — see §4 |
| Image exposure | Today: model-instruction-only (`NarrativeService.ts:42-78`), zero grounding. Programmatic override point: `InlineImageService.ts:163-165` (`fullPrompt` assembly), where full `Character[]` objects are already in scope. | High — see §5 |
| Top 3 risks | (1) Zod v3 strips unknown keys by default — BE classifier fields need the same schema-extension mechanism as runtime variables, not ad-hoc fields. (2) Rollback/CoW (`stateTracking`/`lightweightBranches`) default OFF app-wide, confirmed off in Ben's own live DB — most of the undo-safety analysis is conditional. (3) No migration rollback exists anywhere in this codebase — a shipped `body_state` column is a one-way door. | See §9 |

---

## 1. Character data model

### 1.1 `characters` table — schema evolution across migrations

Base table, `src-tauri/migrations/001_initial.sql:29-39`:

```sql
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    relationship TEXT,
    traits TEXT,
    status TEXT DEFAULT 'active',
    metadata TEXT,
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
);
```

Columns added by later migrations (all `ALTER TABLE characters ADD COLUMN`, confirmed via
`grep -rn "characters" src-tauri/migrations/*.sql`):

| Migration | Column(s) added |
|---|---|
| `011_image_generation.sql:4` | `visual_descriptors TEXT DEFAULT '[]'` |
| `015_branch_world_state.sql:5` | `branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE` |
| `021_translation.sql:7-12` | `translated_name`, `translated_description`, `translated_relationship`, `translated_traits`, `translated_visual_descriptors`, `translation_language` |
| `026_cow_branches.sql:7` | `overrides_id TEXT` (copy-on-write parent pointer) |
| `028_cow_tombstones.sql:6` | `deleted INTEGER NOT NULL DEFAULT 0` (copy-on-delete tombstone) |

**Live-DB confirmation** (`sqlite3 "file:$DB?mode=ro" ".schema characters"` against Ben's actual
81MB app DB, currently at migration 35): the live table matches this derivation exactly — same 18
columns, same order, same defaults. The DB's migration ledger (`_sqlx_migrations`, the table
`tauri_plugin_sql`/sqlx maintains) confirms all 35 migrations are applied (`SELECT * FROM
_sqlx_migrations ORDER BY version DESC LIMIT 5` → top row `35|entry_versions|2026-07-16 22:40:03|1|...`).

### 1.2 The `Character` TS type

`src/lib/types/index.ts:156-177`:

```ts
export interface Character {
  id: string
  storyId: string
  name: string
  description: string | null
  relationship: string | null
  traits: string[]
  visualDescriptors: VisualDescriptors
  portrait: string | null
  status: 'active' | 'inactive' | 'deceased'
  metadata: Record<string, unknown> | null
  branchId: string | null
  overridesId?: string | null
  deleted?: boolean
  // Translation fields
  translatedName?: string | null
  translatedDescription?: string | null
  translatedRelationship?: string | null
  translatedTraits?: string[] | null
  translatedVisualDescriptors?: VisualDescriptors | null
  translationLanguage?: string | null
}
```

`metadata: Record<string, unknown> | null` (line 166) is the field of interest — see §1.4.

### 1.3 `character_vault` table

`016_character_vault.sql` created it with protagonist/supporting type-specific fields (background,
motivation, role, relationship_template); `023_simplify_character_vault.sql` **rebuilt the table**
(`CREATE character_vault_new` → copy → `DROP` → `RENAME`, lines 5-49) to drop those fields, since
"these concepts are now handled in the Story Wizard, not the global Vault" (comment, line 3). Current
columns: `id, name, description, traits, visual_descriptors, portrait, tags, favorite, source,
original_story_id, metadata, created_at, updated_at`. The `metadata` column exists here too
(`023_simplify_character_vault.sql:22`). TS type: `VaultCharacter`, `types/index.ts:187-208` — same
shape minus story-runtime fields (no `status`, `branchId`, `overridesId`).

Migration `016`'s own header comment is load-bearing for the BE design: **"Characters are copied to
stories (no sync back)"** (`016_character_vault.sql:2`). The vault is a copy-out template source, not
a live state mirror — see §6 for what this means for body-state UI.

### 1.4 Where a `body_state` column (or equivalent) should go, and how `metadata` is used today

**Recommendation: do not add a dedicated column. Store it as `character.metadata.bodyState`,
mirroring the existing `metadata.runtimeVars` sub-key exactly.** Full snapshot-safety argument in §3;
the short version is that every serialization path that already handles `metadata` correctly (four of
five undo/branch mechanisms) needs zero additional code, while a new column needs three additional
hand-edits (`mapCharacter`, `addCharacter`, `updateCharacter`) just to round-trip, plus more edits to
reach the same undo-safety level.

`metadata` today is a generic JSON bag with exactly one structured convention layered on top of it —
`RuntimeVarsMap`, keyed by `RuntimeVariable.id` (not name, so renames are free):

```ts
// src/lib/services/packs/types.ts:100-112
export interface RuntimeVariableValue {
  variableName: string
  v: string | number | null
}
export type RuntimeVarsMap = Record<string, RuntimeVariableValue>
```

Read/write is centralized in one helper, `mergeRuntimeVars()` (`src/lib/stores/story.svelte.ts:62-82`):
it merges new values under `metadata.runtimeVars`, keyed by definition ID, non-destructively. Every
new-entity and update code path in `applyClassificationResult` calls this same helper (six call
sites: `:2078`, `:2137`, `:2176`, `:2218`, `:2307`, `:2663` — new character/location/item/story-beat
creation and update). Live-DB confirmation of the metadata convention (`SELECT metadata FROM
characters WHERE metadata IS NOT NULL LIMIT 3` on Ben's DB): `{"source":"wizard"}` — a lightweight
provenance tag is the only metadata Ben's own characters currently carry (no runtime variables defined
in his live pack yet), consistent with `{ source: 'classifier' }` tags seen in code
(`story.svelte.ts:2071`, `:2169`, `:2300`, `:2657` for classifier-created entities).

### 1.5 How a new migration is added; what happens to existing databases on upgrade

**Wiring** (`src-tauri/src/lib.rs:16-227`): migrations are a hand-maintained `Vec<Migration>` literal,
one entry per file, in strictly increasing `version:` order:

```rust
Migration {
    version: 35,
    description: "entry_versions",
    sql: include_str!("../migrations/035_entry_versions.sql"),
    kind: MigrationKind::Up,
}
```

No auto-discovery — confirmed by reading the full 001→035 list (`lib.rs:16-226`): every file under
`src-tauri/migrations/` has a corresponding manual entry, and the entry's `version:` integer, not the
filename, is authoritative to `tauri_plugin_sql`. Adding a BE migration means: create
`src-tauri/migrations/036_character_body_state.sql` (only needed if going the dedicated-column route;
not needed at all for the `metadata`-only recommendation in §1.4/§3) and append a matching
`Migration{version: 36, ...}` entry before the closing `];` at `lib.rs:226-227`. This is registered via
`.plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:aventura.db", migrations).build())`
(`lib.rs:240-244`).

**Existing databases on upgrade:** `tauri_plugin_sql` is sqlx-backed and tracks applied migrations in a
`_sqlx_migrations` table (columns: `version, description, installed_on, success, checksum,
execution_time` — confirmed via live query). On next app launch, only migrations with a version
higher than the DB's max recorded version run, in a transaction, against the existing file; a plain
`ALTER TABLE ... ADD COLUMN ... DEFAULT ...` is non-destructive (SQLite backfills the default for every
existing row). **There is no rollback/Down migration anywhere in this codebase** — every one of the 35
entries uses `kind: MigrationKind::Up` only (the `tauri_plugin_sql::MigrationKind` enum does support a
`Down` variant, but nothing here uses it). See §9 risk 3.

**A fork-specific gotcha worth knowing about but not blocking:** `src-tauri/src/migration_patch.rs`,
invoked from the `.setup()` hook (`lib.rs:245-256`, i.e. `apply_checksum_patch(&db_path)` runs before
the sql plugin would otherwise validate checksums), pre-patches known-bad CRLF-vs-LF checksum
mismatches for migrations 1-24 inherited from upstream — `migration_patch.rs:8-32` is a literal table
of (version, bad-CRLF-checksum-hex, good-LF-checksum-hex) tuples, applied only when
`total_migrations <= fixups.len()` (`:44`), i.e. only on databases that haven't progressed past
migration 24 yet. This is irrelevant to a new migration 036 authored fresh in this environment (no
historic CRLF baggage), but explains why this particular fork has a Rust module upstream doesn't.

---

## 2. Per-turn pipeline

### 2.1 Phase architecture, in order

`GenerationPipeline.ts:1-3` docstring states the order directly: **`pre → retrieval → narrative →
[(classification ‖ translation → image) ‖ background ‖ post]`**. Confirmed by reading the `execute()`
generator (`GenerationPipeline.ts:112-213`) and `runImagePipeline()` (`:220-274`):

1. `PreGenerationPhase` (`phases/PreGenerationPhase.ts`) — `execute()` at `GenerationPipeline.ts:129`
2. `RetrievalPhase` (`phases/RetrievalPhase.ts`) — `:145` (or a cached result is reused, `:139-143`)
3. `NarrativePhase` (`phases/NarrativePhase.ts`) — `:157`, blocking; nothing downstream starts until
   this returns (`:165`)
4. Then a **parallel fan-out** via `mergeGenerators()` (`:170-198`):
   - `imagePipeline` — internally sequential: `ClassificationPhase` ‖ `TranslationPhase` run together
     (`:233-250`), then `ImagePhase` runs once both are done (`:260-267`), since image prompts need
     both the classification result (present characters) and the translated text.
   - `background` — `BackgroundImagePhase`, fully independent (`:179-184`)
   - `postGeneration` — `PostGenerationPhase`, fully independent (`:185-197`)

### 2.2 Who orchestrates

The `GenerationPipeline` class is instantiated and driven from **`src/lib/components/story/ActionInput.svelte`**,
not from within itself — it's an async generator; the caller pulls events:

```ts
// ActionInput.svelte:543, 598
const pipeline = new GenerationPipeline(deps)
...
for await (const event of pipeline.execute(ctx, cfg)) {
  if (stopRequested) break
  handleEvent(event, eventState, eventCallbacks)
  ...
  if (event.type === 'classification_complete' && narrationEntry) {
    await story.applyClassificationResult(event.result, narrationEntry.id)   // line 638
    await story.updateEntryTimeEnd(narrationEntry.id)
    // image-generation context capture happens AFTER this, using story.characters
    // which has already been mutated by applyClassificationResult — lines 641-664
  }
}
```

`ActionInput.svelte` is the true top-level orchestrator: it owns the event loop, decides what to do on
each event type, and is the only place `story.applyClassificationResult()` is called.

### 2.3 Corrected framing: where a deterministic reducer actually belongs

**`ClassificationPhase` (`phases/ClassificationPhase.ts`) is pure extraction — it never touches the
database or `this.characters`.** Its entire body (`:59-133`) calls `this.deps.classifyResponse(...)`
(an injected function) and yields the raw `ClassificationResult`; there is no `database.*` call
anywhere in the file. This means the task brief's framing — "a deterministic BEPhase (post-narrative,
pre/post-classifier?)" as a new pipeline phase — **doesn't fit the actual architecture**. The pipeline
has no apply-to-DB or undo-bookkeeping machinery anywhere in it; all of that lives one layer up, in the
store.

**The real write site, and the real insertion point, are the same function:**
`StoryStore.applyClassificationResult(result: ClassificationResult, entryId?: string)` —
`src/lib/stores/story.svelte.ts:1925`. This function:

1. Captures "before" state for classifier-flagged entities (`:1952-2056`, gated by
   `trackingEnabled = settings.experimentalFeatures.stateTracking && !!entryId`, `:1944`)
2. Applies character/location/item/story-beat updates and creates new entities (`:2059-2681`)
3. Applies scene time progression (`:2684-2686`)
4. **Builds and saves the `WorldStateDelta`** — the undo record — right here, before returning:
   `story.svelte.ts:2688-2733`, persisted via `database.updateStoryEntry(entryId, { worldStateDelta:
   delta })` at **`:2709`**
5. Triggers the periodic full snapshot: `await this.maybeCreateAutoSnapshot(entryId)` at **`:2728`**,
   still inside this same function, before it returns.

**Consequence (verified, not assumed):** a BE reducer that runs *after* `applyClassificationResult()`
returns — whether as a separate pipeline phase or a post-processing step in `ActionInput.svelte` after
line 638 — executes **outside the delta-capture window**. Its changes would not appear in
`charactersBefore`, would not be part of the saved `WorldStateDelta`, and (on a snapshot-interval turn)
could race `maybeCreateAutoSnapshot`. **The correct insertion point is inside
`applyClassificationResult`**, as a new code block placed after the existing new-story-beat loop
(`:2650-2681`) and before the "Phase 1: Save world state delta" comment block (`:2688`) — so the
reducer's own before/after state participates in the same `charactersBefore` array and the same delta
object that already exists for classifier-driven updates.

**A second correctness gap this surfaces, not stated in the task brief:** the existing before-state
capture (`:1975-1990`) only snapshots characters present in `result.entryUpdates.characterUpdates` —
i.e., characters the LLM classifier explicitly flagged *this turn*. A BE reducer that does ambient/
passive updates to characters the classifier did *not* mention (the pattern your own be-story-engine
build history calls "pity-growth on an un-milked member" and passive drain — see the `#16` pacing-floor
entry in project memory) would touch characters with no captured before-state. Those changes would
**not be reverted by rollback**, regardless of storage choice, unless the before-capture is widened to
cover every character the reducer can touch, not just classifier-flagged ones.

**This entire mechanism is conditional on a global, default-off flag.** `trackingEnabled` at
`story.svelte.ts:1944` requires `settings.experimentalFeatures.stateTracking`. Its default is `false`
(`src/lib/stores/settings.svelte.ts:808-818`, `getDefaultExperimentalFeatures()`), and Ben's own live
app DB has **no `experimental_features` row at all** (`SELECT value FROM settings WHERE
key='experimental_features'` returned nothing) — meaning his live install runs with delta-tracking and
CoW branching both off today. Everything above about undo-safety is real for a user who has opted in,
moot for one who hasn't (retries then fall back to the simpler in-memory or ID-based paths — §3).

### 2.4 `ClassifierService` end to end

**Zod schema** — `src/lib/services/ai/sdk/schemas/classifier.ts`. Key shapes:
`characterUpdateSchema` (`:53-67`, `{name, changes: {status?, relationship?, newTraits?,
removeTraits?, visualDescriptors?}}`), `newCharacterSchema` (`:69-81`), analogous
location/item/storyBeat schemas, `entryUpdatesSchema` (`:157-166`, one array per update/new-entity
kind, each `.default([])`), `sceneSchema` (`:172-186`, `currentLocationName`,
`presentCharacterNames`, `timeProgression: 'none'|'minutes'|'hours'|'days'`), and
`classificationResultSchema = z.object({ entryUpdates, scene })` (`:192-195`). **No body/BE fields
exist today.** `clampNumber()` (`:205-210`) is the only "deterministic function between extraction
and storage" anywhere in this pipeline, and it's a stateless bound-clamp, not a stateful reducer (it
doesn't see the *previous* value).

**How `pack_runtime_variables` dynamically extend the schema** —
`src/lib/services/ai/sdk/schemas/runtime-variables.ts`. `ClassifierService.classify()` loads
`RuntimeVariable[]` for the story's pack (`ClassifierService.ts:86-89`) and picks
`buildExtendedClassificationSchema(runtimeVarsByType)` over the base schema when any exist
(`ClassifierService.ts:93-96`). The builder (`runtime-variables.ts:171-221`) calls `.extend()` on the
base `characterUpdateSchema`/`newCharacterSchema` (and location/item/story-beat equivalents) to inline
new Zod shape keys directly — into `changes` for updates (all-optional, `buildEntityVarsShape(vars,
true)`, line 190) or at the top level for new entities (default-based optionality, line 191). Field
type mapping: `text→z.string()`, `number→z.number()`, `enum→z.union(z.literal(...))` with a
single-option special case (`z.literal()` directly, since `z.union` requires ≥2 members) —
`buildVariableBaseSchema()`, `:63-89`. Post-extraction, `clampRuntimeVarNumbers()`
(`ClassifierService.ts:286-336`) walks every update/new-entity array and clamps numeric values to
`minValue`/`maxValue`.

**Where extracted `characterUpdates` get applied — the exact write site (confirming what the prior pass
could not):** `StoryStore.applyClassificationResult()`, `src/lib/stores/story.svelte.ts:1925`, character
loop at **`:2059-2153`**:

```ts
// story.svelte.ts:2059 (loop) ... 2100-2151 (existing-character branch)
if (existing) {
  const changes: Partial<Character> = {}
  if (update.changes.status) changes.status = update.changes.status
  ...
  if (update.changes.visualDescriptors && ...) changes.visualDescriptors = update.changes.visualDescriptors
  const charInlineVars = extractInlineCustomVars(update.changes as ..., defsByName)
  if (Object.keys(charInlineVars).length > 0) {
    changes.metadata = mergeRuntimeVars(existing.metadata, charInlineVars, defsByName)   // :2137
  }
  const { entity: ownedChar, wasCowed } = await this.cowCharacter(existing)              // :2140 — COW-safety first
  await database.updateCharacter(ownedChar.id, changes)                                  // :2141 — THE WRITE
  this.characters = this.characters.map(c => c.id === ownedChar.id ? { ...c, ...changes } : c)  // :2142-2144
  ...
}
```

New characters (not yet existing) are created first via `database.addCharacter()` (`:2094`) with
`metadata: charMetadata` where `charMetadata = { source: 'classifier', ...mergeRuntimeVars(...) }`
(`:2071-2093`).

**Important correction:** `ClassifierService.ts:312` also contains a `for (const update of
result.entryUpdates.characterUpdates)` loop — but it's inside `clampRuntimeVarNumbers()`
(`ClassifierService.ts:286-336`), a pure in-place numeric clamp on the LLM's raw JSON, called *before*
`classify()` returns the result. It never calls `database.*` and never touches `this.characters`. The
classifier service is a pure extractor end to end; `story.svelte.ts` is the sole applier. This settles
the ambiguity the task brief flagged.

**Whether a deterministic hook exists between extraction and storage:** no. Every classifier-extracted
field is either assigned 1:1 (`status`, `relationship`, `traits`, `visualDescriptors`) or merged
verbatim into `metadata.runtimeVars` (custom variables) — the LLM's extracted value becomes the stored
value directly, modulo the min/max clamp. A BE reducer (`newTier = f(oldTier, extractedEvent)`) is
wholly new machinery; it does not exist anywhere in this pipeline today, confirming the task's premise
that one must be added, at the insertion point identified in §2.3.

---

## 3. World-state delta + undo/branch safety

There are **five** distinct places a `Character`'s state gets serialized for undo/replay/branch
purposes, and they use two structurally different strategies. This is the crux of the storage-choice
question.

### 3.1 The five mechanisms

| Mechanism | Column / type | Built at | Strategy |
|---|---|---|---|
| Checkpoints | `checkpoints.characters_snapshot` (TEXT), `Checkpoint.charactersSnapshot: Character[]` (`types/index.ts:423`) | `StoryStore.createCheckpoint()`, `story.svelte.ts:3128-3155` | **Full-object copy**: `charactersSnapshot: [...this.characters]` (`:3142`) |
| World-state snapshots (periodic) | `world_state_snapshots.characters_snapshot` (TEXT), `WorldStateSnapshot.charactersSnapshot: Character[]` (`types/index.ts:984`) | `StoryStore.maybeCreateAutoSnapshot()`, `story.svelte.ts:3019-3058` | **Full-object copy**: `this.characters.map(c => ({ ...c }))` (`:3041`) |
| CoW branch copy | new `characters` rows, `branch_id`/`overrides_id` set | `StoryStore.createBranchFromCheckpoint()`, `story.svelte.ts:3213-3450+` (both the lightweight/COW path `:3285-3394` and the legacy full-copy path `:3395-3450+`) | **Full-object copy**: `{ ...char, id: crypto.randomUUID(), branchId: branch.id, overridesId: null }` (`:3292-3297`, and `:3401` for legacy) |
| World-state delta / rollback | `story_entries.world_state_delta` (TEXT), `WorldStateDelta.previousState.characters: CharacterBeforeState[]` (`types/index.ts:899-908`, `948-971`) | Capture: `applyClassificationResult`, `story.svelte.ts:1975-1990`. Restore: `RollbackService.restoreUpdatedEntities()`, `rollbackService.ts:196-215` | **Hand-enumerated narrow type**: `{id, name, status, relationship, traits, visualDescriptors, metadata?}` |
| Persisted (cross-session) retry state | `stories.retry_state` (TEXT), `PersistentRetryState.characterSnapshots: PersistentCharacterSnapshot[]` (`types/index.ts:46-77`) | Capture: `ui.svelte.ts:505-512`. Restore: `StoryStore.restoreCharacterSnapshots()`, `story.svelte.ts:4010-4053` | **Hand-enumerated narrow type, no metadata**: `{id, traits, status, relationship, visualDescriptors, portrait}` |

A sixth, same-session-only mechanism exists alongside the fifth: **in-memory retry backup**
(`RetryBackupData.characters: Character[]`, `RetryService.ts:32`), built via `copyCharacters()`
(`ui.svelte.ts:531-536`) — `chars.map(c => ({ ...c, traits: [...c.traits], visualDescriptors:
{...c.visualDescriptors} }))`, a full-object copy with two nested fields explicitly deep-copied.
Restored via `database.restoreRetryBackup()` (`database.ts:1610-1673`), which deletes and recreates
every character/location/item/story-beat for the branch, calling `addCharacter()` per row (`:1638`).

### 3.2 The critical question, answered precisely

**Checkpoints, world-state snapshots, and CoW branch-copy are NOT hand-enumerated at the store (TS)
layer** — all three copy full in-memory `Character` objects via spread (`{...c}` / `[...arr]`). **A
new field on the `Character` interface flows through all three automatically, with zero code change
at the snapshot/checkpoint/branch-copy call sites themselves.**

But those `Character` objects still have to get into `this.characters` from SQL, and back out — and
**that** boundary is 100% hand-enumerated, at exactly three functions in `src/lib/services/database.ts`:

- `mapCharacter(row)` — `:2603-2633` — builds the JS object field-by-field from the raw SQL row
- `addCharacter(character)` — `:842-871` — a literal `INSERT INTO characters (id, story_id, name,
  ...)` column list and a matching positional-parameter array
- `updateCharacter(id, updates)` — `:873-943` — a chain of `if (updates.X !== undefined) { setClauses.push('x
  = ?'); values.push(...) }` per field

**A new dedicated `body_state` column would be silently dropped** — never read into the app, never
written to SQL — unless all three of these are edited by hand. **`metadata` is already one of the
fields in all three** (`mapCharacter:2619`, `addCharacter:857`, `updateCharacter:906-909`) — so
choosing `metadata.bodyState` means **none of these three functions need to change at all**. This is
the single biggest lever for keeping the diff small (§8).

**The rollback/undo path is hand-enumerated at two more sites**, independent of the database-layer
question above: the capture (`story.svelte.ts:1975-1990`, which explicitly lists `id, name, status,
relationship, traits, visualDescriptors, metadata`) and the restore
(`rollbackService.ts:202-215`, which calls `database.updateCharacter(charBefore.id, {status,
relationship, traits, visualDescriptors, ...(metadata conditionally)})`). **`metadata` is already in
both lists.** A dedicated column is *not* — it would need explicit additions at both sites, or its
changes silently survive a rollback intact (the opposite of what rollback is for).

**The persisted cross-session retry path is the one real gap, and it exists independent of storage
choice.** `PersistentCharacterSnapshot` (`types/index.ts:70-77`) was designed without a `metadata`
field at all — confirmed by reading the type definition directly, not inferred. This means
`metadata.runtimeVars` **already** does not survive this specific path today, for the shipped runtime-
variables feature — this is a pre-existing, accepted limitation, not something BE introduces. BE
inherits it if it uses `metadata`; a dedicated column would face the identical gap (it isn't in this
type either) and would need the same fix if one is ever wanted (add a field to
`PersistentCharacterSnapshot`, its capture site, and its restore site).

**Net verdict vs. a new column: `metadata.bodyState` is strictly safer and strictly less code.** It
already round-trips through the DB layer, already survives rollback capture/restore, and already
survives checkpoints/snapshots/CoW-copy/in-memory-retry — for free, by construction, because those are
all full-object-copy paths. The one gap it has (cross-session retry) is a gap the codebase already
lives with for an existing shipped feature.

### 3.2a The third option: using the pack runtime-variables *system* itself, not just its pattern

The task brief named three storage options — new column, `metadata`, and the runtime-variables table
(`pack_runtime_variables`/`RuntimeVariable` rows). §3.2 above compares the first two; this section
completes the picture by evaluating the third **as a system**, not merely as a pattern to imitate.

Concretely: could `tier`/`fullness` simply be *defined* as pack-level `RuntimeVariable` rows (entity
type `character`, `variableType: 'number'`, `minValue`/`maxValue` set), and let the existing
`metadata.runtimeVars` + classifier-schema-extension + `clampNumber()` + `RuntimeVariableDisplay`
machinery carry them end to end, with no new BE-specific code at all?

**On snapshot safety, this does not discriminate against `metadata.bodyState` — it's a tie.** Runtime
variable values live at `character.metadata.runtimeVars` (`packs/types.ts:100-112`), which is a
sub-key of the same `metadata` column already argued safe in §3.2: it survives the same four
mechanisms for the same structural reason (full-object copies at the store layer, already a mapped
column at the DB layer, already present in `CharacterBeforeState`), and is subject to the identical
cross-session-retry gap. Whichever of "option 2" or "option 3" is picked, the safety analysis is
unchanged, because they're the same JSON column underneath.

**What actually decides against option 3 is the deterministic-reducer requirement, and §2.4 already
proves the disqualifying fact.** The runtime-variables system has exactly one write mode: the LLM
states the new absolute value directly in its structured output, and the only server-side processing
applied to it is `clampRuntimeVarNumbers()` → `clampNumber()` (`ClassifierService.ts:286-336`,
`classifier.ts:205-210`) — a stateless bound-clamp that never reads the *previous* value. There is no
`f(oldTier, extractedEvent) → newTier` hook anywhere in that path; confirmed directly in §2.4
("Whether a deterministic hook exists between extraction and storage: no"). A BE engine that wants the
LLM to report discrete *events* ("a growth beat happened," "she was milked") and a deterministic
function to compute the resulting tier cannot be expressed as a pack runtime variable — the system is
structurally built for LLM-sets-the-value-directly, which is precisely the drift-prone pattern the
portable spec (`31a-be-engine-portable-spec.md` §1.1) identifies as the root cause of every prior
era's worst bugs ("a **derived** display value... was allowed to live as if it were independent,
hand-tunable data"). Piling a deterministic reducer on top of the runtime-variables system would mean
either fighting its LLM-writes-directly assumption or maintaining a shadow value outside it — worse on
both counts than a bespoke `metadata.bodyState` write path with its own reducer.

A second, smaller disqualifier: `RuntimeVariableType` is `'text' | 'number' | 'enum'` only —
**"No boolean -- only text, number, enum per user decision"** (`packs/types.ts:78`, a documented,
deliberate constraint). The "lock" toggle the task asks for has no native slot in that type system
(§6.4 covers the UI-level workaround, which is moot anyway once BE isn't routed through this system).

**Conclusion:** reuse the runtime-variables system's *storage location and patterns* (`metadata`,
keyed sub-objects, an editor/display component pair) — reject the *system itself* as the mechanism,
because BE needs a stateful reducer the runtime-variables system cannot host without contradicting its
own design.

### 3.3 A caveat that matters for how the reducer must be written

The before-state capture explicitly deep-copies nested objects it snapshots — `visualDescriptors:
{...existing.visualDescriptors}`, `metadata: existing.metadata ? {...existing.metadata} : null`
(`story.svelte.ts:1986-1987`) — precisely because a shallow top-level `{...existing}` would leave the
"before" snapshot's nested objects pointing at the *same reference* as the live object. **A BE reducer
must never mutate `character.metadata.bodyState` in place** (e.g. `character.metadata.bodyState.tier
+= 1`); it must always produce a new object, matching the codebase's universal immutable-update
convention (also called out explicitly in a comment about Svelte 5 `$state` reactivity requiring
new-array/new-object replacement rather than mutation, `ui.svelte.ts:515-525`). In-place mutation here
would silently corrupt already-captured rollback snapshots, not just fail to trigger reactivity.

### 3.4 Retries specifically

Two independent paths, chosen by `backup.hasFullState` (`RetryService.ts:112-129`):

- **`hasFullState: true`** (same-session, `ui.svelte.ts:567`) — full `Character[]` objects
  (`copyCharacters()`, `ui.svelte.ts:531-536`), routed through `restoreFullState()` →
  `database.restoreRetryBackup()` (`database.ts:1610`) → `addCharacter()` per row. A new field
  survives the in-memory copy for free; still needs `addCharacter` to include it (moot for
  `metadata`, per §3.2).
- **`hasFullState: false`** (persisted, `ui.svelte.ts:751`, loaded from `stories.retry_state` after
  an app restart) — the narrow `PersistentCharacterSnapshot`, routed through
  `restorePersistentState()` → `restoreCharacterSnapshots()` (`story.svelte.ts:4010-4053`) →
  per-character `database.updateCharacter()` calls with only `{traits, status, relationship,
  visualDescriptors, portrait}`. This is the one path that drops `metadata` (and thus `bodyState`)
  regardless of storage choice — see §3.2's gap discussion.

---

## 4. Template exposure

### 4.1 Where `runtimeVars_characters` actually gets built

`ContextBuilder` (`src/lib/services/context/context-builder.ts`) is a flat variable bag: services call
`.add(data)` (`:103-106`) to merge key/value pairs, then `.render(templateId)` (`:111-143`) fetches a
`pack_templates` row and renders it through LiquidJS against the accumulated context. The static
factory `ContextBuilder.forStory(storyId)` (`:33-98`) pre-populates story/protagonist/location/time
context, then calls the private method that matters here:

```ts
// context-builder.ts:185-284 (loadRuntimeVariableContext), called at :89
private async loadRuntimeVariableContext(characters, locations, items, storyBeats, protagonist) {
  const defs = await database.getRuntimeVariables(this.packId)
  ...
  const formatEntities = (entities, entityType) => {
    // per entity: "EntityName: VarLabel = value, VarLabel = value", reading entity.metadata.runtimeVars
  }
  this.add({
    runtimeVars_characters: formatEntities(characters, 'character'),   // :258
    runtimeVars_locations: ...,
    runtimeVars_items: ...,
    runtimeVars_storyBeats: ...,
    runtimeVars_protagonist: ...,
  })
}
```

`KNOWN_VARIABLES` (`src/lib/components/settings/tabs/story-settings.svelte:13-38`) and
`VARIABLE_REFERENCE` (`:40-77`) are a **documentation/validation registry only** — they tell the
custom-system-prompt editor UI which `{{ variableName }}` tokens are recognized and warn on unknown
ones (`:128`). They do not drive what data gets built; that's entirely `context-builder.ts`.

### 4.2 A finding the task brief didn't anticipate: this variable is effectively inert today

`grep -rn "runtimeVars_" src/lib/services/prompts/` returns **zero matches inside
`templates/`.** Neither shipped narrative template (`prompts/templates/narrative.ts`, the `'adventure'`
and `'creative-writing'` `PromptTemplate`s) references `runtimeVars_characters` or any per-character
context block at all — the only character-related variable used repeatedly is `{{ protagonistName }}`
(for POV/tense phrasing), plus a conditional `{{ inlineImageInstructions }}` (`narrative.ts:125,293`,
gated by `{% if inlineImageMode %}`). The classifier template (`prompts/templates/analysis.ts`, id
`'classifier'`) uses a **separate, bespoke** character-context string instead: `Characters: {{
existingCharacters }}` (`analysis.ts:147`), built by `ClassifierService.formatExistingCharacters()`
(`ClassifierService.ts:341-355` — name/relationship/status/visualDescriptors, no metadata/runtimeVars
at all), plus `{{ customVariableInstructions }}` (`analysis.ts:154-155`, built by
`ClassifierService.buildCustomVarInstructions()`, `:221-280`) — which describes *what to extract*, not
current values.

**Practical implication:** `runtimeVars_characters` is a power-user-only hook, reachable only through a
story's `customSystemPrompt` override (`StorySettings.customSystemPrompt`, `types/index.ts:120`). It
does not influence out-of-the-box narration or classification today. A `beState_characters` variable
built the identical way would inherit this same inertness. For BE state to actually ground the
narrative model's word choice — the entire point, since the `<pic>` tag instructions currently say
"matching the story's canon" with zero injected ground truth (§5) — the **default template content
itself** needs a small edit, not just a new context variable.

### 4.3 Recommended shape

1. Add a method to `ContextBuilder` mirroring `loadRuntimeVariableContext()`, reading
   `character.metadata.bodyState` instead of `.runtimeVars`, `this.add({ beState_characters: ... })`.
2. Register the name in `story-settings.svelte`'s `KNOWN_VARIABLES`/`VARIABLE_REFERENCE` (cosmetic —
   avoids a false "unknown variable" warning for custom-prompt authors).
3. **Splice `{{ beState_characters }}` into the shipped `narrative.ts` template bodies** (near the
   existing `{% if inlineImageMode %}{{ inlineImageInstructions }}{% endif %}` line) so it's live by
   default.
4. Extend `ClassifierService.formatExistingCharacters()` (`ClassifierService.ts:341-355`) to append a
   body-state summary per character, so the classifier's own judgment about growth *magnitude* is
   grounded in the current tier, not just guessing from conversation history.

---

## 5. Image path touchpoint

### 5.1 What exists today: model-instruction-only, zero grounding

`NarrativeService.ts:42-78` (`INLINE_IMAGE_INSTRUCTIONS`, injected via `{{ inlineImageInstructions }}`
when `imageGenerationMode === 'inline'`) instructs the *narrative-writing* LLM — in the same call that
produces the story prose — to prepend a content-rating word and:

> "For every female character, ALWAYS state her current breast size using one of these bands,
> matching the story's canon: flat chest / small breasts / medium breasts / large breasts / huge
> breasts / gigantic breasts / hyper breasts — body-size continuity is critical" (`:61`)

There is **no injected ground truth** backing "the story's canon" — per §4.2, the default narrative
template has no character-state block at all, so the model is relying purely on its own attention over
prior narration text. This instruction is young code: two same-day commits (2026-07-16) —
`ae24bc1d` ("Illustrious booru style + rating/body-tag prompt dialect") then `37dbc92a` ("retune image
wiring for the bridge's actual Krea 2 workflow (not WAI)") — show it being actively re-tuned against
the real deployed bridge's actual text encoder, i.e. this is a live, moving target, not stable legacy.

### 5.2 The `__betier_<N>__` marker: confirmed NOT present in this repo

Exhaustive case-insensitive grep (`grep -rin "betier" .` across `.ts/.svelte/.json/.md/.rs`, excluding
`node_modules`) returns **zero matches** in any current file. The convention is referenced exactly
once, in the **commit message** of `37dbc92a` (not in any file content):

> "the deployed bridge routes the A1111 shim to krea2_turbo with a Qwen3-VL-4B text encoder
> (LLM-class)... and the `__betier__` cup dial maps to size PHRASES server-side"

This documents Ben's own inference (from PNG workflow metadata on the deployed bridge) about how the
**external** SI-bridge/si-animator-bridge server — a separate service, not part of this repo, referenced
elsewhere as `~/dev/si-animator-bridge` — maps a tier to a phrase. **Nothing in the Aventuras client
currently emits a `__betier_N__`-shaped token.** The client-side reality is exactly the natural-language
band words in §5.1. If exact server-side tier control via a literal marker is wanted, it must be
introduced net-new on the client side, and its acceptance by the bridge cannot be verified from this
repo (§9 risk 6).

### 5.3 Where a programmatic append/override would go

`InlineImageGenerationService.generateImageForTag()`, `src/lib/services/ai/image/InlineImageService.ts:102-208`,
specifically the prompt assembly at **`:163-165`**:

```ts
// Build full prompt with style
const stylePrompt = await this.getStylePrompt(imageSettings.styleId)
const fullPrompt = `${tag.prompt}. ${stylePrompt}`
```

`tag.prompt` is the LLM-authored `<pic prompt="...">` string (`ParsedPicTag`,
`src/lib/utils/inlineImageParser.ts:8-19`, extracted by `extractPicTags()`). `tag.characters` (names
from the tag's `characters` attribute) is **already** cross-referenced against
`context.presentCharacters: Character[]` a few lines earlier, for portrait-reference lookup
(`InlineImageService.ts:116-133`) — meaning full `Character` objects, which would carry `bodyState`
once added, are already in scope at this exact call site. A deterministic override would: for each
named-and-present female character, look up `character.metadata.bodyState.tier`, map through a
canonical tier→band (or tier→`__betier_N__`) table, and splice the result into `fullPrompt` here —
either replacing whatever the LLM wrote or appending an authoritative restatement.

`context.presentCharacters` traces back to `ctx.worldState.characters.filter(c =>
names.includes(c.name))` in `GenerationPipeline.buildImageInput()` (`GenerationPipeline.ts:283-286`)
and to `story.characters.filter(...)` in `ActionInput.svelte:642-646` — both **already-updated**
(post-`applyClassificationResult`) in-memory arrays, since the image-context capture at
`ActionInput.svelte:632-664` runs after `story.applyClassificationResult()` at line 638 completes. If
the BE reducer runs where §2.3 recommends (inside `applyClassificationResult`), its output is current,
not stale, by the time this code runs.

### 5.4 Portraits (secondary touchpoint, not traced to the same depth)

A separate generation path exists (`imagePortraitGenerationTemplate`, referenced in
`src/lib/services/prompts/templates/image.ts`, triggered from `CharacterPanel.svelte`'s portrait
affordance and `imageStore.svelte.ts`). This would need the analogous treatment — a character's own
portrait prompt should reflect their own current tier — but the exact prompt-assembly call site was not
traced to file:line depth in this pass; flagged as unverified (§9 risk 5).

---

## 6. Character UI

### 6.1 Primary editor: `CharacterPanel.svelte`

`src/lib/components/world/CharacterPanel.svelte` (1051 lines) is the World → Characters editor. Local
edit-mode `$state` is seeded in `startEdit()` (`:206-219`) and committed in `saveEdit()` (`:234-270`)
via `story.updateCharacter(character.id, {...})` (`:258-267`) — the store-level wrapper (COW-aware,
in-memory-array-updating) that everything else in this report already traces through.

### 6.2 The visual-descriptors pattern (the thing the task asks to copy)

Not a dedicated editor component — a single-line text `<Input>` bound to a plain string
(`editVisualDescriptors`, e.g. `"Face: pale skin, Hair: long brown"`), converted to/from the structured
`VisualDescriptors` object by two pure functions in `src/lib/utils/visualDescriptors.ts`:
`descriptorsToString()` (`:33-43`) and `stringToDescriptors()` (`:48-64`, regex category-prefix
parsing: `/\b(Face|Hair|Eyes|Build|Clothing|Accessories|Distinguishing):\s*/gi`). These same two
functions are reused verbatim by the **Vault** editor (`VaultCharacterFormFields.svelte:3,28,43-58`) —
confirmed as the actual single-source-of-truth utility shared between in-story and vault editing. A
numeric body-state UI doesn't need this string-parsing pattern (numbers are simpler than free-text
categories), but the "one small pure-function util, reused by both editors" *shape* is the pattern
worth copying.

### 6.3 `RuntimeVariableEditor`/`RuntimeVariableDisplay` — the closest existing per-character stat UI

Both in `src/lib/components/world/`:

- **`RuntimeVariableEditor.svelte`** (203 lines) — one variable at a time. `Props { definition:
  RuntimeVariable, currentValue: string | number | null, onChange }`. Renders `<Input type="text">`,
  `<Input type="number" min={definition.minValue} max={definition.maxValue}>`, or a `<Select.Root>`
  (enum) based on `definition.variableType` (`:166-201`), with an icon from a `lucide-svelte` name-keyed
  map or a text label fallback.
- **`RuntimeVariableDisplay.svelte`** (254 lines) — a list wrapper. `Props { definitions:
  RuntimeVariable[], values: RuntimeVarsMap | undefined, onValueChange?, editMode?, pinnedOnly? }`. In
  edit mode, renders a vertical stack of `RuntimeVariableEditor`s (`:164-173`). In display mode, renders
  colored stat rows with icon/label + right-aligned value, and — directly relevant to a "tier slider" —
  **a full-width progress bar is already a first-class rendering mode** for any number-type variable
  with min/max set: `width: {getProgressPercent(def, rawVal)}%` (`:230-242`). A fullness-0-100 or
  tier-0-60 bar needs zero new component code, just a `RuntimeVariable`-shaped definition object.

Wiring in `CharacterPanel.svelte`: edit mode at `:642-653` (`values={editRuntimeVars}`,
`editMode={true}`); pinned/always-visible display at `:944-951`
(`values={character.metadata?.runtimeVars as RuntimeVarsMap}`, `pinnedOnly={true}`); collapsible
non-pinned display at `:932-939` (`pinnedOnly={false}`). The read source in all three cases is
`character.metadata?.runtimeVars` — confirming `metadata` as the live wiring point end-to-end: the
edit buffer is seeded from `character.metadata?.runtimeVars` (`:217-218`) and committed back into
`character.metadata.runtimeVars` inside `saveEdit()` (`:245-256`).

**A BE panel (tier slider, fullness, lock toggle) should follow this exact shape**: a `BodyStateEditor`
component analogous to `RuntimeVariableEditor` (or literally parameterized the same way, if the tier/
fullness/lock fields are modeled as a small fixed array of `RuntimeVariable`-shaped definitions), reading
from and writing to `character.metadata.bodyState`.

### 6.4 The one real gap, and it's already closed

`RuntimeVariableType` is explicitly `'text' | 'number' | 'enum'` — **"No boolean -- only text,
number, enum per user decision"** (`src/lib/services/packs/types.ts:78`, a documented, deliberate
constraint of that adjacent system). A BE "lock" toggle doesn't fit it. But this doesn't block anything:
**`$lib/components/ui/` already has `switch/`, `checkbox/`, and `slider/` primitives** (confirmed via
directory listing), the same UI kit `CharacterPanel.svelte` already imports `Input`/`Button`/`Label`
from. A bespoke small BE panel section can use `<Slider>` for tier/fullness and `<Switch>` for the lock,
without needing to route through the runtime-variable system's boolean limitation at all.

### 6.5 Vault editor

`VaultCharacterFormFields.svelte` (241 lines) + `VaultCharacterForm.svelte` edit a
`VaultCharacterInput` (name/description/traits/visualDescriptors/portrait/tags), reusing
`descriptorsToString`/`stringToDescriptors` (§6.2). `VaultCharacter` does have a `metadata:
Record<string, unknown> | null` field (`types/index.ts:204`), so it *could* carry a "starting body
state" default — but per migration `016`'s own comment, **"Characters are copied to stories (no sync
back)"** (`016_character_vault.sql:2`), the vault is a copy-out template source, not a live state
mirror. Live per-turn `bodyState` should never write back into a vault entry; at most, a vault
character could seed an *initial* tier for new stories built from it.

---

## 7. Settings surface

### 7.1 Per-story: `StorySettings`

`types/index.ts:108-121`:

```ts
export interface StorySettings {
  model?: string
  temperature?: number
  maxTokens?: number
  pov?: POV
  tense?: Tense
  tone?: string
  themes?: string[]
  visualProseMode?: boolean
  imageGenerationMode?: 'none' | 'agentic' | 'inline'
  backgroundImagesEnabled?: boolean
  referenceMode?: boolean
  customSystemPrompt?: string
}
```

Stored as one JSON blob in `stories.settings` (`001_initial.sql:12`, `TEXT` column, no dedicated
sub-columns) — `database.updateStory()`/`getStory()` `JSON.stringify`/`parse` the whole object.

### 7.2 `imageGenerationMode`'s wiring pattern — the template to copy for a per-story BE toggle

Three independent call sites, all binding to a shared `imageGenerationMode` value /
`onImageGenerationModeChange` callback prop pair on what is evidently one shared sub-component:

- **Editing an existing story:** `story-settings.svelte:174,181` —
  `imageGenerationMode={storySettings.imageGenerationMode ?? 'none'}`,
  `onImageGenerationModeChange={(v) => story.updateStorySettings({ imageGenerationMode: v })}`
- **New-story wizard:** `SetupWizard.svelte:371-372` — bound to `wizard.narrative.imageGenerationMode`
- **SillyTavern import wizard:** `STImportWizard.svelte:160,172` — bound to `wizard.imageGenerationMode`

A per-story BE toggle (e.g. `beEnabled?: boolean`) would add a field to `StorySettings` and wire these
same three call sites identically.

### 7.3 Global alternative precedent

`settings.experimentalFeatures` (`src/lib/stores/settings.svelte.ts`) is the pattern for an app-wide
(not per-story) opt-in flag — `ExperimentalFeatures`, defaults at `:808-818`:

```ts
export function getDefaultExperimentalFeatures(): ExperimentalFeatures {
  return {
    stateTracking: false,
    rollbackOnDelete: false,
    lightweightBranches: false,
    autoSnapshotInterval: 20,
    backgroundGeneration: false,
    generationNotifications: false,
    notificationPreview: false,
  }
}
```

Persisted via `database.setSetting('experimental_features', JSON.stringify(...))`
(`settings.svelte.ts:2623`) into the global `settings` key/value table (`001_initial.sql:93-96`), edited
via `ExperimentalSettings.svelte`.

**Recommendation:** per-story (§7.2 pattern) is the better fit — BE is genre-specific, relevant to some
stories and not others, exactly like `imageGenerationMode`. But note the dependency this creates: the
undo-safety machinery a BE reducer needs (§3) is itself gated behind the **global**
`stateTracking`/`lightweightBranches` flags, both default-off. A story with BE enabled but the global
flags off gets a working feature with *weaker* undo protection than the analysis in §3 assumes — worth
a warning in the BE settings UI if the global flags are off when BE is turned on per-story.

---

## 8. Divergence cost

### 8.1 Files the feature cannot avoid touching

Aventuras has no plugin/hook/extension-point system — no event-subscription API, no middleware
registration in `GenerationPipeline` or `ClassifierService` beyond the fixed phase list,
`PipelineDependencies` is a closed interface, not an extensible registry. This is a fork-and-patch
integration, not a plugin. The unavoidable touch points:

1. **`src-tauri/migrations/` + `src-tauri/src/lib.rs`** — only if a dedicated column is chosen; **zero
   new migration needed** if piggybacking on `metadata` (§1.4, §3.2), since `metadata` already exists
   as a column on both `characters` and `character_vault`.
2. **`src/lib/stores/story.svelte.ts`** (4,350 lines — the largest store file, and the file every other
   section of this report converges on) — `applyClassificationResult()` needs a new code block (§2.3).
   Unavoidable: this is where world-state mutation and undo bookkeeping already live; reimplementing
   that elsewhere would mean a parallel, inconsistent undo system.
3. **`src/lib/services/ai/sdk/schemas/classifier.ts` and/or `runtime-variables.ts`** — the classifier
   schema must be extended to extract BE-relevant signals (§9 risk 1 — Zod strips unknown keys).
4. **`src/lib/services/context/context-builder.ts`** + the shipped `prompts/templates/narrative.ts`
   and `prompts/templates/analysis.ts` content strings — for default (not opt-in-only) template
   exposure (§4.3).
5. **`src/lib/services/ai/generation/NarrativeService.ts`** and/or
   **`src/lib/services/ai/image/InlineImageService.ts`** — image grounding (§5.3).
6. **`src/lib/components/world/CharacterPanel.svelte`** (1,051 lines) — the BE panel UI (§6.3).
7. **`types/index.ts` `StorySettings`** + **`story-settings.svelte`** + **`SetupWizard.svelte`** +
   **`STImportWizard.svelte`** — the per-story toggle, three call sites (§7.2).

### 8.2 What genuinely stays self-contained

A new `src/lib/services/be/` module can hold everything **computational**: the pure deterministic
reducer function(s) (tier math, band-word lookup tables), a Zod schema-extension builder mirroring
`buildExtendedClassificationSchema`, and a typed `metadata.bodyState` read/write helper analogous to
`mergeRuntimeVars()`. None of this needs to live inside `story.svelte.ts` itself — only the *call* to
it does.

### 8.3 Upstream-rebase friction

`story.svelte.ts` is the highest-friction file — both because it's already the largest store file and
because `applyClassificationResult` is exactly the function upstream has been actively extending
(the CoW/runtime-variables migrations cluster at versions 025-032, all landing in what reads as one
recent upstream development arc, immediately followed by Ben's own fork-specific commits). Next
highest: `context-builder.ts`, `runtime-variables.ts`, and `CharacterPanel.svelte` — all recently-active
files by the same evidence. Migrations themselves are low friction (additive, sequential; a version-
number collision with a new upstream migration is a trivial renumber) — and, per §1.4/§3.2, may not be
needed at all.

### 8.4 Test infrastructure — confirmed absent

`package.json` scripts: `dev, build, preview, check (svelte-check), check:watch, tauri, release, lint,
lint:fix, format` — **no test script.** `find . -iname "*.test.ts" -o -iname "*.spec.ts"` (excluding
`node_modules`) returns zero files. No `vitest.config.*`, `jest.config.*`, or `playwright.config.*`
anywhere in the repo. This confirms the task brief's premise.

**Recommendation: vitest.** It shares Vite's transform pipeline and config (SvelteKit already runs on
Vite — `package.json` devDependencies include `@sveltejs/vite-plugin-svelte`), needs no new bundler,
and has first-class TS support. Zod is already a runtime dependency (`^3.25.76`), so the pure reducer
function and the schema-extension builder — the exact surface a deterministic BE engine wants unit-
tested — can be tested in complete isolation from Tauri, the DB, and Svelte components, as plain
`import`-and-`expect()` tests. It would be a devDependency-only addition with zero runtime footprint.
A plain `node --test` + `tsx` runner is a viable zero-dependency fallback if even vitest is considered
too much new surface, but vitest is the lower-friction choice given the existing Vite toolchain.

---

## 9. Risks / unknowns

1. **Zod v3 strips unknown object keys by default, confirmed by how the codebase itself works around
   it.** `buildExtendedClassificationSchema` (`runtime-variables.ts:171-221`) explicitly `.extend()`s
   the Zod shape with named keys rather than relying on `.passthrough()`; `extractInlineCustomVars`
   (`runtime-variables.ts:227-238`) then filters the *already-validated* object down to known variable
   names. Any BE classifier fields must go through this same shape-extension mechanism — an ad-hoc
   field bolted onto `characterUpdateSchema` outside this pattern would be silently dropped by
   `generateStructured()`'s Zod parse before `applyClassificationResult` ever sees it. This is the
   identical failure class already documented in this project's own `ambrosia-st/CLAUDE.md` for a
   *different* platform (MVU's `partnerMemberSchema` missing `.passthrough()` silently stripped BE
   fields on SillyTavern) — a recurring landmine across platforms, now independently confirmed to apply
   here too.

2. **Svelte 5 `$state` + shallow-copy discipline is convention, not enforcement.** The before-state
   capture at `story.svelte.ts:1986-1987` explicitly deep-copies `visualDescriptors`/`metadata`
   specifically to avoid aliasing a mutable nested object into a snapshot. This is maintained by
   consistent hand-written style across the codebase, not by the type system or a runtime guard. A BE
   reducer that mutates a nested `bodyState` object in place instead of replacing it would silently
   corrupt already-captured rollback snapshots (§3.3) — a bug class that would pass a shallow code
   review and only surface as "rollback doesn't actually revert body state."

3. **No migration rollback exists anywhere in this codebase.** All 35 `Migration` entries in `lib.rs`
   use `kind: MigrationKind::Up` only; the `_sqlx_migrations` ledger is forward-only. A shipped
   `body_state` column (if that route were chosen over `metadata`) is a one-way door on a user's
   existing DB — reverting it needs a hand-written new forward migration or manual SQL surgery, not
   anything this repo's tooling provides. (This risk mostly evaporates with the `metadata`-only
   recommendation, since no new migration is needed at all.)

4. **`stateTracking`/`lightweightBranches` default OFF, confirmed off in Ben's own live install.**
   Neither `getDefaultExperimentalFeatures()` (`settings.svelte.ts:808-818`) nor a query against Ben's
   live app DB (`SELECT value FROM settings WHERE key='experimental_features'` → no row at all) shows
   these enabled. Most of §2's and §3's undo-safety analysis is conditional on a user having explicitly
   opted into these global flags; the common/default configuration gets a simpler, less-protected
   world-state-delta-free experience.

5. **Portrait-generation image path not traced to file:line depth.** A second `<pic>`-adjacent surface
   (`imagePortraitGenerationTemplate` in `prompts/templates/image.ts`, triggered from
   `CharacterPanel.svelte`) exists but its exact prompt-assembly call site was not verified with the
   same rigor as inline images (§5.4) — time-boxed out of this pass.

6. **The `__betier_<N>__` marker's server-side behavior is unverifiable from this repo.** Its existence
   is confirmed only as a design note in a commit message describing an *external* service
   (si-animator-bridge) that this checkout has no visibility into. Whether the bridge actually parses
   such a token, in what format, is a question for that other codebase, not this one (§5.2).

7. **`RuntimeVariableType` deliberately excludes booleans** ("per user decision," `packs/types.ts:78`)
   — a considered constraint in the adjacent system. The BE lock toggle doesn't need to fight this,
   since `ui/switch` exists independently (§6.4), but it's worth knowing this was a deliberate choice
   elsewhere in the codebase, not an oversight.

8. **LiquidJS undefined-variable behavior not independently verified.** `context-builder.ts:195-201`
   and `:276-282` both explicitly fall back to empty strings (`runtimeVars_characters: ''`, etc.) when
   no runtime variables are defined or the context load fails — consistent with LiquidJS's typical
   default of rendering an undefined variable as an empty string — but this was inferred from the
   codebase's own defensive fallback pattern, not confirmed against LiquidJS's own documentation or a
   test in this pass.
