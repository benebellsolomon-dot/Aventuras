/**
 * Tests for creation-time identity hygiene (research/55 component C).
 *
 * `extractIdentity` / `computeIdentityUpdates` are mocked so the orchestration —
 * baseline rewrite, current-state merge, conditional tag-bank write, and the
 * best-effort no-op/never-throw contract — is exercised without a live model.
 * A recording persist callback stands in for the store's COW-safe update path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fully mock the extraction module (rather than importOriginal) so the real
// module's Svelte-runes import chain (settings → debug store) never loads. The
// auto-hash key is a stable string constant mirrored here.
const IMAGE_TAGS_AUTO_HASH_KEY = 'imageTagsAutoHash'

const mocks = vi.hoisted(() => ({
  extractIdentity: vi.fn(),
  computeIdentityUpdates: vi.fn(),
}))

vi.mock('./identityExtraction', () => ({
  IMAGE_TAGS_AUTO_HASH_KEY: 'imageTagsAutoHash',
  extractIdentity: mocks.extractIdentity,
  computeIdentityUpdates: mocks.computeIdentityUpdates,
}))

import { applyIdentityHygiene } from './identityHygiene'
import type { IdentityUpdates } from './identityExtraction'
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

/** A recording persist callback that captures every (id, updates) pair. */
function recordingPersist() {
  const calls: Array<{ id: string; updates: Partial<Character> }> = []
  const persist = vi.fn(async (id: string, updates: Partial<Character>) => {
    calls.push({ id, updates })
  })
  return { persist, calls }
}

const updatesWith = (over: Partial<IdentityUpdates> = {}): IdentityUpdates => ({
  cleanBaseline: { face: 'soft round face', hair: 'long wavy chestnut hair' },
  currentState: { clothing: 'torn milkmaid dress pulled down', face: 'flushed cheeks' },
  bankChanged: false,
  ...over,
})

describe('applyIdentityHygiene', () => {
  beforeEach(() => {
    mocks.extractIdentity.mockReset()
    mocks.computeIdentityUpdates.mockReset()
  })

  it('passes the character descriptors/name/description into the extraction', async () => {
    mocks.extractIdentity.mockResolvedValue(null)
    const character = makeCharacter()
    const { persist } = recordingPersist()

    await applyIdentityHygiene(character, persist)

    expect(mocks.extractIdentity).toHaveBeenCalledWith({
      visualDescriptors: character.visualDescriptors,
      name: 'Lucy',
      description: 'a holstaur milkmaid',
    })
  })

  it('persists cleanBaseline over visualDescriptors and merges currentState into current look', async () => {
    mocks.extractIdentity.mockResolvedValue({
      identityTags: [],
      cleanBaseline: {},
      currentState: {},
    })
    mocks.computeIdentityUpdates.mockResolvedValue(
      updatesWith({
        cleanBaseline: { face: 'soft round face', hair: 'long wavy chestnut hair' },
        currentState: { clothing: 'torn milkmaid dress pulled down' },
      }),
    )
    // Character already carries a current look from the update path this turn.
    const character = makeCharacter({ currentVisualDescriptors: { build: 'sweaty' } })
    const { persist, calls } = recordingPersist()

    await applyIdentityHygiene(character, persist)

    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe('char-1')
    // Baseline is REWRITTEN to the clean stable identity.
    expect(calls[0].updates.visualDescriptors).toEqual({
      face: 'soft round face',
      hair: 'long wavy chestnut hair',
    })
    // Current look = existing merged with extracted current-state (non-clobber).
    expect(calls[0].updates.currentVisualDescriptors).toEqual({
      build: 'sweaty',
      clothing: 'torn milkmaid dress pulled down',
    })
  })

  it('writes imageTags + auto-hash into metadata when the bank changed', async () => {
    mocks.extractIdentity.mockResolvedValue({
      identityTags: [],
      cleanBaseline: {},
      currentState: {},
    })
    mocks.computeIdentityUpdates.mockResolvedValue(
      updatesWith({
        bankChanged: true,
        imageTags: '1girl, chestnut hair, cow ears',
        imageTagsAutoHash: 'hash-abc',
      }),
    )
    const character = makeCharacter()
    const { persist, calls } = recordingPersist()

    await applyIdentityHygiene(character, persist)

    expect(calls[0].updates.imageTags).toBe('1girl, chestnut hair, cow ears')
    // Existing metadata is preserved; only the auto-hash key is added.
    expect(calls[0].updates.metadata).toEqual({
      source: 'classifier',
      [IMAGE_TAGS_AUTO_HASH_KEY]: 'hash-abc',
    })
  })

  it('does not touch imageTags/metadata when the bank did not change (guard preserved a user edit)', async () => {
    mocks.extractIdentity.mockResolvedValue({
      identityTags: [],
      cleanBaseline: {},
      currentState: {},
    })
    mocks.computeIdentityUpdates.mockResolvedValue(updatesWith({ bankChanged: false }))
    const character = makeCharacter()
    const { persist, calls } = recordingPersist()

    await applyIdentityHygiene(character, persist)

    expect(calls[0].updates.imageTags).toBeUndefined()
    expect(calls[0].updates.metadata).toBeUndefined()
  })

  it('is a no-op (no persist, no throw) when extraction returns null', async () => {
    mocks.extractIdentity.mockResolvedValue(null)
    const { persist } = recordingPersist()

    await expect(applyIdentityHygiene(makeCharacter(), persist)).resolves.toBeUndefined()
    expect(persist).not.toHaveBeenCalled()
    expect(mocks.computeIdentityUpdates).not.toHaveBeenCalled()
  })

  it('swallows a persist failure (best-effort, never throws)', async () => {
    mocks.extractIdentity.mockResolvedValue({
      identityTags: [],
      cleanBaseline: {},
      currentState: {},
    })
    mocks.computeIdentityUpdates.mockResolvedValue(updatesWith())
    const failingPersist = vi.fn(async () => {
      throw new Error('db write failed')
    })

    await expect(applyIdentityHygiene(makeCharacter(), failingPersist)).resolves.toBeUndefined()
    expect(failingPersist).toHaveBeenCalledTimes(1)
  })
})
