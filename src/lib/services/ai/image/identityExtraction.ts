/**
 * Identity extraction (LLM) — the backbone of the image-gen identity subsystem
 * (research/55 component A).
 *
 * A character's `visualDescriptors` are rich free-text prose that the classifier
 * often pollutes with transient scene state ("post-orgasm, semen on chin") and
 * clothing-of-the-moment. This module turns that prose into a clean structured
 * split via a single schema-constrained LLM call:
 *
 *   - identityTags  : PLAIN danbooru tags for STABLE identity only (species/race,
 *                     hair, eyes, skin tone, permanent marks). No size/breast
 *                     tags (the BE engine owns size), no clothing, no transient
 *                     state, no A1111 (tag:weight) emphasis.
 *   - cleanBaseline : the stable identity as descriptor fields (face = stable
 *                     facial features/skin/age only; hair; eyes; build = frame
 *                     only, not size; distinguishing = permanent). No clothing,
 *                     no transient state.
 *   - currentState  : the transient stuff pulled out (expression / pose /
 *                     condition) plus the current outfit.
 *
 * Best-effort by contract: if no text model is configured, or the AI call
 * throws, `extractIdentity` returns `null` so the caller can fall back to
 * today's behavior (empty bank, raw descriptors). It never throws.
 *
 * Pure/testable seam: the schema and the deterministic normalization live
 * here; B/C/D (bank, creation hygiene, backfill) consume the exported
 * `extractIdentity` + `IdentityExtraction` interface. The prompt itself is the
 * user-editable `image-tag-bank-generation` template, rendered via
 * ContextBuilder — the schema below still enforces the output SHAPE, so a
 * template edit can degrade quality but can never break the caller's contract.
 */

import { z } from 'zod'
import { settings } from '$lib/stores/settings.svelte'
import { createLogger } from '$lib/log'
import { BAND_WORD_THRESHOLDS } from '$lib/services/be'
import { ContextBuilder } from '$lib/services/context'
import { hashContent } from '$lib/services/packs/hash'
import type { Character } from '$lib/types'
import { generateStructured } from '../sdk/generate'
import { visualDescriptorsSchema, type VisualDescriptors } from '../sdk/schemas/classifier'

const log = createLogger('IdentityExtraction')

/**
 * Rides the image-generation preset — same LLM assignment that authors the
 * booru scene prompts and the identity tag bank (ImageTagBankService).
 */
const SERVICE_ID = 'imageGeneration'

/** User-editable vault prompt this call renders (id kept stable — pack references depend on it). */
const TEMPLATE_ID = 'image-tag-bank-generation'

// ============================================================================
// Public interface (consumed by B/C/D)
// ============================================================================

export interface IdentityExtractionInput {
  /** The character's canonical (possibly polluted) visual descriptors. */
  visualDescriptors: VisualDescriptors
  /** Optional name — helps the tagger infer species/race and disambiguate. */
  name?: string
  /** Optional one-line description — extra signal for identity inference. */
  description?: string
}

export interface IdentityExtraction {
  /** Plain danbooru identity tags — stable identity only, no weights/size/clothing. */
  identityTags: string[]
  /** Stable identity as descriptor fields — no clothing, no transient state. */
  cleanBaseline: VisualDescriptors
  /** Transient state (expression/pose/condition) plus current clothing. */
  currentState: Partial<VisualDescriptors>
}

// ============================================================================
// LLM call schema
// ============================================================================

const identityExtractionSchema = z.object({
  identityTags: z
    .array(z.string())
    .describe(
      '12-20 PLAIN, atomic danbooru tags for STABLE physical identity, in EXACT dossier ' +
        'order: anchor (1girl/1boy/1other) → hair (length, style, color) → eyes (color, ' +
        'shape) → skin tone → body (height, build; NO size/breast tags) → age appearance ' +
        '(mature female, young adult…) → distinguishing marks (scars, freckles, moles, ' +
        'tattoos, heterochromia, AND animal ears/horns/tail for monster girls). Atomic: ' +
        '"long hair, wavy hair, red hair" NOT "long wavy red hair". NO clothing, NO ' +
        'transient state (expression, sweat, arousal, pose, fluids). No (tag:weight) emphasis.',
    ),
  cleanBaseline: visualDescriptorsSchema.describe(
    'The STABLE identity as descriptor fields. face = permanent facial features / skin ' +
      'tone / age only (NO expression). hair, eyes as usual. build = body frame only ' +
      '(NOT breast/size). distinguishing = permanent marks only. Leave clothing empty.',
  ),
  currentState: visualDescriptorsSchema.describe(
    'The TRANSIENT scene state pulled out of the prose: current expression / pose / ' +
      'condition (put these in face/build) and the CURRENT outfit (clothing). Empty if none.',
  ),
})

// ============================================================================
// Prompt (rendered from the user-editable `image-tag-bank-generation` vault
// template via ContextBuilder — see extractIdentity below. The system/user
// text itself now lives in src/lib/services/prompts/templates/image.ts.)
// ============================================================================

/** All descriptor fields, in prose order, for the rendered visual-descriptors block. */
const DESCRIPTOR_FIELD_ORDER: ReadonlyArray<keyof VisualDescriptors> = [
  'face',
  'hair',
  'eyes',
  'build',
  'clothing',
  'accessories',
  'distinguishing',
]

/**
 * Render the character's visual descriptors as the `visualDescriptorsBlock`
 * template variable: one "- field: value" line per populated field, or a
 * placeholder when nothing was provided.
 */
function buildVisualDescriptorsBlock(vd: VisualDescriptors | undefined): string {
  const lines: string[] = []
  for (const field of DESCRIPTOR_FIELD_ORDER) {
    const value = vd?.[field]
    if (value && value.trim()) lines.push(`- ${field}: ${value.trim()}`)
  }
  return lines.length > 0 ? lines.join('\n') : '(none provided)'
}

// ============================================================================
// Deterministic normalization (unit-tested directly)
// ============================================================================

const MIN_TAG_LENGTH = 3

/** Band phrases ("large breasts", "huge breasts", …) — the BE engine owns size. */
const BAND_WORD_PATTERN = new RegExp(
  `\\b(?:${BAND_WORD_THRESHOLDS.map((row) => row.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
)

/** Bare size/bust vocabulary a stray identity tag might still carry. */
const BARE_SIZE_PATTERN =
  /\b(?:breasts?|boobs?|tits?|bust|busty|bosom|cleavage|nipples?|areolae?|cup size|bra size|breast size)\b/gi

/**
 * Strip A1111 emphasis wrappers so a tag becomes plain: "(elf ears:1.3)" → "elf
 * ears", "[freckles]" → "freckles", "blue eyes:1.1" → "blue eyes".
 */
function stripEmphasis(tag: string): string {
  return tag
    .replace(/^[([{]+/, '')
    .replace(/[)\]}]+$/, '')
    .replace(/:\s*[0-9]*\.?[0-9]+\s*$/, '')
    .trim()
}

/**
 * Normalize the LLM's identity tags into plain, deduped, lowercase danbooru
 * tags: strip emphasis weights, strip size/breast vocabulary (engine authority),
 * drop empties and sub-minimum fragments. Tags arriving comma-joined are split.
 */
export function normalizeIdentityTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    if (typeof raw !== 'string') continue
    for (const piece of raw.split(/[;,\n]/)) {
      const cleaned = stripEmphasis(piece)
        .replace(BAND_WORD_PATTERN, '')
        .replace(BARE_SIZE_PATTERN, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .toLowerCase()
      if (cleaned.length < MIN_TAG_LENGTH) continue
      if (seen.has(cleaned)) continue
      seen.add(cleaned)
      out.push(cleaned)
    }
  }
  return out
}

/** Keep only the named descriptor fields that carry non-empty text. */
function compactDescriptors(
  vd: VisualDescriptors | undefined,
  fields: ReadonlyArray<keyof VisualDescriptors>,
): Partial<VisualDescriptors> {
  const out: Partial<VisualDescriptors> = {}
  if (!vd) return out
  for (const field of fields) {
    const value = vd[field]
    if (value && value.trim()) out[field] = value.trim()
  }
  return out
}

/** Fields that belong to the stable baseline — clothing/accessories excluded on purpose. */
const BASELINE_FIELDS: ReadonlyArray<keyof VisualDescriptors> = [
  'face',
  'hair',
  'eyes',
  'build',
  'distinguishing',
]

/** currentState may touch any descriptor field (expression/pose live in face/build). */
const CURRENT_FIELDS: ReadonlyArray<keyof VisualDescriptors> = [
  'face',
  'hair',
  'eyes',
  'build',
  'clothing',
  'accessories',
  'distinguishing',
]

/** Every descriptor field — used when overlaying a clean baseline onto an existing one. */
const ALL_DESCRIPTOR_FIELDS: ReadonlyArray<keyof VisualDescriptors> = CURRENT_FIELDS

/**
 * Overlay a clean baseline onto an existing baseline, field-by-field:
 *
 *   - a NON-EMPTY field of `cleanBaseline` REPLACES the existing value — this is
 *     what strips pollution from that field.
 *   - an omitted/empty `cleanBaseline` field KEEPS the existing value — so an
 *     empty or thin (all-optional) extraction can never wipe or degrade a good
 *     baseline.
 *
 * Returns a new object (immutable): `existing` is never mutated. This is the
 * shared merge for both creation hygiene (C) and backfill (D) — a wholesale
 * `visualDescriptors = cleanBaseline` would wipe fields the LLM omitted.
 */
export function mergeIdentityBaseline(
  existing: VisualDescriptors,
  cleanBaseline: VisualDescriptors,
): VisualDescriptors {
  const merged: VisualDescriptors = { ...(existing ?? {}) }
  for (const field of ALL_DESCRIPTOR_FIELDS) {
    const value = cleanBaseline?.[field]
    if (value && value.trim()) merged[field] = value.trim()
  }
  return merged
}

/**
 * Post-process the raw LLM split into the public shape with the hard guarantees
 * tests rely on: plain/deduped identity tags, a baseline that never carries
 * clothing/accessories, and a current-state that captures the outfit the model
 * (or a stray baseline field) still holds.
 */
export function normalizeExtraction(
  raw: z.infer<typeof identityExtractionSchema>,
): IdentityExtraction {
  const cleanBaseline = compactDescriptors(raw.cleanBaseline, BASELINE_FIELDS)
  const currentState = compactDescriptors(raw.currentState, CURRENT_FIELDS)

  // Clothing/accessories never live in the baseline. If the model left them
  // there, move them into current-state (without clobbering an explicit current value).
  for (const field of ['clothing', 'accessories'] as const) {
    const stray = raw.cleanBaseline?.[field]?.trim()
    if (stray && !currentState[field]) currentState[field] = stray
  }

  return {
    identityTags: normalizeIdentityTags(raw.identityTags ?? []),
    cleanBaseline,
    currentState,
  }
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Extract a clean identity split from a character's free-text descriptors.
 * Best-effort: returns `null` when no text model is configured or the AI call
 * throws — never throws out of this function.
 */
export async function extractIdentity(
  input: IdentityExtractionInput,
): Promise<IdentityExtraction | null> {
  try {
    // Best-effort guard: skip silently (no toast, no throw) when the service has
    // no preset assigned. Inside the try because the lookup itself can throw on
    // incomplete settings, and this function's contract is to resolve null on
    // any failure rather than reject into a fire-and-forget caller.
    const presetId = settings.getServicePresetId(SERVICE_ID)
    if (!presetId) {
      log('no preset assigned for identity extraction — skipping')
      return null
    }

    const ctx = new ContextBuilder()
    ctx.add({
      characterName: input.name ?? '',
      characterDescription: input.description ?? '',
      visualDescriptorsBlock: buildVisualDescriptorsBlock(input.visualDescriptors),
    })
    const { system, user: prompt } = await ctx.render(TEMPLATE_ID)

    const raw = await generateStructured(
      {
        presetId,
        schema: identityExtractionSchema,
        system,
        prompt,
      },
      SERVICE_ID,
    )
    const result = normalizeExtraction(raw)
    log('extracted identity', {
      name: input.name,
      identityTagCount: result.identityTags.length,
      baselineFields: Object.keys(result.cleanBaseline).length,
      currentFields: Object.keys(result.currentState).length,
    })
    return result
  } catch (error) {
    log('identity extraction failed — falling back', error)
    return null
  }
}

// ============================================================================
// Apply-to-character (research/55 component B) — pure computation, no persistence
// ============================================================================

/**
 * Metadata key under which the content-hash of the last AUTO-derived tag bank is
 * stored. The non-clobber guard compares the current bank's hash against this to
 * tell an untouched auto-derivation from a user's manual edit.
 */
export const IMAGE_TAGS_AUTO_HASH_KEY = 'imageTagsAutoHash'

/**
 * Proposed Character field updates computed from an extraction. `imageTags` /
 * `imageTagsAutoHash` are present ONLY when the tag bank should be (re)written;
 * `cleanBaseline` / `currentState` are always returned for the caller to apply
 * (creation applies the baseline rewrite; backfill proposes it).
 */
export interface IdentityUpdates {
  /** New tag bank to persist — omitted when the guard preserves a user edit. */
  imageTags?: string
  /** Hash of the new auto bank to store under `metadata[IMAGE_TAGS_AUTO_HASH_KEY]`. */
  imageTagsAutoHash?: string
  /** Stable identity baseline from the extraction. */
  cleanBaseline: VisualDescriptors
  /** Transient current-state (expression/pose + current clothing) from the extraction. */
  currentState: Partial<VisualDescriptors>
  /** True iff the tag bank is being (re)written by this computation. */
  bankChanged: boolean
}

/** Read the stored auto-hash out of a character's metadata (null-safe). */
function readStoredAutoHash(metadata: Character['metadata']): string | undefined {
  const value = metadata?.[IMAGE_TAGS_AUTO_HASH_KEY]
  return typeof value === 'string' ? value : undefined
}

/**
 * Compute proposed Character updates from an extraction with a NON-CLOBBER guard
 * on the tag bank: write `imageTags` only when the current bank is empty, OR when
 * the current bank still equals the last auto-derivation (its hash matches the
 * stored `imageTagsAutoHash`). A user-edited bank (hash mismatch) is PRESERVED.
 *
 * Pure: performs no persistence and triggers nothing — the caller decides what to
 * write. Async only because the content hash is computed via SubtleCrypto.
 */
export async function computeIdentityUpdates(
  character: Pick<Character, 'imageTags' | 'metadata'>,
  extraction: IdentityExtraction,
): Promise<IdentityUpdates> {
  const { cleanBaseline, currentState } = extraction
  const newBank = extraction.identityTags.join(', ')
  const currentBank = (character.imageTags ?? '').trim()
  const storedAutoHash = readStoredAutoHash(character.metadata)

  // Nothing worth writing if the extraction produced no tags.
  let shouldWrite = false
  if (newBank) {
    if (!currentBank) {
      shouldWrite = true // bank empty → seed it
    } else if (storedAutoHash && (await hashContent(currentBank)) === storedAutoHash) {
      shouldWrite = true // still the untouched auto value → safe to re-derive
    }
    // else: user manually edited the bank (or no hash on record) → preserve it
  }

  if (!shouldWrite) {
    return { cleanBaseline, currentState, bankChanged: false }
  }

  return {
    imageTags: newBank,
    imageTagsAutoHash: await hashContent(newBank),
    cleanBaseline,
    currentState,
    bankChanged: true,
  }
}
