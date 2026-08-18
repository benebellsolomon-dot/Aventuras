// ---- ContextBuilder: BE body-state block is scoped to the current scene ----
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultBodyState, writeBodyState } from '$lib/services/be'
import type { Branch, Character, StoryEntry } from '$lib/types'

const db = {
  getStory: vi.fn(),
  getStoryPackId: vi.fn(async () => 'default-pack'),
  getCharacters: vi.fn(async () => [] as Character[]),
  getLocations: vi.fn(async () => []),
  getItems: vi.fn(async () => []),
  getStoryBeats: vi.fn(async () => []),
  getPackVariables: vi.fn(async () => []),
  getStoryCustomVariables: vi.fn(async () => null),
  getRuntimeVariables: vi.fn(async () => []),
  getRecentStoryEntries: vi.fn(async () => [] as StoryEntry[]),
  getBranches: vi.fn(async () => [] as Branch[]),
  getStoryEntry: vi.fn(async () => null as StoryEntry | null),
}

vi.mock('$lib/services/database', () => ({ database: db }))
vi.mock('$lib/services/templates/engine', () => ({ templateEngine: { render: () => '' } }))

const { ContextBuilder } = await import('./context-builder')

const character = (name: string, relationship: string | null, tier: number): Character =>
  ({
    id: name,
    storyId: 's1',
    name,
    relationship,
    metadata: writeBodyState(null, defaultBodyState(tier)),
  }) as unknown as Character

const narration = (names: string[], position = 1): StoryEntry =>
  ({
    id: `n-${names.join('-')}-${position}`,
    type: 'narration',
    branchId: null,
    position,
    worldStateDelta: { classificationResult: { scene: { presentCharacterNames: names } } },
  }) as unknown as StoryEntry

const cast = [
  character('Ben', 'self', 6),
  character('Mira', 'companion', 20),
  character('Lucy', 'companion', 24),
]

beforeEach(() => {
  vi.clearAllMocks()
  db.getStory.mockResolvedValue({
    id: 's1',
    mode: 'adventure',
    currentBranchId: null,
    settings: { beMode: true },
  })
  db.getStoryPackId.mockResolvedValue('default-pack')
  db.getCharacters.mockResolvedValue(cast)
  db.getLocations.mockResolvedValue([])
  db.getItems.mockResolvedValue([])
  db.getStoryBeats.mockResolvedValue([])
  db.getPackVariables.mockResolvedValue([])
  db.getStoryCustomVariables.mockResolvedValue(null)
  db.getRuntimeVariables.mockResolvedValue([])
  db.getRecentStoryEntries.mockResolvedValue([])
  db.getBranches.mockResolvedValue([])
  db.getStoryEntry.mockResolvedValue(null)
})

const blockFor = async (actionText?: string): Promise<string> => {
  const builder = await ContextBuilder.forStory('s1', undefined, actionText)
  return builder.getContext().beStateBlock as string
}

describe('ContextBuilder BE body-state scoping', () => {
  it('omits characters the classifier did not report in the scene', async () => {
    db.getRecentStoryEntries.mockResolvedValue([narration(['Mira'])])
    const block = await blockFor()
    expect(block).toContain('Mira —')
    expect(block).not.toContain('Lucy —')
  })

  it('always keeps the protagonist even when unnamed by the classifier', async () => {
    db.getRecentStoryEntries.mockResolvedValue([narration(['Mira'])])
    expect(await blockFor()).toContain('Ben —')
  })

  it('includes every tracked character when no presence signal exists', async () => {
    db.getRecentStoryEntries.mockResolvedValue([])
    const block = await blockFor()
    expect(block).toContain('Mira —')
    expect(block).toContain('Lucy —')
  })

  it('ignores presence entries belonging to a sibling branch', async () => {
    const sibling = { ...narration(['Mira']), branchId: 'other-branch' } as StoryEntry
    db.getRecentStoryEntries.mockResolvedValue([sibling])
    const block = await blockFor()
    expect(block).toContain('Mira —')
    expect(block).toContain('Lucy —')
  })

  // A girl re-entering the scene is absent from the PREVIOUS narration's
  // presence list, so she lost her block on the exact turn she was addressed.
  it('pins a character the pending action names, even when presence omits her', async () => {
    db.getRecentStoryEntries.mockResolvedValue([narration(['Mira'])])
    const block = await blockFor('You call Lucy back into the kitchen.')
    expect(block).toContain('Mira —')
    expect(block).toContain('Lucy —')
  })

  it('matches action names on word boundaries only', async () => {
    db.getRecentStoryEntries.mockResolvedValue([narration(['Mira'])])
    const block = await blockFor('You reread Lucylla\u2019s letter.')
    expect(block).not.toContain('Lucy —')
  })

  // Branches share one position space: a sibling's post-fork narration used to
  // supply presence for a scene it never happened in, and so did main's own
  // post-fork entries.
  it('drops entries a forked branch never inherited', async () => {
    db.getStory.mockResolvedValue({
      id: 's1',
      mode: 'adventure',
      currentBranchId: 'b1',
      settings: { beMode: true },
    })
    db.getBranches.mockResolvedValue([
      { id: 'b1', storyId: 's1', parentBranchId: null, forkEntryId: 'fork' } as Branch,
    ])
    db.getStoryEntry.mockResolvedValue({ id: 'fork', position: 5 } as StoryEntry)
    db.getRecentStoryEntries.mockResolvedValue([
      { ...narration(['Mira'], 9), branchId: 'sibling' } as StoryEntry,
      narration(['Mira'], 9), // main, but AFTER the fork point
    ])
    const block = await blockFor()
    expect(block).toContain('Mira —')
    expect(block).toContain('Lucy —')
  })

  it('keeps inherited entries from before the fork point', async () => {
    db.getStory.mockResolvedValue({
      id: 's1',
      mode: 'adventure',
      currentBranchId: 'b1',
      settings: { beMode: true },
    })
    db.getBranches.mockResolvedValue([
      { id: 'b1', storyId: 's1', parentBranchId: null, forkEntryId: 'fork' } as Branch,
    ])
    db.getStoryEntry.mockResolvedValue({ id: 'fork', position: 5 } as StoryEntry)
    db.getRecentStoryEntries.mockResolvedValue([narration(['Mira'], 4)])
    const block = await blockFor()
    expect(block).toContain('Mira —')
    expect(block).not.toContain('Lucy —')
  })

  // research/49 Step 4: the lactation gate inputs come from the SAME readBodyState
  // the block does — a girl's offers must match her engine state.
  it('assembles lactation gate inputs, flipping induce_lactation to milking', async () => {
    const bonded = writeBodyState(null, { ...defaultBodyState(20), bond: 60 })
    const lactating = writeBodyState(null, {
      ...defaultBodyState(20),
      bond: 60,
      lactation: { active: true, supplyTier: 2 },
    })
    db.getCharacters.mockResolvedValue([
      character('Ben', 'self', 6),
      { ...character('Mira', 'companion', 20), metadata: bonded },
      { ...character('Lucy', 'companion', 20), metadata: lactating },
    ])
    const builder = await ContextBuilder.forStory('s1')
    const instruction = builder.getContext().checkTaggingInstruction as string
    expect(instruction).toContain('Mira: intimate_handling, induce_lactation')
    expect(instruction).toContain('Lucy: intimate_handling, milking')
    expect(instruction).toContain('milk supply: heavy')
  })

  it('leaves non-BE stories with an empty block and skips the presence query', async () => {
    db.getStory.mockResolvedValue({
      id: 's1',
      mode: 'adventure',
      currentBranchId: null,
      settings: {},
    })
    expect(await blockFor()).toBe('')
    expect(db.getRecentStoryEntries).not.toHaveBeenCalled()
  })
})
