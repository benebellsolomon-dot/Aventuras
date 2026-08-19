/**
 * Creation-time identity hygiene (research/55 component C).
 *
 * When the classifier creates a NEW character during a turn, its
 * `visualDescriptors` are the classifier's scene-time prose — canonical baseline
 * polluted with transient state and the outfit of the moment. This helper runs
 * the unified identity extraction and APPLIES the hygiene split to the fresh
 * character:
 *
 *   - visualDescriptors        ← cleanBaseline field-MERGED over the fresh baseline
 *                                (populated clean fields overlay; omitted fields keep
 *                                the existing value — a thin extraction never wipes),
 *                                skipped entirely when the merge is a no-op
 *   - currentVisualDescriptors ← fresh current merged with currentState (transient
 *                                scene-state + current outfit, non-clobbering)
 *   - imageTags / metadata hash ← the derived tag bank, only when it changed
 *                                 (non-clobber guard lives in computeIdentityUpdates)
 *
 * The extraction runs FIRST, then the live character is re-resolved by id (via the
 * injected `resolve`) and the split is computed/persisted against THAT fresh object
 * — narrowing the window where a concurrent edit or later-turn write is clobbered.
 * Baseline is merged (not user-reviewed) here because this is CREATION — fresh
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
import type { VisualDescriptors } from '../sdk/schemas/classifier'
import {
  IMAGE_TAGS_AUTO_HASH_KEY,
  computeIdentityUpdates,
  extractIdentity,
  mergeIdentityBaseline,
} from './identityExtraction'

const log = createLogger('IdentityHygiene')

/** Persist a subset of Character fields through the store's COW-safe update path. */
export type IdentityHygienePersist = (id: string, updates: Partial<Character>) => Promise<void>

/**
 * Re-resolve the live character by id AFTER the LLM extraction returns (FIX 3),
 * so the hygiene split is computed and persisted against the freshest object —
 * narrowing the window where a concurrent edit or later-turn write is clobbered.
 * Returns `undefined` if the character no longer exists.
 */
export type IdentityHygieneResolve = () => Character | undefined

/** All descriptor fields, for a field-by-field baseline equality check. */
const DESCRIPTOR_FIELDS: ReadonlyArray<keyof VisualDescriptors> = [
  'face',
  'hair',
  'eyes',
  'build',
  'clothing',
  'accessories',
  'distinguishing',
]

/** True iff two baselines carry the same trimmed value on every descriptor field. */
function baselinesEqual(a: VisualDescriptors, b: VisualDescriptors): boolean {
  return DESCRIPTOR_FIELDS.every((field) => (a?.[field] ?? '').trim() === (b?.[field] ?? '').trim())
}

/**
 * Run identity extraction on a freshly-created character and persist the hygiene
 * split. Best-effort: a `null` extraction (no model / failure) is a silent no-op,
 * and any error from the compute/persist step is logged and swallowed. Never throws.
 */
export async function applyIdentityHygiene(
  character: Character,
  resolve: IdentityHygieneResolve,
  persist: IdentityHygienePersist,
): Promise<void> {
  // Extract FIRST (FIX 3) — the LLM call is the slow, concurrency-exposed step.
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
    // Re-resolve the live character AFTER extraction (FIX 3): a concurrent user
    // edit or later-turn write may have changed it (or COW-remapped it) while the
    // LLM ran. Compute + persist against this fresh object, not the stale spawn-time
    // snapshot, so we field-merge rather than clobber a newer baseline/current.
    const fresh = resolve() ?? character
    const updates = await computeIdentityUpdates(fresh, extraction)

    // FIX 1: field-merge the clean baseline over the FRESH baseline instead of a
    // wholesale replace — a thin/empty extraction can no longer wipe good fields.
    const existingBaseline = fresh.visualDescriptors ?? {}
    const mergedBaseline = mergeIdentityBaseline(existingBaseline, updates.cleanBaseline)

    const changes: Partial<Character> = {
      // Transient scene-state + current outfit → story-tracked current look.
      // Merge over the FRESH current look (may have been set later this turn).
      currentVisualDescriptors: {
        ...(fresh.currentVisualDescriptors ?? {}),
        ...updates.currentState,
      },
    }
    // Skip the baseline write when the merge changed nothing (still apply bank/current).
    if (!baselinesEqual(mergedBaseline, existingBaseline)) {
      changes.visualDescriptors = mergedBaseline
    }
    if (updates.bankChanged) {
      changes.imageTags = updates.imageTags
      changes.metadata = {
        ...(fresh.metadata ?? {}),
        [IMAGE_TAGS_AUTO_HASH_KEY]: updates.imageTagsAutoHash,
      }
    }

    await persist(fresh.id, changes)
    log('Applied identity hygiene', {
      character: fresh.name,
      bankChanged: updates.bankChanged,
      baselineWritten: changes.visualDescriptors !== undefined,
      currentFields: Object.keys(updates.currentState).length,
    })
  } catch (error) {
    log('Identity hygiene failed — swallowing (best-effort)', {
      character: character.name,
      error,
    })
  }
}
