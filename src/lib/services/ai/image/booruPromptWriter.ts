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
 * ORDER (research/56): the call returns SECTIONS, and `composeBooruScenePrompt`
 * joins them — rating, camera, count, ACTION, SIZE, characters, scene. Asking the LLM
 * for one finished string put the two per-character identity clauses ahead of
 * the pose and setting tags, which then sat past CLIP's ~75-token attention
 * window; the model rendered the identities and invented its own scene (a bed
 * scene came back as a standing hallway shot). Order is deterministic here.
 *
 * EXPRESSION: each character's run ends in her own 1-3 expression tags, merged
 * from the writer's read of the narrative beat and the engine's deterministic
 * soft state (see expressionTags.ts). Per-character by construction — a shared
 * mood block would put the same face on everyone in frame.
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
  BAND_WORD_THRESHOLDS,
  IMAGE_SIZE_ANCHOR_PHRASES,
  apparentTier,
  bandWord,
  imageSizeAnchor,
  imageStateCues,
  readBodyState,
} from '$lib/services/be'
import { generateStructured } from '../sdk/generate'
import { detectPromptDialect } from './dialect'
import { compressStateCues, joinTags, toTags } from './booruTags'
import { engineExpressionTags, isExpressionTag } from './expressionTags'
import type { Character, Location, VisualDescriptors } from '$lib/types'

const log = createLogger('BooruPromptWriter')

/** Rides the image-generation preset — same LLM that authors the identity bank. */
const SERVICE_ID = 'imageGeneration'

/** User-editable vault prompt this call renders (see prompts/templates/image.ts). */
const TEMPLATE_ID = 'image-booru-scene-prompt'

/** Cap the narrative-beat context so it stays a hint, not the bulk of the prompt. */
const NARRATIVE_CONTEXT_CHARS = 1200

/**
 * Soft tag budget for the composed prompt (research/56): CLIP attends to roughly
 * the first 75 tokens, and a booru tag averages ~1.5 of them. ~60 tags plus the
 * quality prefix keeps the whole scene inside the window that actually renders.
 */
export const BOORU_MAX_TAGS = 60

/** Floors for the trimmable blocks — a scene still needs a place and a beat. */
const MIN_SCENE_TAGS = 3
const MIN_ACTION_TAGS = 2

/**
 * A face never loses its LAST expression tag: an expressionless character is the
 * exact failure this layer exists to fix, and setting detail has already been cut
 * to its own floor before expressions are touched at all.
 */
const MIN_EXPRESSION_TAGS = 1

/**
 * The writer emits SECTIONS, not one pre-ordered string: the final tag order is
 * the thing that was broken (identity clauses displaced the action and setting
 * past CLIP's attention window), and order enforced by `composeBooruScenePrompt`
 * is deterministic where order requested of an LLM is not.
 */
const booruScenePromptSchema = z.object({
  rating: z
    .string()
    .describe(
      'Content rating tags only: "general", "sensitive", or "explicit, uncensored, detailed anatomy".',
    ),
  camera: z
    .string()
    .describe(
      'Shot-type tag plus an optional angle tag (e.g. "cowboy shot, from above"). Wide enough to show everyone and the setting.',
    ),
  countTags: z
    .string()
    .describe(
      'Booru count tags for EVERY person in frame, including unnamed ones (e.g. "1boy, 1girl", "2girls"). Never omitted.',
    ),
  action: z
    .string()
    .describe(
      'What the people are DOING: interaction/sex-act/pose tags (e.g. "hetero, paizuri, breast squeezing, lying on back"). The scene beat, not the people.',
    ),
  characters: z
    .array(z.string())
    .describe(
      'One FLAT comma-separated tag run per person, in the same order as the count tags: locked identity tags copied verbatim, then clothing, breast-size band. No parentheses. A male who is the story protagonist (the scene addresses him as "you") gets "pov, male pov, faceless male" plus at most "muscular" instead of a described 1boy.',
    ),
  expressions: z
    .array(z.string())
    .describe(
      'REQUIRED. One 1-3 tag expression run per person, SAME length and order as "characters": that person\'s own emotional state in THIS beat, as real danbooru expression tags (e.g. "blush, averted eyes"). Never a shared mood. Empty string only for a faceless protagonist-POV male.',
    ),
  scene: z
    .string()
    .describe(
      'Setting, furniture, time of day, light source and atmosphere tags. Lowest priority — trimmed first when the prompt runs long.',
    ),
})

export type BooruSceneSections = z.infer<typeof booruScenePromptSchema>

/** Band words + relative-size anchors, the vocabulary hoisted out of a run. */
const SIZE_TAG_VOCABULARY: ReadonlySet<string> = new Set([
  ...BAND_WORD_THRESHOLDS.map((row) => row.word.toLowerCase()),
  ...IMAGE_SIZE_ANCHOR_PHRASES.map((phrase) => phrase.toLowerCase()),
])

const isSizeTag = (tag: string): boolean => SIZE_TAG_VOCABULARY.has(tag.trim().toLowerCase())

// ============================================================================
// Engine-derived expression cues
// ============================================================================

/**
 * One girl's deterministic expression block plus the identity tags that let the
 * assembly find HER run among the writer's flat runs.
 */
export interface CharacterExpressionCue {
  /** Her locked identity bank, split into tags — the run-matching key. */
  identityTags: string[]
  /** Engine-derived expression tags, strongest signal first. */
  expressionTags: string[]
}

/** Identity tags a run must share with a cue before it counts as that subject. */
const MIN_IDENTITY_MATCH = 2

/** The faceless protagonist-POV run carries no expression — he has no face. */
const POV_RUN_TAGS: ReadonlySet<string> = new Set(['faceless male', 'male pov', 'pov'])

const isProtagonistRun = (run: ReadonlyArray<string>): boolean =>
  run.some((tag) => POV_RUN_TAGS.has(tag.trim().toLowerCase()))

/** Case-insensitive dedupe within a single list, keeping the first occurrence. */
function dedupeTags(tags: ReadonlyArray<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of tags) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/**
 * Attach each engine cue to the writer run that depicts that girl.
 *
 * The writer returns FLAT runs with no owner label, so the join is made on the
 * locked identity bank the template tells it to copy verbatim: the run sharing
 * the most bank tags (at least `MIN_IDENTITY_MATCH`, so a lone shared "1girl"
 * cannot claim a run) wins her cue. A subject with no bank yet has her prose
 * converted to tags and shares nothing verbatim, so unmatched cues fall back to
 * filling the remaining described runs in order — skipping the faceless POV run.
 *
 * Best-effort by design: a cue that finds no run simply contributes nothing, and
 * the writer's own beat-driven expressions still stand.
 */
export function assignEngineExpressions(
  runs: ReadonlyArray<ReadonlyArray<string>>,
  cues: ReadonlyArray<CharacterExpressionCue>,
): string[][] {
  const assigned: string[][] = runs.map(() => [])
  const runSets = runs.map((run) => new Set(run.map((tag) => tag.toLowerCase())))
  const claimed = new Set<number>()
  const unmatched: CharacterExpressionCue[] = []

  for (const cue of cues) {
    if (cue.expressionTags.length === 0) continue
    let best = -1
    let bestScore = 0
    for (let i = 0; i < runs.length; i++) {
      if (claimed.has(i)) continue
      const score = cue.identityTags.filter((tag) => runSets[i].has(tag.toLowerCase())).length
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best >= 0 && bestScore >= MIN_IDENTITY_MATCH) {
      claimed.add(best)
      assigned[best] = [...cue.expressionTags]
    } else {
      unmatched.push(cue)
    }
  }

  const open = runs
    .map((_, index) => index)
    .filter((index) => !claimed.has(index) && !isProtagonistRun(runs[index]))
  unmatched.forEach((cue, slot) => {
    const index = open[slot]
    if (index === undefined) return
    assigned[index] = [...cue.expressionTags]
  })

  return assigned
}

/** One character's run, split so expressions can be placed and budgeted apart. */
interface PreparedRun {
  /** Identity + clothing tags, in the writer's order. */
  base: string[]
  /** Her expression tags: engine-derived first, then the writer's. */
  expression: string[]
}

/**
 * Drop `count` expression tags from the tails of the longest runs first, never
 * taking a run below `MIN_EXPRESSION_TAGS`. Tail-first means the writer's
 * beat-driven extras go before the engine's — the engine owns the arousal axis.
 */
function trimExpressionRuns(runs: ReadonlyArray<PreparedRun>, count: number): PreparedRun[] {
  const lengths = runs.map((run) => run.expression.length)
  let remaining = count
  while (remaining > 0) {
    let target = -1
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] <= MIN_EXPRESSION_TAGS) continue
      if (target === -1 || lengths[i] > lengths[target]) target = i
    }
    if (target === -1) break
    lengths[target] -= 1
    remaining -= 1
  }
  return runs.map((run, i) => ({ base: run.base, expression: run.expression.slice(0, lengths[i]) }))
}

/**
 * Compose the writer's sections into the final booru tag order.
 *
 * Order is the fix (research/56): rating → camera → count → ACTION → SIZE →
 * characters → scene. The action block moved AHEAD of the per-character
 * identity runs because with two characters the identity blocks are ~20 tags
 * and pushed the sex-act/pose and setting tags past CLIP's ~75-token attention
 * window — the model then rendered identity only and invented its own scene.
 *
 * The size band words (and any relative-size anchor) are HOISTED out of the
 * character runs to sit immediately after the action block, in count-tag order.
 * They previously sat mid-run behind ~10 identity tags, and a live tier-24
 * subject prompted "huge breasts" under-rendered as "large". CLIP attention
 * falls off across the window and the backend parses no prompt weighting
 * (nanogpt — measured, see providerCapabilities.ts), so position is the only
 * emphasis lever left. Multi-subject runs keep their own bands, in order.
 *
 * EXPRESSION (this layer) stays INSIDE each character's run, at its tail —
 * after that person's identity and clothing, because it describes HER and must
 * not bleed onto the other subject. Each run's expressions are the engine's
 * deterministic tags first (ground truth for the arousal axis) and the writer's
 * beat-driven ones after.
 *
 * Tags are de-duplicated globally (the count tag routinely reappears inside a
 * character's own run) keeping the FIRST occurrence — which is what makes the
 * hoisted size copy the surviving one and drops the in-run duplicate. Expression
 * tags are the one deliberate exception: they dedupe only within their own run,
 * because two girls sharing a mood must BOTH render it and a global dedupe would
 * silently blank the second one's face.
 *
 * The total is capped at `BOORU_MAX_TAGS`. Drop order is setting → expression →
 * interaction; identity, size, rating, camera and count are never trimmed, and
 * each floor (3 setting, 1 expression per character, 2 interaction) holds.
 */
export function composeBooruScenePrompt(
  sections: Partial<BooruSceneSections>,
  engineExpressions: ReadonlyArray<CharacterExpressionCue> = [],
): string {
  const seen = new Set<string>()
  const dedupe = (tags: ReadonlyArray<string>): string[] => {
    const out: string[] = []
    for (const tag of tags) {
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(tag)
    }
    return out
  }

  const rating = dedupe(toTags(sections.rating))
  const camera = dedupe(toTags(sections.camera))
  const count = dedupe(toTags(sections.countTags))
  const action = dedupe(toTags(sections.action))
  // Size first, so the global dedupe keeps the hoisted copy and the in-run
  // duplicate falls away.
  const characterRuns = (sections.characters ?? []).map((run) => toTags(run))
  const size = dedupe(characterRuns.flatMap((run) => run.filter(isSizeTag)))
  const engineByRun = assignEngineExpressions(characterRuns, engineExpressions)
  const runs: PreparedRun[] = characterRuns.map((run, index) => ({
    base: dedupe(run.filter((tag) => !isExpressionTag(tag))),
    expression: dedupeTags([
      ...engineByRun[index],
      ...toTags(sections.expressions?.[index]),
      ...run.filter(isExpressionTag),
    ]),
  }))
  const scene = dedupe(toTags(sections.scene))

  const baseTotal = runs.reduce((total, run) => total + run.base.length, 0)
  const expressionTotal = (prepared: ReadonlyArray<PreparedRun>): number =>
    prepared.reduce((total, run) => total + run.expression.length, 0)
  const fixed = rating.length + camera.length + count.length + size.length + baseTotal
  const overBy = (sceneLength: number, expressionLength: number, actionLength: number): number =>
    fixed + sceneLength + expressionLength + actionLength - BOORU_MAX_TAGS

  const sceneOver = overBy(scene.length, expressionTotal(runs), action.length)
  const trimmedScene =
    sceneOver > 0 ? scene.slice(0, Math.max(MIN_SCENE_TAGS, scene.length - sceneOver)) : scene
  const expressionOver = overBy(trimmedScene.length, expressionTotal(runs), action.length)
  const trimmedRuns = expressionOver > 0 ? trimExpressionRuns(runs, expressionOver) : runs
  const actionOver = overBy(trimmedScene.length, expressionTotal(trimmedRuns), action.length)
  const trimmedAction =
    actionOver > 0 ? action.slice(0, Math.max(MIN_ACTION_TAGS, action.length - actionOver)) : action

  return joinTags([
    ...rating,
    ...camera,
    ...count,
    ...trimmedAction,
    ...size,
    ...trimmedRuns.flatMap((run) => [...run.base, ...run.expression]),
    ...trimmedScene,
  ])
}

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
 * Image-facing body-size phrase for a subject — the band word, a relative-size
 * anchor at large tiers, and any engorgement/arousal cues, all already in booru
 * tag form so the writer can copy them straight into the character's run. Uses
 * the APPARENT tier (research/49 R6) to match what `assembleInlineImage` grounds
 * on downstream, so the writer's band word and the grounding pass agree.
 *
 * The cup letter and the engine's prose cue wording are deliberately absent:
 * booru models know neither, and the dossier is copied nearly verbatim, so any
 * non-tag text here becomes wasted tokens inside CLIP's attention window.
 */
function bodyStatePhrase(metadata: Character['metadata']): string | null {
  const state = readBodyState(metadata)
  if (!state) return null
  const tier = apparentTier(state)
  const parts = [bandWord(tier)]
  const anchor = imageSizeAnchor(tier)
  if (anchor) parts.push(anchor)
  parts.push(...compressStateCues(imageStateCues(state)))
  return joinTags(parts)
}

/**
 * Image-facing expression phrase for a subject — the engine's deterministic
 * emotional read (arousal band, a growth that just landed, transformation
 * attitude, a bond extreme) already in booru tag form. Shown in the dossier so
 * the writer can copy it, AND merged deterministically at compose time so the
 * face survives even when the writer ignores it.
 */
function expressionPhrase(metadata: Character['metadata']): string | null {
  const state = readBodyState(metadata)
  if (!state) return null
  const tags = engineExpressionTags(state)
  return tags.length > 0 ? joinTags(tags) : null
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
      const expression = expressionPhrase(c.metadata)
      if (expression) {
        lines.push(
          `  expression (engine state — copy VERBATIM into her expression run, then add what the beat shows): ${expression}`,
        )
      }
    }

    return lines.join('\n')
  })

  return blocks.join('\n')
}

/**
 * Engine expression cues for the tagged subjects, in tag order — the
 * deterministic half of the expression layer, handed to
 * `composeBooruScenePrompt` so it lands in each girl's own run regardless of
 * what the writer did with the dossier line.
 *
 * BE-mode gated for the same reason the body line is: the BE reducer is the only
 * writer of this state, so outside a BE story there is nothing to read and the
 * writer's beat-driven expressions stand alone.
 */
export function buildExpressionCues(
  presentCharacters: Character[],
  tagCharacterNames: string[],
  beMode: boolean,
): CharacterExpressionCue[] {
  if (!beMode) return []
  const cues: CharacterExpressionCue[] = []
  for (const character of resolveSubjects(presentCharacters, tagCharacterNames)) {
    const state = readBodyState(character.metadata)
    if (!state) continue
    const expressionTags = engineExpressionTags(state)
    if (expressionTags.length === 0) continue
    cues.push({ identityTags: toTags(normalizeBank(character.imageTags)), expressionTags })
  }
  return cues
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

    // Order is imposed here, not asked of the model: the sections come back
    // labelled, so the attention-critical action-before-identity ordering and
    // the tag budget are deterministic. The engine's expression cues merge into
    // the matching character run at the same time.
    const rawWritten = composeBooruScenePrompt(
      raw,
      buildExpressionCues(input.presentCharacters, input.tagCharacterNames, input.beMode),
    )
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
