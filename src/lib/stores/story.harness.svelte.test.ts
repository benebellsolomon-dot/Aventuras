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
