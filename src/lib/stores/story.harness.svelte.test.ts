/**
 * Store harness foundation (CR-1 prerequisite, research/54).
 *
 * Proves the runes StoryStore can be instantiated and DRIVEN through a real write
 * path with a recording DB mock. This is the base the CR-1 turn-atomicity tests
 * build on (drive applyClassificationResult with tracking ON, fail the delta write,
 * assert all-or-nothing once the turn is wrapped in a transaction).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  makeCharacter,
  makeClassificationResult,
  makeDbRecorder,
  makeGirlWithBodyState,
  makeProtagonist,
  makeSettings,
  makeStory,
  makeUi,
  type DbRecorder,
} from './__harness__/storeHarness'

const db = makeDbRecorder()
const settingsMock = makeSettings()
const uiMock = makeUi()

vi.mock('$lib/services/database', () => ({ database: db.database }))
vi.mock('$lib/services/rollbackService', () => ({ rollbackService: {} }))
vi.mock('$lib/services/ai', () => ({ aiService: {} }))
vi.mock('$lib/services/grammar', () => ({ grammarService: {} }))
vi.mock('$lib/services/lorebookImportExport', () => ({ LorebookImportExport: {} }))
vi.mock('$lib/services/tokenizer', () => ({ countTokens: () => 0 }))
vi.mock('./settings.svelte', () => ({ settings: settingsMock }))
vi.mock('./ui.svelte', () => ({ ui: uiMock }))

const { story } = await import('./story.svelte')

// Reset the mutable pieces of the shared singleton between tests.
function reset(recorder: DbRecorder) {
  recorder.calls.length = 0
  // failOn installs a persistent failure on the shared recorder — clear it, or a
  // later test inherits the previous one's mid-turn write failure.
  recorder.clearAllFailures()
  story.currentStory = makeStory() as never
  story.characters = [] as never
  story.locations = [] as never
  story.items = [] as never
  story.storyBeats = [] as never
  story.entries = [] as never
  story.chapters = [] as never
  story.branches = [] as never
}

describe('store harness — drive a real write path (CR-1 foundation)', () => {
  beforeEach(() => {
    settingsMock.experimentalFeatures.stateTracking = false
    settingsMock.experimentalFeatures.rollbackOnDelete = false
    reset(db)
  })

  it('applyClassificationResult drives a character update through database.updateCharacter', async () => {
    story.characters = [makeCharacter('Aria')] as never

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    await story.applyClassificationResult(result as never, 'entry-1')

    expect(db.methodsCalled()).toContain('updateCharacter')
    // The in-memory character reflects the new trait.
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits).toContain('brave')
  })

  it('buffers entity writes then the delta inside a write batch, flushed by commitWriteBatch (CR-1 seam)', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    const beginIdx = methods.indexOf('beginWriteBatch')
    const charWriteIdx = methods.indexOf('updateCharacter')
    const deltaWriteIdx = methods.indexOf('updateStoryEntry')
    const commitIdx = methods.indexOf('commitWriteBatch')
    // The whole turn is bracketed: beginWriteBatch → entity write → delta write
    // (last) → commitWriteBatch (atomic flush). No abort on the happy path.
    expect(beginIdx).toBeGreaterThanOrEqual(0)
    expect(charWriteIdx).toBeGreaterThan(beginIdx)
    expect(deltaWriteIdx).toBeGreaterThan(charWriteIdx)
    expect(commitIdx).toBeGreaterThan(deltaWriteIdx)
    expect(methods).not.toContain('abortWriteBatch')
  })

  it('CR-1 atomicity: a failed batch flush (commitWriteBatch) rolls the whole turn back and returns false', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // The atomic flush throws (the Rust transaction failed / rolled back). Every
    // write was buffered, so nothing persisted.
    db.failOn('commitWriteBatch')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // The turn opened a batch, buffered the entity + delta writes, then the flush
    // failed → abort + in-memory revert.
    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('commitWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(applied).toBe(false)
    // Aria still exists (snapshot restore, not a wipe) and does NOT carry the
    // un-persisted trait.
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria).toBeDefined()
    expect(aria?.traits ?? []).not.toContain('brave')
  })

  it('CR-1 atomicity: a logic/write error inside the turn aborts before the flush', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // A write throws during the turn. In transactional mode wrapUpdate rethrows on
    // the first failure instead of swallowing it, aborting before commit.
    db.failOn('updateCharacter')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // Aborted before the delta write and before the flush; batch discarded.
    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('updateStoryEntry')
    expect(methods).not.toContain('commitWriteBatch')
    expect(applied).toBe(false)
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
  })

  it('CR-1 atomicity: a failed delta write (updateStoryEntry) rolls the whole turn back', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // The delta is the LAST write in the turn; it has no local try/catch, so its
    // failure must propagate out of runWrites and abort before the flush.
    db.failOn('updateStoryEntry')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('updateCharacter') // buffered, never flushed
    expect(methods).toContain('updateStoryEntry')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('commitWriteBatch')
    expect(applied).toBe(false)
    // Both the entity mutation and the in-memory delta are reverted.
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
    expect(story.entries.find((e) => e.id === 'entry-1')).toBeUndefined()
  })

  it('CR-1 atomicity: a beMode turn rolls the engine writes back on a failed flush', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const protagonist = makeProtagonist('Rowan')
    const girl = makeGirlWithBodyState('Mira')
    story.characters = [protagonist, girl] as never
    // Pre-turn values the rollback must restore: no RPG sheet yet (the turn's
    // creation grant writes one) and her seeded body state (the reducer grows it).
    const protagonistMetadataBefore = protagonist.metadata
    const girlMetadataBefore = structuredClone(girl.metadata)

    // A catalyst event drives the BE reducer; the protagonist's sheet write comes
    // from applyRpgTurn's one-time starting grant. Both run inside runWrites.
    const result = makeClassificationResult({
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      scene: { presentCharacterNames: ['Mira'] },
    })

    db.failOn('commitWriteBatch')
    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // The engine did write (buffered) — then the flush failed and the turn aborted.
    const methods = db.methodsCalled()
    expect(methods).toContain('updateCharacter')
    expect(methods).toContain('commitWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(applied).toBe(false)
    // Both engine mutations reverted to their pre-turn values.
    expect(story.characters.find((c) => c.name === 'Rowan')?.metadata).toEqual(
      protagonistMetadataBefore,
    )
    expect(story.characters.find((c) => c.name === 'Mira')?.metadata).toEqual(girlMetadataBefore)
  })

  it('beMode without a failure commits the engine writes (control for the rollback case)', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const girl = makeGirlWithBodyState('Mira')
    story.characters = [makeProtagonist('Rowan'), girl] as never
    const girlMetadataBefore = structuredClone(girl.metadata)

    const result = makeClassificationResult({
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      scene: { presentCharacterNames: ['Mira'] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    expect(applied).toBe(true)
    expect(db.methodsCalled()).toContain('commitWriteBatch')
    expect(db.methodsCalled()).not.toContain('abortWriteBatch')
    // The protagonist now carries a sheet (creation grant) and Mira's body state moved
    // — i.e. the rollback case above really did undo two persisted-looking changes.
    expect(story.characters.find((c) => c.name === 'Rowan')?.metadata).toHaveProperty('rpgSheet')
    expect(story.characters.find((c) => c.name === 'Mira')?.metadata).not.toEqual(
      girlMetadataBefore,
    )
  })

  it('D-4: a tracking-OFF turn is atomic too — a mid-turn write failure rolls it back', async () => {
    // Tracking off means no delta, but the turn's writes (including the whole
    // BE/RPG engine when beMode is on) still commit all-or-nothing.
    settingsMock.experimentalFeatures.stateTracking = false
    story.characters = [makeCharacter('Aria')] as never
    db.failOn('updateCharacter')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('commitWriteBatch')
    // No delta write: tracking is off, so there is nothing delta-side to persist.
    expect(methods).not.toContain('updateStoryEntry')
    expect(applied).toBe(false)
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
  })

  it('D-4: beMode with tracking OFF runs the engine atomically — a failed flush reverts sheet and body state', async () => {
    // The literal D-4 finding: beMode + stateTracking off used to run the whole
    // engine (essence, growth, grant) best-effort with swallowed failures. Now
    // it rides the same batch: flush failure reverts BOTH engine mutations.
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const protagonist = makeProtagonist('Rowan')
    const girl = makeGirlWithBodyState('Mira')
    story.characters = [protagonist, girl] as never
    const protagonistMetadataBefore = protagonist.metadata
    const girlMetadataBefore = structuredClone(girl.metadata)

    const result = makeClassificationResult({
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      scene: { presentCharacterNames: ['Mira'] },
    })

    db.failOn('commitWriteBatch')
    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    expect(methods).toContain('updateCharacter')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('updateStoryEntry')
    expect(applied).toBe(false)
    expect(story.characters.find((c) => c.name === 'Rowan')?.metadata).toEqual(
      protagonistMetadataBefore,
    )
    expect(story.characters.find((c) => c.name === 'Mira')?.metadata).toEqual(girlMetadataBefore)
  })

  it('replay guard: re-applying an entry that already has a delta is a no-op', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // The entry already carries a delta — i.e. the turn already committed once.
    story.entries = [{ id: 'entry-1', worldStateDelta: { previousState: {} } }] as never

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // Nothing was written and no stateful mutation ran — the guard returned early.
    expect(applied).toBe(false)
    expect(db.methodsCalled()).not.toContain('updateCharacter')
    expect(db.methodsCalled()).not.toContain('beginWriteBatch')
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
  })
})
