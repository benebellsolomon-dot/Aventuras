/**
 * Tests for the one-time identity BACKFILL (research/55 component D).
 *
 * `computeIdentityUpdates` is mocked (per-character, keyed by id) so the
 * orchestration — auto-applied banks, skip counts, proposal collection on a
 * baseline diff, error isolation, progress, and the non-empty filter — is
 * exercised without a live model. The `extract` and `persist` deps are injected
 * recording fns. `IMAGE_TAGS_AUTO_HASH_KEY` is mirrored as a stable constant so
 * the real extraction module's Svelte-runes import chain never loads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const IMAGE_TAGS_AUTO_HASH_KEY = 'imageTagsAutoHash'

const DESCRIPTOR_FIELDS = [
  'face',
  'hair',
  'eyes',
  'build',
  'clothing',
  'accessories',
  'distinguishing',
] as const

/** Mirror of the real mergeIdentityBaseline so the mocked module behaves identically. */
function mergeIdentityBaseline(
  existing: Record<string, string | undefined>,
  cleanBaseline: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const merged = { ...(existing ?? {}) }
  for (const field of DESCRIPTOR_FIELDS) {
    const value = cleanBaseline?.[field]
    if (value && value.trim()) merged[field] = value.trim()
  }
  return merged
}

const mocks = vi.hoisted(() => ({
  computeIdentityUpdates: vi.fn(),
}))

vi.mock('./identityExtraction', () => ({
  IMAGE_TAGS_AUTO_HASH_KEY: 'imageTagsAutoHash',
  computeIdentityUpdates: mocks.computeIdentityUpdates,
  mergeIdentityBaseline: (
    existing: Record<string, string | undefined>,
    clean: Record<string, string | undefined>,
  ) => mergeIdentityBaseline(existing, clean),
}))

import {
  runIdentityBackfill,
  applyBaselineProposal,
  type BaselineProposal,
} from './identityBackfill'
import type { IdentityExtraction, IdentityUpdates } from './identityExtraction'
import type { Character } from '$lib/types'

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    storyId: 'story-1',
    name: 'Lucy',
    description: 'a holstaur milkmaid',
    relationship: null,
    traits: [],
    visualDescriptors: {
      face: 'soft round face, flushed, semen on chin',
      hair: 'long wavy chestnut hair',
      build: 'tall, huge breasts, curvy',
      clothing: 'torn milkmaid dress',
      distinguishing: 'cow ears, horns, cow tail',
    },
    status: 'active',
    metadata: { source: 'classifier' },
    portrait: null,
    branchId: null,
    ...overrides,
  }
}

const anExtraction = (over: Partial<IdentityExtraction> = {}): IdentityExtraction => ({
  identityTags: ['1girl', 'chestnut hair'],
  cleanBaseline: {},
  currentState: {},
  ...over,
})

const updatesWith = (over: Partial<IdentityUpdates> = {}): IdentityUpdates => ({
  cleanBaseline: {},
  currentState: {},
  bankChanged: false,
  ...over,
})

/** A recording persist callback that captures every (id, updates) pair. */
function recordingPersist() {
  const calls: Array<{ id: string; updates: Partial<Character> }> = []
  const persist = vi.fn(async (id: string, updates: Partial<Character>) => {
    calls.push({ id, updates })
  })
  return { persist, calls }
}

describe('runIdentityBackfill', () => {
  beforeEach(() => {
    mocks.computeIdentityUpdates.mockReset()
  })

  it('auto-applies changed banks and counts skips; persists imageTags + auto-hash', async () => {
    const applied = makeCharacter({ id: 'a', name: 'Applied' })
    const skipped = makeCharacter({ id: 'b', name: 'Skipped' })
    const extract = vi.fn(async () => anExtraction())
    const { persist, calls } = recordingPersist()

    mocks.computeIdentityUpdates.mockImplementation(async (c: Character) =>
      c.id === 'a'
        ? updatesWith({
            bankChanged: true,
            imageTags: '1girl, chestnut hair',
            imageTagsAutoHash: 'hash-a',
            cleanBaseline: applied.visualDescriptors, // no baseline diff → no proposal
          })
        : updatesWith({ bankChanged: false, cleanBaseline: skipped.visualDescriptors }),
    )

    const result = await runIdentityBackfill([applied, skipped], { extract, persist })

    expect(result.banksApplied).toBe(1)
    expect(result.banksSkipped).toBe(1)
    expect(result.errors).toBe(0)
    expect(result.proposals).toHaveLength(0)

    // Only the changed-bank character is persisted, with merged metadata.
    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe('a')
    expect(calls[0].updates.imageTags).toBe('1girl, chestnut hair')
    expect(calls[0].updates.metadata).toEqual({
      source: 'classifier',
      [IMAGE_TAGS_AUTO_HASH_KEY]: 'hash-a',
    })
  })

  it('collects a proposal only when the MERGED baseline differs from the current', async () => {
    const changed = makeCharacter({ id: 'a', name: 'Changed' })
    const unchanged = makeCharacter({ id: 'b', name: 'Unchanged' })
    const extract = vi.fn(async () => anExtraction())
    const { persist } = recordingPersist()

    mocks.computeIdentityUpdates.mockImplementation(async (c: Character) =>
      c.id === 'a'
        ? // cleans the polluted face; omits build/clothing/distinguishing (they survive)
          updatesWith({
            cleanBaseline: { face: 'soft round face' },
            currentState: { clothing: 'torn milkmaid dress' },
          })
        : // proposed baseline identical to current → no proposal
          updatesWith({ cleanBaseline: unchanged.visualDescriptors }),
    )

    const result = await runIdentityBackfill([changed, unchanged], { extract, persist })

    expect(result.proposals).toHaveLength(1)
    const [proposal] = result.proposals
    expect(proposal.characterId).toBe('a')
    expect(proposal.name).toBe('Changed')
    expect(proposal.currentBaseline).toEqual(changed.visualDescriptors)
    // proposedBaseline = clean fields MERGED over the current baseline: face is
    // overlaid; every field the extraction omitted keeps its existing value.
    expect(proposal.proposedBaseline).toEqual({
      face: 'soft round face',
      hair: 'long wavy chestnut hair',
      build: 'tall, huge breasts, curvy',
      clothing: 'torn milkmaid dress',
      distinguishing: 'cow ears, horns, cow tail',
    })
    // FIX 2: no current-state fields ride along on the proposal any more.
    expect(proposal).not.toHaveProperty('proposedCurrentState')
    expect(proposal).not.toHaveProperty('existingCurrentState')
  })

  it('does NOT propose when the merged baseline equals the current (thin/empty extraction)', async () => {
    const character = makeCharacter({ id: 'a', name: 'Thin' })
    const extract = vi.fn(async () => anExtraction())
    const { persist } = recordingPersist()
    // Empty cleanBaseline → merge is a no-op → nothing to review.
    mocks.computeIdentityUpdates.mockResolvedValue(updatesWith({ cleanBaseline: {} }))

    const result = await runIdentityBackfill([character], { extract, persist })

    expect(result.proposals).toHaveLength(0)
  })

  it('stops before the next character when the signal aborts (FIX 6), returning partial results', async () => {
    const a = makeCharacter({ id: 'a', name: 'First' })
    const b = makeCharacter({ id: 'b', name: 'Second' })
    const controller = new AbortController()
    const extract = vi.fn(async () => anExtraction())
    const { persist } = recordingPersist()
    mocks.computeIdentityUpdates.mockResolvedValue(
      updatesWith({ bankChanged: true, imageTags: 't', imageTagsAutoHash: 'h' }),
    )

    // Abort as soon as the first character finishes → the loop breaks before #2.
    const result = await runIdentityBackfill([a, b], {
      extract,
      persist,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })

    expect(extract).toHaveBeenCalledTimes(1)
    expect(result.banksApplied).toBe(1)
  })

  it('isolates a per-character failure: increments errors, continues the batch', async () => {
    const boom = makeCharacter({ id: 'a', name: 'Boom' })
    const ok = makeCharacter({ id: 'b', name: 'Ok' })
    const extract = vi.fn(async (input: { name?: string }) => {
      if (input.name === 'Boom') throw new Error('extraction exploded')
      return anExtraction()
    })
    const { persist } = recordingPersist()

    mocks.computeIdentityUpdates.mockResolvedValue(
      updatesWith({ bankChanged: true, imageTags: 't', imageTagsAutoHash: 'h' }),
    )

    const result = await runIdentityBackfill([boom, ok], { extract, persist })

    expect(result.errors).toBe(1)
    expect(result.banksApplied).toBe(1) // the surviving character still processed
  })

  it('skips (no error, no bank count) when extraction returns null', async () => {
    const character = makeCharacter()
    const extract = vi.fn(async () => null)
    const { persist } = recordingPersist()

    const result = await runIdentityBackfill([character], { extract, persist })

    expect(result.errors).toBe(0)
    expect(result.banksApplied).toBe(0)
    expect(result.banksSkipped).toBe(0)
    expect(result.proposals).toHaveLength(0)
    expect(mocks.computeIdentityUpdates).not.toHaveBeenCalled()
  })

  it('excludes characters with empty visualDescriptors and reports progress over the eligible set', async () => {
    const withDesc = makeCharacter({ id: 'a', name: 'Has' })
    const empty = makeCharacter({ id: 'b', name: 'Empty', visualDescriptors: {} })
    const extract = vi.fn(async () => anExtraction())
    const { persist } = recordingPersist()
    mocks.computeIdentityUpdates.mockResolvedValue(updatesWith())
    const progress: Array<[number, number]> = []

    await runIdentityBackfill([withDesc, empty], {
      extract,
      persist,
      onProgress: (done, total) => progress.push([done, total]),
    })

    // Only the character with descriptors is eligible → extract called once, total = 1.
    expect(extract).toHaveBeenCalledTimes(1)
    expect(progress).toEqual([[1, 1]])
  })
})

describe('applyBaselineProposal', () => {
  it('persists ONLY the proposed baseline and never touches currentVisualDescriptors (FIX 2)', async () => {
    const proposal: BaselineProposal = {
      characterId: 'char-1',
      name: 'Lucy',
      currentBaseline: { face: 'polluted' },
      proposedBaseline: { face: 'soft round face', hair: 'long wavy chestnut hair' },
    }
    const { persist, calls } = recordingPersist()

    await applyBaselineProposal(proposal, persist)

    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe('char-1')
    expect(calls[0].updates.visualDescriptors).toEqual({
      face: 'soft round face',
      hair: 'long wavy chestnut hair',
    })
    // FIX 2: current scene-state is owned by the live turn — backfill must not clobber it.
    expect(calls[0].updates).not.toHaveProperty('currentVisualDescriptors')
    expect(Object.keys(calls[0].updates)).toEqual(['visualDescriptors'])
  })
})
