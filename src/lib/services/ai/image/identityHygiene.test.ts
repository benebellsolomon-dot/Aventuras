/**
 * Tests for creation-time identity hygiene (research/55 component C).
 *
 * `extractIdentity` / `computeIdentityUpdates` are mocked so the orchestration —
 * baseline field-merge (FIX 1), re-resolve-after-extraction (FIX 3),
 * current-state merge, conditional tag-bank write, and the best-effort
 * no-op/never-throw contract — is exercised without a live model. A recording
 * persist callback stands in for the store's COW-safe update path. The real
 * `mergeIdentityBaseline` is mirrored in the mock so the merge is exercised.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fully mock the extraction module (rather than importOriginal) so the real
// module's Svelte-runes import chain (settings → debug store) never loads. The
// auto-hash key is a stable string constant mirrored here.
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
  extractIdentity: vi.fn(),
  computeIdentityUpdates: vi.fn(),
}))

vi.mock('./identityExtraction', () => ({
  IMAGE_TAGS_AUTO_HASH_KEY: 'imageTagsAutoHash',
  extractIdentity: mocks.extractIdentity,
  computeIdentityUpdates: mocks.computeIdentityUpdates,
  mergeIdentityBaseline: (
    existing: Record<string, string | undefined>,
    clean: Record<string, string | undefined>,
  ) => mergeIdentityBaseline(existing, clean),
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

    await applyIdentityHygiene(character, () => character, persist)

    expect(mocks.extractIdentity).toHaveBeenCalledWith({
      visualDescriptors: character.visualDescriptors,
      name: 'Lucy',
      description: 'a holstaur milkmaid',
    })
  })

  it('field-merges cleanBaseline over the baseline and merges currentState into current look', async () => {
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

    await applyIdentityHygiene(character, () => character, persist)

    expect(calls).toHaveLength(1)
    expect(calls[0].id).toBe('char-1')
    // Baseline is the clean fields MERGED over the existing baseline: face+hair are
    // overlaid; build/clothing/distinguishing (omitted by the extraction) survive.
    expect(calls[0].updates.visualDescriptors).toEqual({
      face: 'soft round face',
      hair: 'long wavy chestnut hair',
      build: 'tall, huge breasts, curvy',
      clothing: 'torn milkmaid dress',
      distinguishing: 'cow ears, horns, cow tail',
    })
    // Current look = existing merged with extracted current-state (non-clobber).
    expect(calls[0].updates.currentVisualDescriptors).toEqual({
      build: 'sweaty',
      clothing: 'torn milkmaid dress pulled down',
    })
  })

  it('keeps existing baseline fields when cleanBaseline omits them (no wipe)', async () => {
    mocks.extractIdentity.mockResolvedValue({
      identityTags: [],
      cleanBaseline: {},
      currentState: {},
    })
    // A thin extraction: only hair. Everything else must be preserved.
    mocks.computeIdentityUpdates.mockResolvedValue(
      updatesWith({ cleanBaseline: { hair: 'short black hair' }, currentState: {} }),
    )
    const character = makeCharacter()
    const { persist, calls } = recordingPersist()

    await applyIdentityHygiene(character, () => character, persist)

    expect(calls[0].updates.visualDescriptors).toEqual({
      face: 'soft round face, flushed, semen on chin',
      hair: 'short black hair', // only field overlaid
      build: 'tall, huge breasts, curvy',
      clothing: 'torn milkmaid dress',
      distinguishing: 'cow ears, horns, cow tail',
    })
  })

  it('skips the baseline write when the merge changes nothing (still applies current)', async () => {
    mocks.extractIdentity.mockResolvedValue({
      identityTags: [],
      cleanBaseline: {},
      currentState: {},
    })
    // Empty cleanBaseline → merge is a no-op → no baseline field in the write.
    mocks.computeIdentityUpdates.mockResolvedValue(
      updatesWith({ cleanBaseline: {}, currentState: { face: 'blushing' } }),
    )
    const character = makeCharacter()
    const { persist, calls } = recordingPersist()

    await applyIdentityHygiene(character, () => character, persist)

    expect(calls).toHaveLength(1)
    expect(calls[0].updates.visualDescriptors).toBeUndefined()
    expect(calls[0].updates.currentVisualDescriptors).toEqual({ face: 'blushing' })
  })

  it('re-resolves the live character AFTER extraction and persists against it (FIX 3)', async () => {
    mocks.extractIdentity.mockResolvedValue({
      identityTags: [],
      cleanBaseline: {},
      currentState: {},
    })
    mocks.computeIdentityUpdates.mockResolvedValue(
      updatesWith({ cleanBaseline: { hair: 'auburn hair' }, currentState: {} }),
    )
    // Spawn-time snapshot (stale) vs the live character resolved after extraction.
    const stale = makeCharacter({ id: 'stale-id' })
    const fresh = makeCharacter({
      id: 'fresh-id',
      visualDescriptors: { face: 'edited face', hair: 'old hair' },
      currentVisualDescriptors: { build: 'lean' },
    })
    const { persist, calls } = recordingPersist()

    await applyIdentityHygiene(stale, () => fresh, persist)

    // computeIdentityUpdates ran against the FRESH object, and the write targets it.
    expect(mocks.computeIdentityUpdates).toHaveBeenCalledWith(fresh, expect.anything())
    expect(calls[0].id).toBe('fresh-id')
    // Baseline merged over the FRESH baseline (edited face survives; hair overlaid).
    expect(calls[0].updates.visualDescriptors).toEqual({
      face: 'edited face',
      hair: 'auburn hair',
    })
    // Current-state merged over the FRESH current look.
    expect(calls[0].updates.currentVisualDescriptors).toEqual({ build: 'lean' })
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

    await applyIdentityHygiene(character, () => character, persist)

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

    await applyIdentityHygiene(character, () => character, persist)

    expect(calls[0].updates.imageTags).toBeUndefined()
    expect(calls[0].updates.metadata).toBeUndefined()
  })

  it('is a no-op (no persist, no throw) when extraction returns null', async () => {
    mocks.extractIdentity.mockResolvedValue(null)
    const { persist } = recordingPersist()
    const character = makeCharacter()

    await expect(applyIdentityHygiene(character, () => character, persist)).resolves.toBeUndefined()
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
    const character = makeCharacter()

    await expect(
      applyIdentityHygiene(character, () => character, failingPersist),
    ).resolves.toBeUndefined()
    expect(failingPersist).toHaveBeenCalledTimes(1)
  })
})
