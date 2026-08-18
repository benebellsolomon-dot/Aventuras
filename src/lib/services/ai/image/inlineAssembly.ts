/**
 * Shared inline-image request assembly.
 *
 * Both inline paths — InlineImageService (post-hoc, per entry) and
 * InlineImageTracker (live, during streaming) — build a <pic> generation
 * request the same way: BE size-grounding, single-subject state cues,
 * per-character LoRA trigger words + tier-scaled LoRA file, the size-band
 * marker + style suffix, and the si-bridge structured spec. This module is the
 * single source of that logic so the two paths cannot drift (they previously
 * duplicated it, and LoRA/trigger wiring landed in only one).
 */

import {
  bandPosition,
  bandWord,
  groundImagePromptSize,
  imageStateCues,
  soloBodyState,
  uniformBodyStateTier,
} from '$lib/services/be'
import { sizeBandMarker, tierMarker } from './sizeBandMarker'
import { detectPromptDialect, BOORU_QUALITY_PREFIX } from './dialect'
import { maybeBuildBridgeSpec } from './bridgeSpec'
import { resolveLora, loraTriggerText, type ResolvedLora } from './loraBinding'
import type { StructuredImageSpecInput } from './providers/types'
import type { Character, ImageProviderType } from '$lib/types'

export interface InlineAssemblyInput {
  /** All characters present in the scene (identity + bodyState + loraConfig source). */
  presentCharacters: Character[]
  /** The LLM-written <pic> prompt. */
  tagPrompt: string
  /** Character names named on the <pic> tag. */
  tagCharacters: string[]
  /** Whether this is a BE-mode story (gates size grounding + cues + spec). */
  beMode: boolean
  /** Resolved style prompt appended to the final prompt. */
  stylePrompt: string
  /** Full narrative beat — extra signal for the bridge intimacy/location gates. */
  narrativeText: string
  /** Active image provider (gates si-bridge spec assembly). */
  providerType?: ImageProviderType
  /** Image model id — selects the prompt dialect (booru vs prose). */
  model?: string
}

export interface InlineAssemblyResult {
  /** Final prompt sent to the provider (marker + trigger words + grounded scene + style). */
  fullPrompt: string
  /** si-bridge structured spec, when one assembles; other providers ignore it. */
  bridgeSpec?: StructuredImageSpecInput
  /** Per-character LoRA for a single unambiguous subject; undefined otherwise. */
  loraOverride?: ResolvedLora
}

/**
 * Assemble a <pic> generation request. Pure aside from the logging-free BE/
 * bridge helpers it calls.
 */
export function assembleInlineImage(input: InlineAssemblyInput): InlineAssemblyResult {
  const { presentCharacters, tagPrompt, tagCharacters, beMode, stylePrompt, narrativeText } = input

  // BE size-grounding: only when the tagged bodyState-carrying characters share
  // one band (mixed-band multi-character prompts stay ungrounded — one size
  // would render the others wrong). The cue-less grounded scene is what the
  // spec builder sees; cues ride the spec's extra_tags.
  const beTier = beMode ? uniformBodyStateTier(presentCharacters, tagCharacters) : null
  const groundedScene = beTier !== null ? groundImagePromptSize(tagPrompt, beTier) : tagPrompt
  let groundedPrompt = groundedScene

  // State cues (engorgement/arousal) apply only for a single unambiguous
  // subject. The prompt writer now sees the same cues in its body-state block,
  // so skip any it already copied in — this append is the enforcement backstop.
  if (beMode) {
    const solo = soloBodyState(presentCharacters, tagCharacters)
    const cues = (solo ? imageStateCues(solo) : []).filter(
      (cue) => !groundedPrompt.toLowerCase().includes(cue.slice(0, 24).toLowerCase()),
    )
    if (cues.length > 0) groundedPrompt = `${groundedPrompt}, ${cues.join(', ')}`
  }

  // Per-character LoRA: trigger words for every tagged character (prompt text,
  // provider-agnostic) prepended up front; a LoRA file only for a single
  // unambiguous subject, since one workflow slot can't stack several. Weight
  // scales with that subject's engine tier.
  const taggedChars = presentCharacters.filter((c) =>
    tagCharacters.some((n) => n.toLowerCase() === c.name.toLowerCase()),
  )
  const triggerText = loraTriggerText(taggedChars.map((c) => c.loraConfig))
  if (triggerText) groundedPrompt = `${triggerText}, ${groundedPrompt}`
  let loraOverride: ResolvedLora | undefined
  if (taggedChars.length === 1) {
    const soloTier = soloBodyState(presentCharacters, tagCharacters)?.tier ?? 0
    loraOverride = resolveLora(taggedChars[0].loraConfig, soloTier) ?? undefined
  }

  // The __betier__ marker is only parsed by si-bridge (native) and the a1111
  // shim — every other provider would receive it as literal garbage tokens.
  // When the engine tier is known it goes in directly (exact); the text-derived
  // marker is the fallback for band words the LLM wrote on its own.
  const markerConsumers: ReadonlyArray<ImageProviderType | undefined> = ['si-bridge', 'a1111']
  const marker = markerConsumers.includes(input.providerType)
    ? tierMarker(beTier) || sizeBandMarker(groundedPrompt)
    : ''

  // Booru-trained models (Illustrious/Pony/...) get a tag quality prefix and NO
  // prose style block — a flowing style paragraph degrades tag adherence.
  const dialect = detectPromptDialect(input.model)

  // Within-band tier reinforcement (booru only): the band word alone flattens
  // an 8-tier range into one string; A1111 emphasis scaled by the tier's
  // position inside its band pushes the render toward the right end of it.
  if (dialect === 'booru' && beTier !== null) {
    const word = bandWord(beTier)
    const weight = 1 + 0.2 * bandPosition(beTier)
    if (weight > 1.01) {
      groundedPrompt = groundedPrompt.replace(
        new RegExp(word, 'i'),
        `(${word}:${weight.toFixed(2)})`,
      )
    }
  }

  const fullPrompt =
    dialect === 'booru'
      ? `${marker}${BOORU_QUALITY_PREFIX}, ${groundedPrompt}`
      : `${marker}${groundedPrompt}. ${stylePrompt}`

  const bridgeSpec =
    maybeBuildBridgeSpec({
      providerType: input.providerType,
      beMode,
      presentCharacters,
      tagCharacterNames: tagCharacters,
      sceneText: groundedScene,
      narrativeText,
    }) ?? undefined

  return { fullPrompt, bridgeSpec, loraOverride }
}
