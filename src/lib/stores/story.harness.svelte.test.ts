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

  it('records the delta write LAST after entity writes when tracking is on (documents the CR-1 seam)', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    const charWriteIdx = methods.indexOf('updateCharacter')
    const deltaWriteIdx = methods.indexOf('updateStoryEntry')
    expect(charWriteIdx).toBeGreaterThanOrEqual(0)
    expect(deltaWriteIdx).toBeGreaterThanOrEqual(0)
    // The delta (rollback record) is persisted AFTER the entity mutation — the
    // non-atomic ordering CR-1 will make transactional.
    expect(deltaWriteIdx).toBeGreaterThan(charWriteIdx)
  })

  it('CR-1 HAZARD (currently RED-by-design): a delta-write failure leaves the entity write committed with no delta', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // Simulate the delta write throwing (disk error / crash point).
    db.failOn('updateStoryEntry')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    await story.applyClassificationResult(result as never, 'entry-1')

    // TODAY: the character trait write committed, but the delta write failed and was
    // swallowed ("Non-fatal") — so the mutation is un-rollbackable. This assertion
    // pins the CURRENT behavior; CR-1 flips it (the whole turn rolls back, so the
    // trait is NOT committed when the delta write fails).
    expect(db.methodsCalled()).toContain('updateCharacter')
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits).toContain('brave') // committed despite the missing delta — the hazard
  })
})
