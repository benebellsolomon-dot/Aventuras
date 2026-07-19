/**
 * StructuredImageSpec assembly for the si-bridge provider (Spec 2 Tasks 4-5).
 *
 * Pure — no store/database deps; the InlineImageService call site feeds it the
 * present characters + tag names and passes the result through the registry.
 *
 * tier_index calibration (2026-07-19, replaces the /image/build dry-run that
 * 401s without the PC-side key): the app's BAND_WORD_THRESHOLDS and the
 * deployed bridge's tier_to_cup_tag / _KREA_TIER_NOUNS tables agree at every
 * band boundary (flat 0 / small 1-3 / medium 4-13 / large 14-21 / huge 22-29 /
 * gigantic 30-39 / hyper 40+), verified against the deployed-truth GitHub main
 * source. The scalars are the same 0-51 cup-band ladder, so the mapping is the
 * IDENTITY — strictly better than routing through the sizeBandMarker anchors,
 * which snap every tier to the top of its band. (Cup LETTERS diverge — the app
 * re-anchored via research/38 — but letters never enter the image pipeline.)
 * Residual: beyond-ZZ (tier > 51) measurement curves are not cross-verified.
 */

import type { BridgeSpecCharacter, StructuredImageSpecInput } from './providers/types'
import {
  BAND_WORD_THRESHOLDS,
  imageStateCues,
  readBodyState,
  soloBodyState,
} from '$lib/services/be'
import { combineSceneIntimacy, inferBridgeLocation, inferSceneIntimacy } from './sceneInference'

/** Minimal structural slice of Character that spec assembly needs. */
export interface BridgeSpecSubject {
  name: string
  visualDescriptors?: {
    face?: string
    hair?: string
    eyes?: string
    build?: string
    distinguishing?: string
  } | null
  metadata: Record<string, unknown> | null
}

export interface BridgeSpecBuildInput {
  presentCharacters: ReadonlyArray<BridgeSpecSubject>
  tagCharacterNames: ReadonlyArray<string>
  /** The grounded <pic> prompt — becomes scene_tags (minus size vocabulary). */
  sceneText: string
  /** The full narrative beat — extra signal for the intimacy/location gates. */
  narrativeText: string
}

/** Delta at/above which the growth beat renders as clothing failure, not just strain. */
const GROWTH_BURST_DELTA = 2
const MAX_SCENE_TAGS = 16
const MAX_APPEARANCE_CHARS = 400

// Size vocabulary is stripped from scene_tags — tier_index is the single size
// authority on the native path. Derived from the ladder's own table so a future
// band word can't drift out of the strip pattern.
const BAND_WORD_PATTERN = new RegExp(
  `\\b(?:${BAND_WORD_THRESHOLDS.map((row) => row.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
)

/**
 * App engine tier → bridge tier_index. Identity on the shared 0-51 band scalar
 * (calibration note in the file header); the single swap point if the bridge
 * ladder ever moves.
 */
export function bridgeTierIndex(tier: number): number {
  if (!Number.isFinite(tier)) return 0
  return Math.max(0, Math.round(tier))
}

function appearanceExcerpt(subject: BridgeSpecSubject): string | undefined {
  const d = subject.visualDescriptors
  if (!d) return undefined
  const joined = [d.face, d.hair, d.eyes, d.build, d.distinguishing]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join('; ')
  if (!joined) return undefined
  return joined.length > MAX_APPEARANCE_CHARS ? joined.slice(0, MAX_APPEARANCE_CHARS) : joined
}

function growthMoments(state: { lastGrowth?: { delta: number } }): string[] {
  if (!state.lastGrowth || state.lastGrowth.delta <= 0) return []
  return state.lastGrowth.delta >= GROWTH_BURST_DELTA
    ? ['mid_expansion', 'shirt_rip', 'shock']
    : ['mid_expansion', 'strain']
}

function sceneTags(sceneText: string): string[] {
  const stripped = String(sceneText || '').replace(BAND_WORD_PATTERN, '')
  const seen = new Set<string>()
  const tags: string[] = []
  for (const piece of stripped.split(/[,.;\n]+/)) {
    const tag = piece.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MAX_SCENE_TAGS) break
  }
  return tags
}

/**
 * Build the structured spec for one <pic> tag. Only tagged characters carrying
 * engine bodyState become spec characters (their tier_index is authoritative);
 * state-less characters stay described by the scene tags. Returns null when no
 * tagged character has bodyState — the caller falls back to the prompt path.
 */
export function buildStructuredImageSpec(
  input: BridgeSpecBuildInput,
): StructuredImageSpecInput | null {
  const { presentCharacters, tagCharacterNames, sceneText, narrativeText } = input

  const characters: BridgeSpecCharacter[] = []
  // be_moments live at SPEC level in the deployed contract (SpecCharacter has no
  // such field — character-level entries are silently swallowed by extra="allow",
  // and the spec-level field is also the sub-tier-22 Illustrious routing trigger).
  const beMoments: string[] = []
  const seenNames = new Set<string>()
  for (const name of tagCharacterNames) {
    const key = name.toLowerCase()
    if (seenNames.has(key)) continue
    seenNames.add(key)
    const subject = presentCharacters.find((c) => c.name.toLowerCase() === key)
    if (!subject) continue
    const state = readBodyState(subject.metadata)
    if (!state) continue
    characters.push({
      tier_index: bridgeTierIndex(state.tier),
      breast_shape: state.shape,
      appearance_excerpt: appearanceExcerpt(subject),
    })
    for (const moment of growthMoments(state)) {
      if (!beMoments.includes(moment)) beMoments.push(moment)
    }
  }

  if (characters.length === 0) return null

  // Engorgement/arousal cues only for a single unambiguous subject — a shared
  // prompt can't wear one character's state (same rule as the prompt path).
  const solo = soloBodyState(presentCharacters, tagCharacterNames)
  const cues = solo ? imageStateCues(solo) : []

  // The scene text is the primary rating signal; the narrative beat can raise
  // it one step at most. Visible engorgement floors a clean rating at
  // suggestive so the rating never contradicts the cue tags.
  let intimacy = combineSceneIntimacy(
    inferSceneIntimacy(sceneText),
    inferSceneIntimacy(narrativeText),
  )
  if (intimacy === 'clean' && cues.length > 0) intimacy = 'suggestive'

  const spec: StructuredImageSpecInput = {
    register: 'color',
    style_preset: 'semireal',
    intimacy,
    characters,
    scene_tags: sceneTags(sceneText),
    // Scene text only — the narrative beat routinely names locations the
    // image is not set in (a wrong curated key is worse than none).
    location: inferBridgeLocation(sceneText),
  }
  if (beMoments.length > 0) spec.be_moments = beMoments
  if (characters.length > 1) spec.regional = true
  if (cues.length > 0) spec.extra_tags = cues
  return spec
}

/**
 * Call-site gate shared by the streaming tracker and the per-entry service:
 * spec assembly applies only to beMode stories rendering through si-bridge.
 */
export function maybeBuildBridgeSpec(
  input: BridgeSpecBuildInput & { providerType: string | undefined; beMode: boolean },
): StructuredImageSpecInput | undefined {
  if (!input.beMode || input.providerType !== 'si-bridge') return undefined
  return buildStructuredImageSpec(input) ?? undefined
}
