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
  apparentTier,
  BAND_WORD_THRESHOLDS,
  imageStateCues,
  readBodyState,
  sniffTierFromText,
  soloBodyState,
} from '$lib/services/be'
import { combineSceneIntimacy, inferBridgeLocation, inferSceneIntimacy } from './sceneInference'
import { createLogger } from '$lib/log'

const log = createLogger('BridgeSpec')

/** Minimal structural slice of Character that spec assembly needs. */
export interface BridgeSpecSubject {
  name: string
  visualDescriptors?: {
    face?: string
    hair?: string
    eyes?: string
    build?: string
    clothing?: string
    distinguishing?: string
  } | null
  /** Curated image-tag bank; overrides derived identity tags when set (see resolveIdentityTags). */
  imageTags?: string | null
  /** Per-character LoRA binding (trigger words + tier-scaled weight); consumed by the portrait/inline paths. */
  loraConfig?: import('$lib/types').CharacterLoraConfig | null
  metadata: Record<string, unknown> | null
}

/**
 * Identity travels as identity_tags — the bridge consumes appearance_excerpt
 * ONLY for skin-tone inference (compose_identity_tags, source-verified
 * 2026-07-19), so free text alone silently dropped hair/eyes/face/build.
 *
 * ATOMIC + WEIGHTED (dry-run-verified 2026-07-19): a whole descriptor field as
 * one prose-blob tag reads weakly on the Illustrious path, where the tier
 * machinery appends a dozen weighted size tags — identity lost every time.
 * Each field splits into short atomic tags, and the species-critical fields
 * (face, distinguishing — ears/horns/tail/markings) carry an explicit weight
 * so they compete with the size cluster. A1111 (tag:weight) syntax passes
 * through both bridge pipelines unchanged.
 */
const IDENTITY_EMPHASIS = 1.15
const MIN_TAG_LENGTH = 3

const atomicTags = (text: string | undefined): string[] =>
  (text ?? '')
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TAG_LENGTH)

export function identityTagsFromDescriptors(
  d: BridgeSpecSubject['visualDescriptors'],
): string[] | undefined {
  if (!d) return undefined
  const emphasized = [...atomicTags(d.face), ...atomicTags(d.distinguishing)].map(
    (t) => `(${t}:${IDENTITY_EMPHASIS})`,
  )
  const plain = [...atomicTags(d.hair), ...atomicTags(d.eyes)]
  const tags = [...emphasized, ...plain]
  return tags.length > 0 ? tags : undefined
}

/**
 * Parse a curated image-tag bank into atomic identity tags. Splits on comma,
 * semicolon, and newline; strips size vocabulary (BAND_WORD_PATTERN) so a stray
 * size word in the bank can never fight the engine's tier authority. Tags are
 * kept verbatim otherwise — the user curates order and any (tag:weight) emphasis.
 */
export function curatedIdentityTags(imageTags: string | null | undefined): string[] | undefined {
  const tags = (imageTags ?? '')
    .split(/[;,\n]/)
    .map((t) =>
      t
        .replace(BAND_WORD_PATTERN, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter((t) => t.length >= MIN_TAG_LENGTH)
  return tags.length > 0 ? tags : undefined
}

/**
 * The identity_tags for a subject: the curated bank wins when present, otherwise
 * fall back to tags derived from the canonical visual descriptors.
 */
export function resolveIdentityTags(
  imageTags: string | null | undefined,
  d: BridgeSpecSubject['visualDescriptors'],
): string[] | undefined {
  return curatedIdentityTags(imageTags) ?? identityTagsFromDescriptors(d)
}

// Bridge build vocabulary: petite/slim/average/curvy/athletic/full.
const BUILD_KEYWORDS: ReadonlyArray<readonly [string, RegExp]> = [
  ['petite', /\b(?:petite|tiny|diminutive)\b/i],
  ['slim', /\b(?:slim|slender|willowy|lithe|thin)\b/i],
  ['athletic', /\b(?:athletic|toned|muscular|fit)\b/i],
  ['curvy', /\b(?:curvy|voluptuous|hourglass|buxom)\b/i],
  ['full', /\b(?:full[- ]figured|plump|soft|chubby|plush)\b/i],
  ['average', /\baverage\b/i],
]

/** Map a free-text build descriptor onto the bridge's build vocabulary; undefined on no match. */
export function mapBridgeBuild(build: string | undefined): string | undefined {
  const s = (build ?? '').trim()
  if (!s) return undefined
  for (const [key, pattern] of BUILD_KEYWORDS) {
    if (pattern.test(s)) return key
  }
  return undefined
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
  const joined = [d?.face, d?.hair, d?.eyes, d?.build, d?.distinguishing]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join('; ')
  // The bridge reads appearance_excerpt only for skin-tone inference. When a
  // character relies on the image-tag bank and leaves descriptors empty, fall
  // back to the bank text so skin tone is still recoverable from it.
  const source = joined || (subject.imageTags ?? '').trim()
  if (!source) return undefined
  return source.length > MAX_APPEARANCE_CHARS ? source.slice(0, MAX_APPEARANCE_CHARS) : source
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
  // Sentence boundaries ONLY — splitting on commas shredded the model's scene
  // direction into disordered fragments (clauses like "leaning on the counter,
  // mug in hand" must survive intact).
  for (const piece of stripped.split(/[.;\n]+/)) {
    const tag = piece.replace(/\s*,\s*,+/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '')
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
  const clothingTags: string[] = []
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
      // Apparent tier (research/49 R6): engorgement renders a size larger than
      // she taped. PRESENTATION only — nothing writes this back to her state.
      tier_index: bridgeTierIndex(apparentTier(state)),
      breast_shape: state.shape,
      build: mapBridgeBuild(subject.visualDescriptors?.build),
      identity_tags: resolveIdentityTags(subject.imageTags, subject.visualDescriptors),
      appearance_excerpt: appearanceExcerpt(subject),
    })
    for (const moment of growthMoments(state)) {
      if (!beMoments.includes(moment)) beMoments.push(moment)
    }
    // Canonical outfit rides the scene (identity_tags stay outfit-free — the
    // appearance hash excludes clothing so sets don't thrash per-scene).
    const clothing = subject.visualDescriptors?.clothing?.trim()
    if (clothing) clothingTags.push(`${subject.name} wearing ${clothing}`)
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
    scene_tags: [...clothingTags, ...sceneTags(sceneText)],
    // Scene text only — the narrative beat routinely names locations the
    // image is not set in (a wrong curated key is worse than none).
    location: inferBridgeLocation(sceneText),
  }
  if (beMoments.length > 0) spec.be_moments = beMoments
  if (characters.length > 1) spec.regional = true
  if (cues.length > 0) spec.extra_tags = cues
  return spec
}

/** Portrait framing contract — FULL BODY: portraits double as standees and FaceID/pose sources. */
export const PORTRAIT_FRAMING_TAGS: readonly string[] = [
  'solo',
  'full body',
  'standing',
  'looking at viewer',
]

/** Default tier for portrait subjects without engine state or size vocabulary. */
const PORTRAIT_FALLBACK_TIER = 14

/**
 * Structured spec for a character portrait (si-bridge portraits previously
 * sent prose-only — no tier, identity dropped bridge-side). Tier priority:
 * engine bodyState → size vocabulary sniffed from the descriptors → bridge
 * default. Works for story characters AND pre-story wizard subjects
 * (metadata null).
 */
export function buildPortraitSpec(subject: BridgeSpecSubject): StructuredImageSpecInput {
  const state = readBodyState(subject.metadata)
  const d = subject.visualDescriptors
  const descriptorText = [d?.face, d?.hair, d?.eyes, d?.build, d?.distinguishing]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join('; ')
  const tier = state?.tier ?? sniffTierFromText(descriptorText) ?? PORTRAIT_FALLBACK_TIER

  const clothing = d?.clothing?.trim()
  return {
    register: 'color',
    style_preset: 'semireal',
    intimacy: 'clean',
    characters: [
      {
        tier_index: bridgeTierIndex(tier),
        breast_shape: state?.shape,
        build: mapBridgeBuild(d?.build),
        identity_tags: resolveIdentityTags(subject.imageTags, d),
        appearance_excerpt: descriptorText || undefined,
      },
    ],
    scene_tags: [...(clothing ? [`wearing ${clothing}`] : []), ...PORTRAIT_FRAMING_TAGS],
  }
}

/** `data:<mediatype>;base64,` — the only data-URL form carrying a payload. */
const BASE64_DATA_URL_PREFIX = /^data:[^,]*;base64,/i
/** A bare payload (what the bridge field wants); a URL never matches — ':' and '.' are not base64. */
const RAW_BASE64 = /^[A-Za-z0-9+/\s]+={0,2}$/

export interface BridgeAnchorInput {
  /** Active image provider for THIS request (the reference profile, when one is in play). */
  providerType: string | undefined
  /** Pipeline pin from the same profile — a krea2 pin cannot carry an anchor. */
  model: string | undefined
  /** Portrait/anchor references the caller gathered, data URL or raw base64. */
  referenceImages?: ReadonlyArray<string>
}

/**
 * The si-bridge identity anchor for a reference-carrying request (Spec 4 B1).
 *
 * The bridge has no img2img reference list: identity travels on the FaceID/
 * OpenPose channel as a single `pose_face_anchor_b64`, so the first reference
 * becomes the anchor and any further ones are the caller's to report. A krea2
 * pin yields none — image conditioning forces the Illustrious route, which the
 * pin exists to prevent (the provider drops it there anyway).
 *
 * The field is `pose_face_anchor_b64` — a PAYLOAD, not a locator. A portrait
 * stored as an http(s) URL (or any other non-base64 reference) is therefore
 * skipped rather than sent, which the bridge would reject or, worse, hash into
 * a garbage anchor.
 */
export function bridgeIdentityAnchor(input: BridgeAnchorInput): string | undefined {
  if (input.providerType !== 'si-bridge' || input.model === 'krea2') return undefined
  const first = (input.referenceImages ?? []).map((ref) => ref.trim()).find((ref) => ref.length > 0)
  if (!first) return undefined
  if (BASE64_DATA_URL_PREFIX.test(first)) return first.replace(BASE64_DATA_URL_PREFIX, '')
  if (RAW_BASE64.test(first)) return first
  log('reference is not a base64 payload — sending no identity anchor', {
    reference: first.slice(0, 24),
  })
  return undefined
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
