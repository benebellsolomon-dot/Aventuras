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
 * Pure/testable seam: the schema, the prompt, and the deterministic
 * normalization live here; B/C/D (bank, creation hygiene, backfill) consume the
 * exported `extractIdentity` + `IdentityExtraction` interface.
 */

import { z } from 'zod'
import { settings } from '$lib/stores/settings.svelte'
import { createLogger } from '$lib/log'
import { BAND_WORD_THRESHOLDS } from '$lib/services/be'
import { generateStructured } from '../sdk/generate'
import { visualDescriptorsSchema, type VisualDescriptors } from '../sdk/schemas/classifier'

const log = createLogger('IdentityExtraction')

/**
 * Rides the image-generation preset — same LLM assignment that authors the
 * booru scene prompts and the identity tag bank (ImageTagBankService).
 */
const SERVICE_ID = 'imageGeneration'

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
      'PLAIN danbooru tags for STABLE identity only: species/race (e.g. "cow girl", ' +
        '"cow ears", "cow horns", "cow tail"), hair (length+style+color), eyes, skin ' +
        'tone, permanent distinguishing marks. NO size/breast tags, NO clothing, NO ' +
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
// Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a booru tagging and identity-hygiene specialist for an image-generation pipeline.

You are given a character's free-text visual descriptors. This prose is often POLLUTED with transient scene state (expression, sweat, arousal, pose, bodily fluids) and with the outfit the character happens to be wearing right now. Your job is to separate the character's PERMANENT identity from everything transient, and to emit plain danbooru identity tags.

Return three things:

1. identityTags — PLAIN danbooru tags (lowercase, comma-atomic, NO "(tag:1.2)" weighting) covering STABLE identity ONLY:
   - species / race markers (for monster girls these are IDENTITY and MUST survive: e.g. a holstaur → "cow girl", "cow ears", "cow horns", "cow tail"; an elf → "elf", "pointy ears")
   - hair: length + style + color (e.g. "long hair", "wavy hair", "blonde hair")
   - eyes: color + notable shape (e.g. "blue eyes")
   - skin tone (e.g. "dark skin", "pale skin")
   - permanent distinguishing marks (scars, tattoos, birthmarks, freckles)
   EXCLUDE: any size/breast tag (the engine owns size — never emit "large breasts", "huge breasts", "cleavage", etc.), any clothing, and any transient state (expression, blush, sweat, arousal, pose, fluids).

2. cleanBaseline — the stable identity expressed as descriptor fields:
   - face: permanent facial features, skin tone, age indicators ONLY. Strip expression and any "post-X" scene state.
   - hair, eyes: as usual.
   - build: the body FRAME only (height, posture, general frame). Do NOT include breast/bust/cup size — that is owned elsewhere.
   - distinguishing: permanent marks only.
   - clothing: leave EMPTY — clothing is never part of the stable baseline.

3. currentState — everything transient you removed from the prose:
   - face/build: the current expression, pose, arousal, condition, visible fluids, sweat, etc.
   - clothing: the outfit the character is wearing right now (or its absence, e.g. "nude").
   Leave a field empty if the prose says nothing transient about it.

Worked example (monster girl — a holstaur named Lucy):
  Input face: "soft round face, warm smile, flushed cheeks, semen on chin, gentle brown eyes"
  Input hair: "long wavy chestnut hair"
  Input build: "tall, huge breasts, wide hips, curvy"
  Input clothing: "torn milkmaid dress pulled down, apron"
  Input distinguishing: "cow ears, small curved horns, cow tail, cow-print pattern"
  →
  identityTags: ["cow girl", "cow ears", "cow horns", "cow tail", "long hair", "wavy hair", "chestnut hair", "brown eyes"]
  cleanBaseline: { face: "soft round face", hair: "long wavy chestnut hair", eyes: "gentle brown eyes", build: "tall, wide hips, curvy frame", distinguishing: "cow ears, small curved horns, cow tail, cow-print markings" }
  currentState: { face: "warm smile, flushed cheeks, semen on chin", clothing: "torn milkmaid dress pulled down, apron" }
  (note: "huge breasts" was DROPPED from every field — the engine owns size; species markers survived as identity tags.)

Respond ONLY with the structured object.`

function buildUserPrompt(input: IdentityExtractionInput): string {
  const vd = input.visualDescriptors ?? {}
  const lines: string[] = []
  if (input.name) lines.push(`Character name: ${input.name}`)
  if (input.description) lines.push(`Description: ${input.description}`)
  lines.push('Visual descriptors:')
  const fields: ReadonlyArray<keyof VisualDescriptors> = [
    'face',
    'hair',
    'eyes',
    'build',
    'clothing',
    'accessories',
    'distinguishing',
  ]
  let any = false
  for (const field of fields) {
    const value = vd[field]
    if (value && value.trim()) {
      lines.push(`- ${field}: ${value.trim()}`)
      any = true
    }
  }
  if (!any) lines.push('(none provided)')
  return lines.join('\n')
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
  // Best-effort guard: skip silently (no toast, no throw) when the service has
  // no preset assigned — the caller keeps today's behavior.
  const presetId = settings.getServicePresetId(SERVICE_ID)
  if (!presetId) {
    log('no preset assigned for identity extraction — skipping')
    return null
  }

  try {
    const raw = await generateStructured(
      {
        presetId,
        schema: identityExtractionSchema,
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(input),
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
