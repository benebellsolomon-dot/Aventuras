/**
 * One-time identity BACKFILL for existing characters (research/55 component D).
 *
 * Existing characters predate the identity subsystem: most have rich free-text
 * `visualDescriptors` (often polluted with transient scene state) and no
 * `imageTags` bank. This module runs the unified identity extraction over a
 * batch of characters and splits the two kinds of change by their risk:
 *
 *   - Tag banks are ADDITIVE and safe → auto-applied here (persisted immediately,
 *     with the same non-clobber hash guard `computeIdentityUpdates` provides, so a
 *     user-edited bank is never clobbered).
 *   - Baseline rewrites MUTATE user-owned narrative data → NOT applied here.
 *     They are collected as `BaselineProposal`s for the caller (the review modal)
 *     to present and apply per-character on the user's approval, via
 *     `applyBaselineProposal`.
 *
 * Pure/testable seam: the extract fn and persist fn are injected (no store, no
 * live model), so the orchestration is unit-tested without the app running.
 * Best-effort per character: one character's failure increments `errors` and the
 * batch continues — a single bad extraction never aborts the sweep.
 */

import { createLogger } from '$lib/log'
import type { Character } from '$lib/types'
import { hasDescriptors } from '$lib/utils/visualDescriptors'
import type { VisualDescriptors } from '../sdk/schemas/classifier'
import {
  IMAGE_TAGS_AUTO_HASH_KEY,
  computeIdentityUpdates,
  mergeIdentityBaseline,
  type IdentityExtraction,
  type IdentityExtractionInput,
} from './identityExtraction'

const log = createLogger('IdentityBackfill')

/** The baseline descriptor fields a proposal diffs and displays (no clothing). */
export const BASELINE_DIFF_FIELDS: ReadonlyArray<keyof VisualDescriptors> = [
  'face',
  'hair',
  'eyes',
  'build',
  'distinguishing',
]

/** Persist a subset of Character fields through the store's COW-safe update path. */
export type BackfillPersist = (id: string, updates: Partial<Character>) => Promise<void>

/** Extract fn injected into the backfill (the real `extractIdentity` in the app). */
export type BackfillExtract = (input: IdentityExtractionInput) => Promise<IdentityExtraction | null>

export interface BackfillDeps {
  /** Runs the LLM identity extraction for one character (best-effort, may be null). */
  extract: BackfillExtract
  /** Persists the auto-applied tag bank. */
  persist: BackfillPersist
  /** Progress callback for the UI (13 LLM calls take real time). */
  onProgress?: (done: number, total: number) => void
  /**
   * Optional cancellation (FIX 6): checked BEFORE each character, so an in-flight
   * run stops before the next LLM call and returns the partial results gathered so
   * far. The character already being processed is allowed to finish.
   */
  signal?: AbortSignal
}

/**
 * A proposed baseline rewrite awaiting the user's approval. The UI shows a
 * field-by-field before→after of the baseline descriptors; `applyBaselineProposal`
 * consumes the whole object (including the existing current-state it must preserve).
 */
export interface BaselineProposal {
  characterId: string
  name: string
  /** The character's current canonical baseline (the "before"). */
  currentBaseline: VisualDescriptors
  /**
   * The clean stable baseline the extraction proposes (the "after"): the clean
   * fields field-MERGED over the current baseline (FIX 1), so an omitted/empty
   * extraction field keeps the existing value instead of wiping it. This is the
   * exact object `applyBaselineProposal` persists — the modal diff reflects the
   * true outcome.
   */
  proposedBaseline: VisualDescriptors
}

export interface BackfillResult {
  /** Characters whose tag bank was (re)derived and persisted. */
  banksApplied: number
  /** Characters whose bank was left untouched (guard preserved a user edit, or no tags). */
  banksSkipped: number
  /** Baseline rewrites awaiting review — never auto-applied. */
  proposals: BaselineProposal[]
  /** Characters that threw during processing (isolated; batch continued). */
  errors: number
}

/** Trimmed value of a descriptor field, or '' when empty/absent. */
function fieldValue(vd: VisualDescriptors | undefined, field: keyof VisualDescriptors): string {
  return (vd?.[field] ?? '').trim()
}

/** True iff the proposed baseline differs from the current on any diffed field. */
function baselineDiffers(current: VisualDescriptors, proposed: VisualDescriptors): boolean {
  return BASELINE_DIFF_FIELDS.some(
    (field) => fieldValue(current, field) !== fieldValue(proposed, field),
  )
}

/**
 * Run the one-time identity backfill over a batch of characters. Auto-applies tag
 * banks (safe/additive) and collects baseline rewrites as review proposals (never
 * silently applied). Best-effort per character — a single failure is counted and
 * the sweep continues.
 */
export async function runIdentityBackfill(
  characters: Character[],
  deps: BackfillDeps,
): Promise<BackfillResult> {
  const eligible = characters.filter((c) => hasDescriptors(c.visualDescriptors))
  const total = eligible.length

  const result: BackfillResult = {
    banksApplied: 0,
    banksSkipped: 0,
    proposals: [],
    errors: 0,
  }

  let done = 0
  for (const character of eligible) {
    // FIX 6: honor cancellation between characters — stop before the next LLM call
    // and return whatever was gathered so far (partial results).
    if (deps.signal?.aborted) break
    try {
      const extraction = await deps.extract({
        visualDescriptors: character.visualDescriptors,
        name: character.name,
        description: character.description ?? undefined,
      })
      // Best-effort: a null extraction (no model / failure) is a skip, not an error.
      if (!extraction) {
        continue
      }

      const updates = await computeIdentityUpdates(character, extraction)

      // Tag bank: additive + guarded → auto-apply immediately.
      if (updates.bankChanged) {
        // LOW-7 (known, unfixed): this spreads the spawn-time `character.metadata`
        // snapshot, so a metadata key written concurrently during the LLM call
        // could be lost. Low risk in the one-shot backfill flow; left as-is.
        await deps.persist(character.id, {
          imageTags: updates.imageTags,
          metadata: {
            ...(character.metadata ?? {}),
            [IMAGE_TAGS_AUTO_HASH_KEY]: updates.imageTagsAutoHash,
          },
        })
        result.banksApplied += 1
      } else {
        result.banksSkipped += 1
      }

      // Baseline rewrite: mutates narrative data → propose only when it changes.
      // FIX 1: the proposal is the clean fields MERGED over the current baseline,
      // so a thin/empty extraction can't wipe good fields; propose only if that
      // merged result actually differs from the current baseline.
      const proposedBaseline = mergeIdentityBaseline(
        character.visualDescriptors,
        updates.cleanBaseline,
      )
      if (baselineDiffers(character.visualDescriptors, proposedBaseline)) {
        result.proposals.push({
          characterId: character.id,
          name: character.name,
          currentBaseline: character.visualDescriptors,
          proposedBaseline,
        })
      }
    } catch (error) {
      result.errors += 1
      log('Backfill failed for character — isolating', { character: character.name, error })
    } finally {
      done += 1
      deps.onProgress?.(done, total)
    }
  }

  log('Backfill complete', {
    total,
    banksApplied: result.banksApplied,
    banksSkipped: result.banksSkipped,
    proposals: result.proposals.length,
    errors: result.errors,
  })
  return result
}

/**
 * Apply an approved baseline proposal: the merged clean baseline becomes the
 * canonical baseline. Persists through the injected COW-safe update fn.
 *
 * FIX 2: this NEVER touches `currentVisualDescriptors`. The extraction's
 * currentState was inferred from the character's OLD baseline prose, not the live
 * scene, so writing it would clobber the character's real current scene state
 * (the look the update path set this turn). Backfill only rewrites the baseline;
 * current-state stays owned by the live turn.
 */
export async function applyBaselineProposal(
  proposal: BaselineProposal,
  persist: BackfillPersist,
): Promise<void> {
  await persist(proposal.characterId, {
    visualDescriptors: proposal.proposedBaseline,
  })
}
