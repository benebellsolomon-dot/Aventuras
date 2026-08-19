/**
 * Creation-time identity hygiene (research/55 component C).
 *
 * When the classifier creates a NEW character during a turn, its
 * `visualDescriptors` are the classifier's scene-time prose — canonical baseline
 * polluted with transient state and the outfit of the moment. This helper runs
 * the unified identity extraction and APPLIES the hygiene split to the fresh
 * character:
 *
 *   - visualDescriptors        ← cleanBaseline (stable identity becomes canonical)
 *   - currentVisualDescriptors ← existing merged with currentState (transient
 *                                scene-state + current outfit, non-clobbering)
 *   - imageTags / metadata hash ← the derived tag bank, only when it changed
 *                                 (non-clobber guard lives in computeIdentityUpdates)
 *
 * Baseline is rewritten unconditionally here because this is CREATION — fresh
 * classifier prose, not user-owned narrative data (the update path never touches
 * the baseline; backfill of existing characters is component D, gated on review).
 *
 * Best-effort by contract: `extractIdentity` already returns `null` (never
 * throws) when no text model is configured or the call fails; this helper skips
 * silently in that case, and wraps the persist step so any failure is logged and
 * swallowed. It never throws, so a fire-and-forget caller needs no guard.
 */

import { createLogger } from '$lib/log'
import type { Character } from '$lib/types'
import {
  IMAGE_TAGS_AUTO_HASH_KEY,
  computeIdentityUpdates,
  extractIdentity,
} from './identityExtraction'

const log = createLogger('IdentityHygiene')

/** Persist a subset of Character fields through the store's COW-safe update path. */
export type IdentityHygienePersist = (id: string, updates: Partial<Character>) => Promise<void>

/**
 * Run identity extraction on a freshly-created character and persist the hygiene
 * split. Best-effort: a `null` extraction (no model / failure) is a silent no-op,
 * and any error from the compute/persist step is logged and swallowed. Never throws.
 */
export async function applyIdentityHygiene(
  character: Character,
  persist: IdentityHygienePersist,
): Promise<void> {
  const extraction = await extractIdentity({
    visualDescriptors: character.visualDescriptors,
    name: character.name,
    description: character.description ?? undefined,
  })
  if (!extraction) {
    log('No extraction (best-effort skip)', { character: character.name })
    return
  }

  try {
    const updates = await computeIdentityUpdates(character, extraction)

    const changes: Partial<Character> = {
      // Creation-time baseline rewrite: the clean stable identity is canonical.
      visualDescriptors: updates.cleanBaseline,
      // Transient scene-state + current outfit → story-tracked current look.
      // Merge over any current look the update path already set this turn.
      currentVisualDescriptors: {
        ...(character.currentVisualDescriptors ?? {}),
        ...updates.currentState,
      },
    }
    if (updates.bankChanged) {
      changes.imageTags = updates.imageTags
      changes.metadata = {
        ...(character.metadata ?? {}),
        [IMAGE_TAGS_AUTO_HASH_KEY]: updates.imageTagsAutoHash,
      }
    }

    await persist(character.id, changes)
    log('Applied identity hygiene', {
      character: character.name,
      bankChanged: updates.bankChanged,
      baselineFields: Object.keys(updates.cleanBaseline).length,
      currentFields: Object.keys(updates.currentState).length,
    })
  } catch (error) {
    log('Identity hygiene failed — swallowing (best-effort)', {
      character: character.name,
      error,
    })
  }
}
