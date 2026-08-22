/**
 * Dedicated PROSE scene-prompt writer — the LLM-encoder twin of
 * booruPromptWriter (research/64 §3c).
 *
 * Krea 2 / Flux-class models read the prompt with a language-model encoder,
 * and Krea's own guidance is a two-stage pipeline: a short intent expanded by an
 * LLM into one dense, subject-first paragraph. The narration model's <pic>
 * prompt is that intent — and in a story that moved off a booru model it is
 * often still a tag list ("sensitive, 1girl, solo, …"), which a Krea encoder
 * renders poorly. This pass rewrites whatever arrived into the paragraph the
 * encoder wants: identity from the characters' descriptors, the engine's body
 * state (BE), concrete emotion, camera, environment and light, beat-scoped
 * content discipline — no style words (the style block is appended after).
 *
 * Best-effort like the booru writer: any failure returns null and the caller
 * keeps the original prompt. Runs only for prose-dialect models.
 */

import { z } from 'zod'

import { ContextBuilder } from '$lib/services/context'
import { database } from '$lib/services/database'
import { createLogger } from '$lib/log'
import { settings } from '$lib/stores/settings.svelte'
import type { Character, Location } from '$lib/types'

import { generateStructured } from '../sdk/generate'
import {
  appearanceReference,
  bodyStatePhrase,
  buildLocationBlock,
  buildStorySettingBlock,
  expressionPhrase,
  narrativeContext,
  normalizeBank,
  resolveSubjects,
  type ResolveBooruSceneInput,
} from './booruPromptWriter'
import { detectPromptDialect } from './dialect'

const log = createLogger('ProsePromptWriter')

/** Same preset as the booru writer and scene analysis: the image-prompt LLM. */
const SERVICE_ID = 'imageGeneration'
export const PROSE_WRITER_TEMPLATE_ID = 'image-prose-scene-prompt'
/** Hard ceiling — measured: Krea 2 Turbo keeps every detail at ~1,450 chars. */
export const PROSE_PROMPT_MAX_CHARS = 1600

export const proseScenePromptSchema = z.object({
  prompt: z
    .string()
    .describe(
      'ONE dense paragraph of natural English describing the finished picture — subject(s) first, then action, camera, environment and light. 600-1400 characters. No style or quality words, no tag lists, no character names.',
    ),
})

export type ProsePromptWriterInput = ResolveBooruSceneInput

/**
 * Per-subject dossier in PROSE terms: appearance (current descriptors win over
 * baseline), current clothing, and in BE mode the engine's body-size/state and
 * expression read. Pure and unit-tested.
 */
export function buildProseSubjectDossier(
  presentCharacters: Character[],
  tagCharacterNames: string[],
  beMode: boolean,
): string {
  const subjects = resolveSubjects(presentCharacters, tagCharacterNames)
  if (subjects.length === 0) {
    return '(no named subjects — depict the scene described above; if nobody is in frame, describe the place)'
  }
  return subjects
    .map((c) => {
      const lines: string[] = [`- ${c.name}:`]
      const bank = normalizeBank(c.imageTags)
      if (bank) {
        lines.push(`  identity anchors (locked — restate every one in plain words): ${bank}`)
      }
      const appearance = appearanceReference(c.currentVisualDescriptors ?? c.visualDescriptors)
      lines.push(
        appearance
          ? `  appearance: ${appearance}`
          : '  appearance: (unspecified — infer a plausible consistent look)',
      )
      const clothing = (
        c.currentVisualDescriptors?.clothing ?? c.visualDescriptors?.clothing
      )?.trim()
      if (clothing)
        lines.push(
          `  current clothing (what she wore as the beat began — the scene intent decides whether it is still on): ${clothing}`,
        )
      if (beMode) {
        const body = bodyStatePhrase(c.metadata)
        if (body)
          lines.push(
            `  body (engine state — the breast-size band word is canon, state it): ${body}`,
          )
        const expression = expressionPhrase(c.metadata)
        if (expression)
          lines.push(`  expression (engine state — render it concretely): ${expression}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

/** Cap at the ceiling on a sentence boundary where possible. */
export function capProsePrompt(prompt: string, max = PROSE_PROMPT_MAX_CHARS): string {
  const trimmed = prompt.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  const cut = trimmed.slice(0, max)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '))
  return (lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : cut).trim()
}

export async function writeProseScenePrompt(input: ProsePromptWriterInput): Promise<string | null> {
  try {
    const presetId = settings.getServicePresetId(SERVICE_ID)
    if (!presetId) {
      log('no preset assigned for prose prompt writer — skipping')
      return null
    }
    const subjects = resolveSubjects(input.presentCharacters, input.tagCharacterNames)

    let location: Location | undefined
    let story: {
      genre?: string | null
      description?: string | null
      settings?: { pov?: string } | null
    } | null = null
    if (input.storyId) {
      try {
        const locations = await database.getLocations(input.storyId)
        location = locations.find((l) => l.current) ?? undefined
      } catch (error) {
        log('current-location lookup failed — omitting location block', error)
      }
      try {
        story = await database.getStory(input.storyId)
      } catch (error) {
        log('story lookup failed — omitting story-setting block', error)
      }
    }

    const ctx = new ContextBuilder()
    ctx.add({
      sceneIntent: input.scenePrompt.trim() || '(the narration gave no explicit scene prompt)',
      narrativeBeat: narrativeContext(input.narrativeText),
      subjectCount: String(subjects.length),
      subjectDossier: buildProseSubjectDossier(
        input.presentCharacters,
        input.tagCharacterNames,
        input.beMode,
      ),
      storySetting: buildStorySettingBlock(story),
      povGuidance: buildProsePovGuidance(story?.settings?.pov),
      locationBlock: buildLocationBlock(location),
    })
    const { system, user: prompt } = await ctx.render(PROSE_WRITER_TEMPLATE_ID)

    const raw = await generateStructured(
      { presetId, schema: proseScenePromptSchema, system, prompt },
      SERVICE_ID,
    )
    const written = capProsePrompt(raw.prompt ?? '')
    if (written.length < 40) {
      log('prose prompt writer returned too little — falling back', { length: written.length })
      return null
    }
    log('wrote prose scene prompt', {
      subjects: subjects.map((c) => c.name),
      length: written.length,
    })
    return written
  } catch (error) {
    log('prose prompt writer failed — falling back', error)
    return null
  }
}

/** POV guidance in prose terms (the booru one speaks in tags). */
export function buildProsePovGuidance(pov: string | null | undefined): string {
  if (pov === 'first' || pov === 'second' || pov === 'hybrid') {
    return `## Camera and POV
This story is told through the protagonist's eyes. Frame the picture the same way: the protagonist is the camera or an unseen/barely-seen presence (over-the-shoulder, first-person hands at the frame edge where the scene supports it); never depict the protagonist's face.
`
  }
  if (pov === 'third') {
    return `## Camera and POV
This story is narrated in third person. Frame the picture as an observed scene — the protagonist, when present, may be depicted fully like any other character.
`
  }
  return ''
}

/**
 * Gate: the dedicated prose writer runs only when enabled (default on) and the
 * target model is a prose-dialect model. Returns the rewritten paragraph or the
 * original prompt unchanged.
 */
export async function resolveProseScenePrompt(input: ProsePromptWriterInput): Promise<string> {
  if (settings.systemServicesSettings.imageGeneration.dedicatedProsePromptWriter === false) {
    return input.scenePrompt
  }
  if (detectPromptDialect(input.model) !== 'prose') return input.scenePrompt
  const written = await writeProseScenePrompt(input)
  return written ?? input.scenePrompt
}
