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
  apparentTier,
  bandPosition,
  bandWord,
  groundImagePromptSize,
  imageStateCues,
  readBodyState,
  soloBodyState,
  uniformBodyStateTier,
} from '$lib/services/be'
import { sizeBandMarker, tierMarker } from './sizeBandMarker'
import { detectPromptDialect, BOORU_QUALITY_PREFIX } from './dialect'
import { compressStateCues, flattenTagGroups } from './booruTags'
import { parsesPromptWeighting } from './providerCapabilities'
import { maybeBuildBridgeSpec } from './bridgeSpec'
import { resolveLora, loraTriggerText, type ResolvedLora } from './loraBinding'
import type { StructuredImageSpecInput } from './providers/types'
import type { Character, ImageProviderType } from '$lib/types'

/**
 * Baseline A1111 emphasis on the engine's band word for booru models. Modest on
 * purpose — 1.2 is enough to hold the size against the model's default pull,
 * while higher weights start deforming anatomy.
 */
const BOORU_SIZE_WEIGHT_BASE = 1.2

/** Extra emphasis added across a band, 0 at its floor and this at its top. */
const BOORU_SIZE_WEIGHT_BAND_SPAN = 0.1

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
  const { presentCharacters, tagCharacters, beMode, stylePrompt, narrativeText } = input

  // Booru-trained models (Illustrious/Pony/...) get a tag quality prefix and NO
  // prose style block — a flowing style paragraph degrades tag adherence.
  const dialect = detectPromptDialect(input.model)

  // Pseudo-regional clauses — "(on the left, 1girl, blonde hair, …)" — are a
  // prose-model habit that booru models cannot use (no regional prompter): the
  // parens only put 1.1x emphasis on a comma glob. Flattened for the booru
  // dialect so the tags read as one run, whether they came from the dedicated
  // writer or from a story model's own <pic> prompt.
  const tagPrompt = dialect === 'booru' ? flattenTagGroups(input.tagPrompt) : input.tagPrompt

  const taggedChars = presentCharacters.filter((c) =>
    tagCharacters.some((n) => n.toLowerCase() === c.name.toLowerCase()),
  )

  // BE size-grounding: only when the tagged bodyState-carrying characters share
  // one band (mixed-band multi-character prompts stay ungrounded — one size
  // would render the others wrong). The cue-less grounded scene is what the
  // spec builder sees; cues ride the spec's extra_tags.
  const beTier = beMode ? uniformBodyStateTier(presentCharacters, tagCharacters) : null

  // Grounding runs at the APPARENT tier (research/49 R6), not the real one:
  // the prompt writer's reinforcement block already advertised the apparent
  // band word plus its size anchor, so re-grounding at the real tier rewrote
  // the band word smaller while the apparent anchor stayed — one prompt, two
  // sizes. Presentation only; the LoRA weight and si-bridge spec keep their
  // own authority (the spec reads apparentTier per character already).
  // The bump keeps the same uniformity contract as beTier itself: it applies
  // only when every tagged bodyState carrier lands on ONE apparent band word.
  // A mixed pair (one engorged across a band boundary, one not) falls back to
  // the shared real tier — otherwise the single scene band word would render
  // the non-engorged co-subject a band too large.
  const apparentTiers =
    beTier === null
      ? []
      : taggedChars
          .map((c) => readBodyState(c.metadata))
          .filter((state): state is NonNullable<typeof state> => state !== null)
          .map((state) => apparentTier(state))
  const apparentUniform =
    apparentTiers.length > 0 &&
    apparentTiers.every((t) => bandWord(t) === bandWord(apparentTiers[0]))
  const renderTier =
    beTier === null ? null : apparentUniform ? Math.max(beTier, ...apparentTiers) : beTier
  const groundedScene =
    renderTier !== null ? groundImagePromptSize(tagPrompt, renderTier) : tagPrompt
  let groundedPrompt = groundedScene

  // State cues (engorgement/arousal) apply only for a single unambiguous
  // subject. The prompt writer now sees the same cues in its body-state block,
  // so skip any it already copied in — this append is the enforcement backstop.
  // Booru dialect renders them as the tags the model actually knows
  // (`lactation`, `breast expansion`, `blush`) — the engine's prose wording
  // costs ~10 tokens of CLIP attention for vocabulary the model has never seen.
  if (beMode) {
    const solo = soloBodyState(presentCharacters, tagCharacters)
    const engineCues = solo ? imageStateCues(solo) : []
    const dialectCues = dialect === 'booru' ? compressStateCues(engineCues) : engineCues
    const cues = dialectCues.filter(
      (cue) => !groundedPrompt.toLowerCase().includes(cue.slice(0, 24).toLowerCase()),
    )
    if (cues.length > 0) groundedPrompt = `${groundedPrompt}, ${cues.join(', ')}`
  }

  // Per-character LoRA: trigger words for every tagged character (prompt text,
  // provider-agnostic) prepended up front; a LoRA file only for a single
  // unambiguous subject, since one workflow slot can't stack several. Weight
  // scales with that subject's engine tier.
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
  // The marker carries the RENDER tier: it is the bridge's authoritative size
  // lever and must agree with the grounded band word / spec, or the engorgement
  // swell is silently discarded on exactly the providers R6 targets. Portrait/
  // anchor paths compute their own marker from the real tier and never pass here.
  const marker = markerConsumers.includes(input.providerType)
    ? tierMarker(renderTier) || sizeBandMarker(groundedPrompt)
    : ''

  // Size emphasis (booru only): SD models pull every size back toward their
  // training default, so the plain band word loses — the engine's size only
  // lands with explicit emphasis on it. A constant base weight carries the band
  // itself; the within-band term adds the tier's position inside its band, since
  // the word alone flattens an 8-tier range into one string ("huge breasts" at
  // tier 29 must render larger than at 22).
  // Reads renderTier, not beTier: the word actually sitting in the grounded
  // prompt is the apparent one, so the real-tier word would match nothing.
  // Gated on provider capability: endpoint providers (nanogpt, cloud APIs)
  // don't parse A1111 `(tag:weight)` syntax and would receive it as literal
  // garbage tokens — they keep the plain band word instead.
  if (dialect === 'booru' && renderTier !== null && parsesPromptWeighting(input.providerType)) {
    const word = bandWord(renderTier)
    // Computed in hundredths so the emitted weight is an exact 2-decimal grid
    // value rather than a float artifact (1.275 → "1.27").
    const weight =
      Math.round(
        BOORU_SIZE_WEIGHT_BASE * 100 + BOORU_SIZE_WEIGHT_BAND_SPAN * 100 * bandPosition(renderTier),
      ) / 100
    groundedPrompt = groundedPrompt.replace(new RegExp(word, 'i'), `(${word}:${weight.toFixed(2)})`)
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
