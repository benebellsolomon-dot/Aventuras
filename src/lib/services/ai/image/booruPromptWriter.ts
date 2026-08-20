/**
 * Dedicated booru scene-prompt writer (research/55 follow-up).
 *
 * PROBLEM (measured): in inline mode the NARRATION model is asked to embed a
 * booru `<pic prompt="...">` tag block mid-story. Even with the booru
 * instructions and a populated identity bank in front of it, a story model like
 * `deepseek-v4-pro` writes PROSE, not Danbooru tags. A booru image model
 * (`wai-illustrious-sdxl`) cannot follow prose → wrong pose/scene/anatomy.
 *
 * FIX: stop relying on the narration model for the tag prompt. This module runs
 * a SINGLE-PURPOSE LLM call whose ONLY job is to convert one scene into a proper
 * booru TAG prompt — so it complies. It copies each present subject's locked
 * `imageTags` bank verbatim (or converts their descriptor prose to tags when
 * they have no bank yet), states current clothing + body-size band, and closes
 * on current-location scene tags. The booru image model then receives tags it
 * can actually follow.
 *
 * Best-effort by contract, exactly like `extractIdentity`: if the setting is
 * off, the model is not a booru model, no preset is assigned, or the AI call
 * throws, the caller keeps the original story-written prompt. It never throws.
 *
 * Rides the `imageGeneration` service preset — the same LLM assignment that
 * authors the identity tag bank — so it stays OFF the narration model and on a
 * fast, format-following model. The zod schema below enforces the output SHAPE
 * regardless of template edits, so a user edit can degrade quality but can never
 * break the caller's contract.
 */

import { z } from 'zod'
import { settings } from '$lib/stores/settings.svelte'
import { createLogger } from '$lib/log'
import { ContextBuilder } from '$lib/services/context'
import { database } from '$lib/services/database'
import {
  apparentTier,
  bandWord,
  cupLetter,
  imageSizeAnchor,
  imageStateCues,
  readBodyState,
} from '$lib/services/be'
import { generateStructured } from '../sdk/generate'
import { detectPromptDialect } from './dialect'
import type { Character, Location, VisualDescriptors } from '$lib/types'

const log = createLogger('BooruPromptWriter')

/** Rides the image-generation preset — same LLM that authors the identity bank. */
const SERVICE_ID = 'imageGeneration'

/** User-editable vault prompt this call renders (see prompts/templates/image.ts). */
const TEMPLATE_ID = 'image-booru-scene-prompt'

/** Cap the narrative-beat context so it stays a hint, not the bulk of the prompt. */
const NARRATIVE_CONTEXT_CHARS = 1200

const booruScenePromptSchema = z.object({
  prompt: z
    .string()
    .describe(
      'The complete booru image prompt: comma-separated Danbooru tags (plus a short ' +
        'spatial-anchored sentence per subject in multi-subject scenes), in section order ' +
        'rating → camera → count tag → characters (locked identity tags copied VERBATIM, then ' +
        'clothing/size/expression/pose) → scene tags. English only. No prose paragraphs, no ' +
        'art-style or quality tags (masterpiece, best quality, anime style — added automatically).',
    ),
})

// ============================================================================
// Inputs
// ============================================================================

export interface BooruPromptWriterInput {
  /** All characters present in the scene (identity/clothing/bodyState source). */
  presentCharacters: Character[]
  /** Names on the <pic>/scene tag — the actual subjects to depict. */
  tagCharacterNames: string[]
  /** The story/narration-written prompt (scene, pose, framing intent + fallback). */
  scenePrompt: string
  /** The surrounding narrative beat, for extra scene context. */
  narrativeText: string
  /** BE-mode gate — include body-size band phrases only when on. */
  beMode: boolean
  /**
   * Story id — used to look up the current location for scene tags. Optional:
   * the regeneration path has no story id, and the location block is a
   * best-effort nice-to-have, so it is simply omitted when absent.
   */
  storyId?: string
}

export interface ResolveBooruSceneInput extends BooruPromptWriterInput {
  /** Image model id — the writer runs only for booru-dialect models. */
  model: string | undefined
}

// ============================================================================
// Pure dossier assembly (unit-tested directly)
// ============================================================================

/** Descriptor fields that describe a stable/appearance look, in prose order. */
const APPEARANCE_FIELDS: ReadonlyArray<keyof VisualDescriptors> = [
  'face',
  'hair',
  'eyes',
  'build',
  'distinguishing',
]

/** Join a character's identity-bank string into a single comma-separated tag run. */
function normalizeBank(imageTags: string | null | undefined): string {
  return (imageTags ?? '')
    .replace(/\s*\n+\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Deterministic backstop for the template's "never use names" rule: drop any
 * standalone comma-token that equals a present character's name (case-insensitive).
 * Booru models don't know names — "1girl, solo, Amelia, blonde hair" must lose
 * "Amelia". Only whole comma-tokens are removed, so a name embedded inside a
 * multi-subject clause ("straddling him") is left to the prompt's own wording.
 */
export function stripCharacterNames(prompt: string, presentCharacters: Character[]): string {
  const names = new Set(
    presentCharacters.map((c) => c.name.trim().toLowerCase()).filter((n) => n.length > 0),
  )
  if (names.size === 0) return prompt
  return prompt
    .split(',')
    .filter((token) => !names.has(token.trim().toLowerCase()))
    .join(', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/(?:,\s*)+,/g, ', ')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .trim()
}

/** Appearance reference (for subjects with no locked bank) as "field: value" parts. */
function appearanceReference(vd: VisualDescriptors | null | undefined): string {
  if (!vd) return ''
  const parts: string[] = []
  for (const field of APPEARANCE_FIELDS) {
    const value = vd[field]?.trim()
    if (value) parts.push(`${field}: ${value}`)
  }
  return parts.join('; ')
}

/**
 * Image-facing body-size phrase for a subject — band word + cup letter, a
 * relative-size anchor at large tiers, and any engorgement/arousal cues. Uses
 * the APPARENT tier (research/49 R6) to match what `assembleInlineImage` grounds
 * on downstream, so the writer's band word and the grounding pass agree.
 */
function bodyStatePhrase(metadata: Character['metadata']): string | null {
  const state = readBodyState(metadata)
  if (!state) return null
  const tier = apparentTier(state)
  const parts = [`${bandWord(tier)} (${cupLetter(tier)}-cup)`]
  const anchor = imageSizeAnchor(tier)
  if (anchor) parts.push(anchor)
  parts.push(...imageStateCues(state))
  return parts.join('; ')
}

/** Resolve the tagged subjects in tag order (skips names with no present match). */
function resolveSubjects(present: Character[], tagNames: string[]): Character[] {
  const byName = new Map(present.map((c) => [c.name.toLowerCase(), c]))
  const out: Character[] = []
  const seen = new Set<string>()
  for (const name of tagNames) {
    const key = name.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    const match = byName.get(key)
    if (match) {
      seen.add(key)
      out.push(match)
    }
  }
  return out
}

/**
 * Build the per-subject dossier block: locked identity tags to copy verbatim (or
 * an appearance reference to convert when there is no bank), current clothing
 * (current-state wins over baseline), and the body-size band (BE mode only).
 * Pure and testable — no I/O.
 */
export function buildSubjectDossier(
  presentCharacters: Character[],
  tagCharacterNames: string[],
  beMode: boolean,
): string {
  const subjects = resolveSubjects(presentCharacters, tagCharacterNames)
  if (subjects.length === 0) {
    return '(no named subjects — depict the scene described above; use "no humans" if nobody is in frame)'
  }

  const blocks = subjects.map((c) => {
    const lines: string[] = [`- ${c.name}:`]

    const bank = normalizeBank(c.imageTags)
    if (bank) {
      lines.push(`  identity tags (copy VERBATIM): ${bank}`)
    } else {
      const appearance = appearanceReference(c.currentVisualDescriptors ?? c.visualDescriptors)
      lines.push(
        appearance
          ? `  appearance (convert to booru identity tags): ${appearance}`
          : '  appearance: (unspecified — infer a plausible consistent look)',
      )
    }

    const clothing = (c.currentVisualDescriptors?.clothing ?? c.visualDescriptors?.clothing)?.trim()
    if (clothing) lines.push(`  current clothing: ${clothing}`)

    if (beMode) {
      const body = bodyStatePhrase(c.metadata)
      if (body) lines.push(`  body: ${body}`)
    }

    return lines.join('\n')
  })

  return blocks.join('\n')
}

/** Current-location scene block (name + description), or empty when unknown. */
export function buildLocationBlock(location: Location | null | undefined): string {
  if (!location) return ''
  const description = location.description?.trim()
  const line = description ? `${location.name} — ${description}` : location.name?.trim()
  if (!line) return ''
  return `## Current location\n${line}\n`
}

/** Trim the narrative beat to a bounded tail so it stays a hint, not the bulk. */
function narrativeContext(narrativeText: string): string {
  const trimmed = (narrativeText ?? '').trim()
  if (trimmed.length <= NARRATIVE_CONTEXT_CHARS) return trimmed || '(none)'
  return `…${trimmed.slice(-NARRATIVE_CONTEXT_CHARS)}`
}

// ============================================================================
// The LLM call
// ============================================================================

/**
 * Convert one scene into a booru tag prompt. Best-effort: returns `null` when no
 * preset is assigned or the AI call throws — never throws out of this function.
 * Does NOT check the setting or model dialect; that gating lives in
 * `resolveBooruScenePrompt` so the raw call stays independently testable.
 */
export async function writeBooruScenePrompt(input: BooruPromptWriterInput): Promise<string | null> {
  // Everything (including the preset lookup) sits inside the try so the
  // best-effort "never throws" contract is structural, not incidental — the two
  // seams that call this outside their own try/catch depend on it.
  try {
    const presetId = settings.getServicePresetId(SERVICE_ID)
    if (!presetId) {
      log('no preset assigned for booru prompt writer — skipping')
      return null
    }

    const subjects = resolveSubjects(input.presentCharacters, input.tagCharacterNames)

    // Current location for scene tags — best-effort; a lookup failure (or no
    // story id, as on the regeneration path) just omits the location block
    // rather than failing the whole write.
    let location: Location | undefined
    if (input.storyId) {
      try {
        const locations = await database.getLocations(input.storyId)
        location = locations.find((l) => l.current) ?? undefined
      } catch (error) {
        log('current-location lookup failed — omitting location block', error)
      }
    }

    const ctx = new ContextBuilder()
    ctx.add({
      sceneIntent: input.scenePrompt.trim() || '(the narration gave no explicit scene prompt)',
      narrativeBeat: narrativeContext(input.narrativeText),
      subjectCount: String(subjects.length),
      subjectDossier: buildSubjectDossier(
        input.presentCharacters,
        input.tagCharacterNames,
        input.beMode,
      ),
      locationBlock: buildLocationBlock(location),
    })
    const { system, user: prompt } = await ctx.render(TEMPLATE_ID)

    const raw = await generateStructured(
      {
        presetId,
        schema: booruScenePromptSchema,
        system,
        prompt,
      },
      SERVICE_ID,
    )

    const rawWritten = raw.prompt?.trim()
    if (!rawWritten) {
      log('booru prompt writer returned empty — falling back')
      return null
    }
    // Backstop the template's "never use names" rule — booru models don't know
    // character names, so a leaked "Amelia" tag just wastes conditioning.
    const written = stripCharacterNames(rawWritten, input.presentCharacters)
    log('wrote booru scene prompt', {
      subjects: subjects.map((c) => c.name),
      length: written.length,
    })
    return written
  } catch (error) {
    log('booru prompt writer failed — falling back', error)
    return null
  }
}

/**
 * Resolve the tag prompt to send to `assembleInlineImage`: the dedicated
 * writer's booru output when it is enabled, the model is a booru model, and the
 * call succeeds — otherwise the original story-written `scenePrompt`, unchanged.
 * This is the single gate every inline/analyzed seam calls, so the three paths
 * cannot drift.
 */
export async function resolveBooruScenePrompt(input: ResolveBooruSceneInput): Promise<string> {
  if (!settings.systemServicesSettings.imageGeneration.dedicatedBooruPromptWriter) {
    return input.scenePrompt
  }
  if (detectPromptDialect(input.model) !== 'booru') {
    return input.scenePrompt
  }
  const written = await writeBooruScenePrompt(input)
  return written ?? input.scenePrompt
}
