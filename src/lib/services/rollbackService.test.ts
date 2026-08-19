// ---- RollbackService: partial-failure surfacing (H-1) ----
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StoryEntry, WorldStateDelta } from '$lib/types'

const db = {
  deleteCharacter: vi.fn(async () => {}),
  deleteLocation: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  deleteStoryBeat: vi.fn(async () => {}),
  updateCharacter: vi.fn(async () => {}),
  updateLocation: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
  updateStoryBeat: vi.fn(async () => {}),
  clearTimeTracker: vi.fn(async () => {}),
  saveTimeTracker: vi.fn(async () => {}),
  setCurrentLocation: vi.fn(async () => {}),
  getLocationsForBranch: vi.fn(async () => []),
  deleteWorldStateSnapshotsAfter: vi.fn(async () => {}),
  cleanupNoopOverrides: vi.fn(async () => 0),
}

vi.mock('$lib/services/database', () => ({ database: db }))

const { rollbackService } = await import('./rollbackService')

function emptyDelta(): WorldStateDelta {
  return {
    classificationResult: {},
    previousState: {
      characters: [],
      locations: [],
      items: [],
      storyBeats: [],
      currentLocationId: null,
      timeTracker: null,
    },
    createdEntities: { characterIds: [], locationIds: [], itemIds: [], storyBeatIds: [] },
  }
}

function narrationEntry(position: number, delta: WorldStateDelta | undefined): StoryEntry {
  return {
    id: `entry-${position}`,
    position,
    type: 'narration',
    worldStateDelta: delta,
  } as unknown as StoryEntry
}

describe('RollbackService — partial-failure surfacing (H-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default no-op resolutions after clearAllMocks wipes implementations.
    db.deleteCharacter.mockResolvedValue(undefined)
    db.updateCharacter.mockResolvedValue(undefined)
    db.getLocationsForBranch.mockResolvedValue([])
    db.cleanupNoopOverrides.mockResolvedValue(0)
  })

  it('returns an empty failures list when every undo succeeds', async () => {
    const delta = emptyDelta()
    delta.createdEntities.characterIds = ['new-char']
    delta.previousState.characters = [
      {
        id: 'existing-char',
        name: 'Aria',
        status: 'active',
        relationship: 'ally',
        traits: [],
        visualDescriptors: {} as never,
      },
    ]

    const summary = await rollbackService.rollbackFromPosition('s1', null, 5, [
      narrationEntry(5, delta),
    ])

    expect(summary.failures).toEqual([])
    expect(summary.deletedCharacters).toBe(1)
    expect(summary.restoredCharacters).toBe(1)
  })

  it('records a failure (and does not increment the success counter) when a created-entity delete throws', async () => {
    db.deleteCharacter.mockRejectedValueOnce(new Error('FK constraint'))
    const delta = emptyDelta()
    delta.createdEntities.characterIds = ['stuck-char']

    const summary = await rollbackService.rollbackFromPosition('s1', null, 5, [
      narrationEntry(5, delta),
    ])

    expect(summary.deletedCharacters).toBe(0)
    expect(summary.failures).toEqual([
      { operation: 'delete', entityType: 'character', id: 'stuck-char', error: 'FK constraint' },
    ])
  })

  it('records a failure when an updated-entity restore throws — the H-1 stuck-girl case', async () => {
    db.updateCharacter.mockRejectedValueOnce(new Error('db locked'))
    const delta = emptyDelta()
    delta.previousState.characters = [
      {
        id: 'girl-b',
        name: 'Bella',
        status: 'active',
        relationship: 'lover',
        traits: [],
        visualDescriptors: {} as never,
      },
    ]

    const summary = await rollbackService.rollbackFromPosition('s1', null, 5, [
      narrationEntry(5, delta),
    ])

    expect(summary.restoredCharacters).toBe(0)
    expect(summary.failures).toHaveLength(1)
    expect(summary.failures[0]).toMatchObject({
      operation: 'restore',
      entityType: 'character',
      id: 'girl-b',
    })
  })

  it('restores currentVisualDescriptors from the before-state (M-3)', async () => {
    const delta = emptyDelta()
    delta.previousState.characters = [
      {
        id: 'char-1',
        name: 'Aria',
        status: 'active',
        relationship: 'ally',
        traits: [],
        visualDescriptors: { build: 'lithe' } as never,
        currentVisualDescriptors: { build: 'soaked hair' } as never,
      },
    ]

    await rollbackService.rollbackFromPosition('s1', null, 5, [narrationEntry(5, delta)])

    expect(db.updateCharacter).toHaveBeenCalledWith(
      'char-1',
      expect.objectContaining({ currentVisualDescriptors: { build: 'soaked hair' } }),
    )
  })

  it('leaves currentVisualDescriptors untouched on pre-M-3 deltas (field absent)', async () => {
    const delta = emptyDelta()
    delta.previousState.characters = [
      {
        id: 'char-1',
        name: 'Aria',
        status: 'active',
        relationship: 'ally',
        traits: [],
        visualDescriptors: {} as never,
        // no currentVisualDescriptors key — an older snapshot
      },
    ]

    await rollbackService.rollbackFromPosition('s1', null, 5, [narrationEntry(5, delta)])

    const calls = db.updateCharacter.mock.calls as unknown as Array<[string, Record<string, unknown>]>
    const call = calls.find((c) => c[0] === 'char-1')
    expect(call).toBeDefined()
    expect(call![1]).not.toHaveProperty('currentVisualDescriptors')
  })

  it('continues rolling back other entities after one fails (partial rollback)', async () => {
    db.updateCharacter.mockRejectedValueOnce(new Error('fail A')).mockResolvedValueOnce(undefined)
    const delta = emptyDelta()
    delta.previousState.characters = [
      {
        id: 'a',
        name: 'A',
        status: 'active',
        relationship: null,
        traits: [],
        visualDescriptors: {} as never,
      },
      {
        id: 'b',
        name: 'B',
        status: 'active',
        relationship: null,
        traits: [],
        visualDescriptors: {} as never,
      },
    ]

    const summary = await rollbackService.rollbackFromPosition('s1', null, 5, [
      narrationEntry(5, delta),
    ])

    expect(summary.restoredCharacters).toBe(1) // B still restored
    expect(summary.failures).toHaveLength(1) // A recorded
    expect(summary.failures[0].id).toBe('a')
  })
})
