/**
 * Booru-dialect tag-string normalization (research/56 attention-window fix).
 *
 * SDXL booru finetunes (Illustrious / Pony / NoobAI) read the prompt through
 * CLIP, which attends most strongly to the first ~75 tokens. A measured failure:
 * a two-character bed scene rendered as a standing hallway shirt-lift with the
 * second subject as a background bystander, because the pose/interaction and
 * setting tags sat behind two long per-character clauses and never reached the
 * model's attention.
 *
 * Two shapes pushed the scene out of that window, and both are normalized here:
 *
 * 1. Pseudo-regional clauses — `(on the left, 1girl, blonde hair, …)`. Booru
 *    models have NO regional prompter; the parens are just a 1.1x emphasis on a
 *    comma glob, and the glob itself is what displaces the scene. Flattened to
 *    plain comma runs (`(tag:1.2)` weighting groups survive untouched).
 * 2. The engine's PROSE state cues — "breasts subtly swollen with Milk, skin
 *    gently taut". Booru models know none of that vocabulary, so it burns ~10
 *    tokens for nothing. Compressed to the real booru tags that carry the same
 *    signal (`lactation`, `breast expansion`, `blush`).
 *
 * The engine's own computation is untouched — this is a RENDERING layer for the
 * booru dialect only; the prose dialect keeps the engine's phrasing verbatim.
 */

import { BAND_WORD_THRESHOLDS, IMAGE_SIZE_ANCHOR_PHRASES, imageSizeAnchor } from '$lib/services/be'

/** Split a tag run into trimmed, non-empty tags (parenthesized globs flattened). */
export function toTags(text: string | null | undefined): string[] {
  return flattenTagGroups(text ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/** Re-join a tag list into a canonical `a, b, c` run. */
export function joinTags(tags: ReadonlyArray<string>): string {
  return tags.join(', ')
}

/**
 * Drop the parentheses around multi-tag globs, keeping their tags inline.
 *
 * Preserved deliberately:
 * - `(tag:1.2)` — real A1111 weighting on a single tag.
 * - `(tag)` — a single-tag 1.1x emphasis, which is a legitimate booru idiom.
 * - `\(…\)` — escaped parens, which are part of danbooru tag names
 *   (`hatsune miku \(append\)`).
 *
 * A weighted glob (`(on the left, 1girl:1.2)`) loses the now-meaningless weight
 * suffix along with its parens.
 */
export function flattenTagGroups(prompt: string): string {
  const flattened = prompt.replace(/(?<!\\)\(([^()]*)(?<!\\)\)/g, (match, inner: string) => {
    if (!inner.includes(',')) return match
    return inner.replace(/:\s*\d+(?:\.\d+)?\s*$/, '').trim()
  })
  return joinTags(
    flattened
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  )
}

/**
 * The engine's prose cue vocabulary → booru tags the model actually knows.
 * Ordered most-specific first; the first match wins for a given cue.
 */
const BOORU_CUE_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/breast expansion|breasts (?:rapidly )?expanding|breasts growing larger/i, 'breast expansion'],
  [/hugely engorged|visibly leaking|stretched shiny-taut/i, 'lactation, leaking milk'],
  [/engorged|swollen with|gently taut|taut and heavy/i, 'lactation'],
  [/flushed|aroused/i, 'blush, heavy breathing'],
]

/**
 * Render the engine's image state cues in booru dialect: each prose cue maps to
 * the booru tags carrying the same signal, lowercased (the engine interpolates
 * the fluid type verbatim, so "Milk" arrives capitalized) and de-duplicated. An
 * unrecognized cue — the engine gained vocabulary this table has not learned —
 * passes through lowercased rather than being silently dropped.
 */
export function compressStateCues(cues: ReadonlyArray<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const cue of cues) {
    const mapped = BOORU_CUE_TAGS.find(([pattern]) => pattern.test(cue))?.[1] ?? cue
    for (const tag of toTags(mapped.toLowerCase())) {
      if (seen.has(tag)) continue
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

// ============================================================================
// Engine-sanctioned size vocabulary
// ============================================================================

/**
 * The engine is the single owner of body state, and the prompt writer must not
 * be able to out-vote it.
 *
 * MEASURED FAILURE: the narration described massive growth that never happened
 * in the engine, and the writer faithfully tagged the NARRATIVE — "breast
 * expansion, breasts covering stomach, breasts reaching waist, breasts spilling
 * over bed, unable to move" — for a subject the engine had at tier 24 ("huge
 * breasts"; body-relative anchors do not start until tier 30). The image model
 * received three contradictory size signals (giant freeform tags, the engine's
 * band word, and the below-band negative) and rendered the bust SMALLER than the
 * previous, correct round.
 *
 * So size vocabulary is filtered against the engine's tier here, wherever it
 * appears. Three classes, all keyed off the ladder's own tables so they cannot
 * drift from it:
 *
 * 1. BAND words (`gigantic breasts` at tier 24) — `BAND_WORD_THRESHOLDS`.
 * 2. ANCHOR phrases (`breasts bigger than her torso` below tier 80) — derived
 *    from `imageSizeAnchor` so the thresholds stay the ladder's.
 * 3. MAGNITUDE freeform — what the writer invents from prose: breasts
 *    covering/reaching/spilling/filling something, or compared to a body part,
 *    plus immobility-from-size phrasing. Sanctioned only from the tier where the
 *    engine itself starts making body-relative claims.
 *
 * Deliberately NOT filtered:
 * - Band words BELOW the subject's band. In a multi-subject scene an action or
 *   scene tag is sanctioned against the LARGEST subject present, so a smaller
 *   girl's honest "medium breasts" would be collateral damage.
 * - Act tags that merely mention breasts (`paizuri`, `breast squeezing`) — they
 *   describe what is happening, not how big anything is.
 */
export interface SizeSanction {
  /** The engine's (apparent) tier for the subject these tags describe. */
  tier: number
  /** True when the engine recorded growth on THIS turn — gates the growth tags. */
  grewThisTurn: boolean
}

/**
 * Comparison key for size vocabulary: lowercased, possessives dropped. The
 * ladder writes "breasts bigger than her torso" while a writer typically emits
 * "breasts bigger than torso"; both are the same claim.
 */
const sizeKey = (tag: string): string =>
  tag
    .trim()
    .toLowerCase()
    .replace(/\b(?:her|his|their|its)\s+/g, '')
    .replace(/\s{2,}/g, ' ')

/** Band word → the tier that earns it. */
const BAND_WORD_MIN_TIER: ReadonlyMap<string, number> = new Map(
  BAND_WORD_THRESHOLDS.map((row) => [sizeKey(row.word), row.minTier] as const),
)

/**
 * Anchor phrase → the tier that earns it. The ladder exports the phrases but not
 * their thresholds, so they are recovered by walking `imageSizeAnchor` upward:
 * the first tier that yields a phrase is that phrase's floor. Derived rather
 * than copied so a re-keyed anchor table cannot silently desync this filter.
 */
const ANCHOR_MIN_TIER: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>()
  for (let tier = 0; tier <= 512 && map.size < IMAGE_SIZE_ANCHOR_PHRASES.length; tier++) {
    const anchor = imageSizeAnchor(tier)
    if (anchor && !map.has(sizeKey(anchor))) map.set(sizeKey(anchor), tier)
  }
  return map
})()

/** Lowest tier at which the engine itself makes a body-relative size claim. */
const ANCHOR_FLOOR_TIER = Math.min(...ANCHOR_MIN_TIER.values())

/** The open-ended top band — where scale genuinely stops being describable. */
const TOP_BAND_TIER = BAND_WORD_THRESHOLDS[BAND_WORD_THRESHOLDS.length - 1].minTier

/**
 * Freeform magnitude claims, matched against the whole normalized tag. Each
 * needs the subject's tier to reach its floor; conservative by construction, so
 * a tag has to name breasts AND a magnitude relation to qualify.
 */
const MAGNITUDE_PATTERNS: ReadonlyArray<{ readonly minTier: number; readonly pattern: RegExp }> = [
  {
    minTier: ANCHOR_FLOOR_TIER,
    pattern:
      /\bbreasts?\b.*\b(?:covering|reaching|spilling|filling|engulfing|smothering|swallowing|dwarfing|obscuring|draped over|resting on|hanging (?:to|past|below|over))\b/,
  },
  {
    minTier: ANCHOR_FLOOR_TIER,
    pattern: /\bbreasts?\b.*\b(?:larger|bigger|wider|heavier|longer|huger)\s+than\b/,
  },
  {
    minTier: ANCHOR_FLOOR_TIER,
    pattern: /\bbreasts?\b.*\b(?:the size of|as (?:large|big|wide|heavy) as)\b/,
  },
  { minTier: TOP_BAND_TIER, pattern: /\b(?:room|building|house|bed|car)[- ]?fill(?:ing|ed)\b/ },
  {
    minTier: TOP_BAND_TIER,
    pattern: /\b(?:immobili[sz]ed|pinned|trapped|weighed down|crushed)\b.*\bbreasts?\b/,
  },
  {
    minTier: TOP_BAND_TIER,
    pattern: /\bbreasts?\b.*\b(?:immobili[sz]ing|pinning|trapping|crushing|weighing down)\b/,
  },
]

/**
 * Immobility phrasings that carry no size word of their own. They are a size
 * claim only next to breast tags ("unable to move" in a bondage scene is not),
 * so they are filtered only when the same run mentions breasts.
 */
const IMMOBILITY_PATTERNS: ReadonlyArray<RegExp> = [
  /^unable to (?:move|stand|stand up|get up|rise|walk)$/,
  /^(?:cannot|can not|can't|cant) move$/,
  /^(?:completely )?immobili[sz]ed$/,
]

/** A tag that names breasts at all — the context immobility phrasings need. */
const BREAST_CONTEXT = /\bbreasts?\b|\bbust\b|\bcleavage\b/

/**
 * Growth-EVENT tags. `breast expansion` is the correct tag for an in-progress
 * growth beat, so it is not a magnitude claim — but it is a claim about an event
 * the engine either did or did not run this turn, and the live failure invented
 * one. Kept when the engine actually grew her this turn (`lastGrowth`, the same
 * signal that puts the cue in the dossier), stripped otherwise.
 */
const GROWTH_EVENT_PATTERNS: ReadonlyArray<RegExp> = [
  /^breast (?:expansion|inflation|growth)$/,
  /\bbreasts? (?:rapidly |slowly )?(?:expanding|swelling larger|growing larger|inflating)\b/,
  /\bexpanding breasts\b/,
  /\bskin stretching taut\b/,
]

type SizeTagClass =
  | { readonly kind: 'band' | 'anchor' | 'magnitude'; readonly minTier: number }
  | { readonly kind: 'growth' }
  | null

function classifySizeTag(tag: string, hasBreastContext: boolean): SizeTagClass {
  const key = sizeKey(tag)
  const band = BAND_WORD_MIN_TIER.get(key)
  if (band !== undefined) return { kind: 'band', minTier: band }
  const anchor = ANCHOR_MIN_TIER.get(key)
  if (anchor !== undefined) return { kind: 'anchor', minTier: anchor }
  if (GROWTH_EVENT_PATTERNS.some((pattern) => pattern.test(key))) return { kind: 'growth' }
  const magnitude = MAGNITUDE_PATTERNS.find((row) => row.pattern.test(key))
  if (magnitude) return { kind: 'magnitude', minTier: magnitude.minTier }
  if (hasBreastContext && IMMOBILITY_PATTERNS.some((pattern) => pattern.test(key))) {
    return { kind: 'magnitude', minTier: TOP_BAND_TIER }
  }
  return null
}

/** Band words and relative-size anchors — the vocabulary hoisted out of a run. */
export function isSizeVocabularyTag(tag: string): boolean {
  const key = sizeKey(tag)
  return BAND_WORD_MIN_TIER.has(key) || ANCHOR_MIN_TIER.has(key)
}

/**
 * Drop the size claims this subject's engine tier does not sanction, keeping
 * everything else in order. A `null` sanction (no BE state for the subject, or
 * no subject to attribute the run to) filters nothing — the engine has said
 * nothing to enforce.
 */
export function sanitizeSizeTags(
  tags: ReadonlyArray<string>,
  sanction: SizeSanction | null | undefined,
): { kept: string[]; stripped: string[] } {
  if (!sanction) return { kept: [...tags], stripped: [] }
  const hasBreastContext = tags.some((tag) => BREAST_CONTEXT.test(tag.toLowerCase()))
  const kept: string[] = []
  const stripped: string[] = []
  for (const tag of tags) {
    const verdict = classifySizeTag(tag, hasBreastContext)
    const sanctioned =
      verdict === null
        ? true
        : verdict.kind === 'growth'
          ? sanction.grewThisTurn
          : sanction.tier >= verdict.minTier
    if (sanctioned) kept.push(tag)
    else stripped.push(tag)
  }
  return { kept, stripped }
}
