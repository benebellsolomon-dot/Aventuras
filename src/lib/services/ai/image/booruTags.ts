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

import {
  BAND_WORD_THRESHOLDS,
  IMAGE_SIZE_ANCHOR_PHRASES,
  bandWord,
  imageSizeAnchor,
} from '$lib/services/be'

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
// Engine-owned breast size: whitelist the writer, inject the engine
// ============================================================================

/**
 * The engine is the single owner of body state, and the prompt writer must not
 * be able to out-vote it.
 *
 * FAILURE 1 (blacklist round): the narration described growth that never
 * happened in the engine, and the writer faithfully tagged the NARRATIVE —
 * "breast expansion, breasts covering stomach, breasts reaching waist" — for a
 * subject the engine held at tier 24. A pattern-stripping sanitizer was added.
 *
 * FAILURE 2 (one round later): the writer rephrased the same invention as
 * "breast spill, pinned, immobile, trapped", which matched none of the
 * sanitizer's `breasts …ing` / `…than` patterns and sailed through. A blacklist
 * of phrasings loses this race by construction: there is always another way to
 * say "enormous", and the writer is a language model.
 *
 * So the polarity is inverted here. A tag that NAMES BREASTS AT ALL is deleted
 * unless it is on a curated whitelist of Danbooru ACT / CONTACT tags and
 * anatomy-neutral detail — vocabulary that describes what is happening rather
 * than how big anything is. No magnitude regexes, no phrasing arms race.
 *
 * The size the image actually gets is then INJECTED from the engine
 * (`engineSizeTags`) at a position the composer owns. That closes the second
 * half of failure 2: the old code HOISTED whatever size vocabulary the writer
 * had written, so when the writer wrote none, nothing was hoisted, and the only
 * band word in the finished prompt was the one `groundImagePromptSize` appends
 * at the very TAIL — past CLIP's ~75-token attention window, rendering tiny.
 * Injection cannot fail that way: the engine's block is always present, always
 * in the same slot, and never derived from writer output.
 *
 * Deliberately NOT filtered: a subject the engine holds no body state for. The
 * engine has said nothing about her, so it enforces nothing — her writer tags
 * (band word included) pass through untouched.
 */
export interface SizeSanction {
  /** The engine's (apparent) tier for the subject these tags describe. */
  tier: number
  /** True when the engine recorded growth on THIS turn — gates the growth tag. */
  grewThisTurn: boolean
  /** Engorged condition live (fill at/over her threshold) — visible veins. */
  engorged?: boolean
  /** Lactating and full enough to leak — the lactation tag rides the size block. */
  lactating?: boolean
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
 * than copied so a re-keyed anchor table cannot silently desync this module.
 */
const ANCHOR_MIN_TIER: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>()
  for (let tier = 0; tier <= 512 && map.size < IMAGE_SIZE_ANCHOR_PHRASES.length; tier++) {
    const anchor = imageSizeAnchor(tier)
    if (anchor && !map.has(sizeKey(anchor))) map.set(sizeKey(anchor), tier)
  }
  return map
})()

/**
 * Immobility ("pinned", "trapped", "unable to move") claims the breasts outscale
 * the BODY, not the head — so it needs the ladder's SECOND body-relative rung
 * ("breasts wider than her hips", tier 40), not its first ("breasts bigger than
 * head", tier 30). Derived from the anchor thresholds above so a re-keyed ladder
 * moves this floor with it.
 */
const ANCHOR_TIERS: ReadonlyArray<number> = [...ANCHOR_MIN_TIER.values()].sort((a, b) => a - b)
const IMMOBILITY_MIN_TIER: number = ANCHOR_TIERS[1] ?? ANCHOR_TIERS[0] ?? Infinity

/**
 * Any tag text that makes a claim about breasts. Broad on purpose — this is the
 * strip TRIGGER, and the whitelist below is what earns a tag its life.
 */
const BREAST_MENTION =
  /\b(?:breasts?|boobs?|booba|oppai|tits?|titty|titties|titflesh|bust|busty|bosom|cleavage|underboob|sideboob|nipples?|areolae?|rack|melons?|knockers?|udders?|mammaries|chest)\b/i

/**
 * Curated Danbooru ACT / CONTACT tags and anatomy-neutral detail: they name
 * breasts without claiming a size, so they survive. Everything else that names
 * breasts is a size claim the engine did not make, and dies.
 *
 * Exact-match by design. It is what separates "covering breasts" (a real pose
 * tag — hands over her chest) from "breasts covering stomach" (the narration's
 * invented magnitude), which no amount of pattern work reliably did.
 */
const BREAST_TAG_WHITELIST: ReadonlySet<string> = new Set([
  // Acts — what is happening between someone and a breast.
  'paizuri',
  'paizuri under clothes',
  'perpendicular paizuri',
  'naizuri',
  'penis between breasts',
  'breast squeeze',
  'breast squeezing',
  'breasts squeezed together',
  'breast grab',
  'breast grabbing',
  "grabbing another's breast",
  'grabbing own breast',
  'breast sucking',
  'breast suck',
  'nipple sucking',
  'breast press',
  'breast pressing',
  'breasts on glass',
  'breast rest',
  'breast smother',
  'breast smothering',
  'motorboating',
  'breast lift',
  'breast hold',
  'breast poke',
  'breast bondage',
  'breastfeeding',
  'breast feeding',
  'breast licking',
  'breast biting',
  'breast kiss',
  'breast slap',
  'bouncing breasts',
  'between breasts',
  'head between breasts',
  'face between breasts',
  'hand between breasts',
  'arm under breasts',
  'arms under breasts',
  'hand on own breast',
  'hands on own breasts',
  'covering breasts',
  'covering own breasts',
  'breasts apart',
  'breast slip',
  'breasts out',
  'nipple slip',
  // Anatomy-neutral detail the model needs and the engine does not own.
  'nipple',
  'nipples',
  'puffy nipples',
  'inverted nipples',
  'dark nipples',
  'pink nipples',
  'areola',
  'areolae',
  'large areolae',
  'puffy areolae',
  'cleavage',
  'cleavage cutout',
  'breast cutout',
  'underboob',
  'sideboob',
  'downblouse',
  'bare breasts',
])

/** Productive whitelist families — the same acts in whatever form the writer reached for. */
const BREAST_TAG_WHITELIST_PATTERNS: ReadonlyArray<RegExp> = [
  /^(?:nipple|areola)e?s? (?:play|licking|lick|tweak|tweaking|pinch|pinching|rub|rubbing|sucking|stimulation|torture|piercing|clamps?)$/,
  /^(?:licking|sucking|pinching|tweaking|rubbing|touching|biting) (?:own |another's )?nipples?$/,
  // "chest" and "rack" also name furniture, props and armour — not anatomy.
  /^chest (?:tattoo|harness|jewel|guard|armou?r|belt|strap|sarashi|plate)$/,
  /^hands? on (?:own |another's )?chest$/,
  /^(?:weapon|spice|wine|coat|dish|luggage|treasure) (?:rack|chest)$/,
  /^chest of drawers$/,
]

/**
 * Immobility phrasings that carry no breast word of their own. They are a size
 * claim only next to breast tags ("unable to move" in a bondage scene is not),
 * so they are filtered only when the same block mentions breasts — and only
 * below the tier at which the engine itself would make that claim.
 */
const IMMOBILITY_PATTERNS: ReadonlyArray<RegExp> = [
  /^unable to (?:move|stand|stand up|get up|rise|walk|sit up)$/,
  /^(?:cannot|can not|can't|cant) (?:move|stand|get up)$/,
  /^(?:completely |totally )?immobili[sz]ed$/,
  /^immobile$/,
  /^(?:pinned|pinned down|trapped|trapped under|stuck|weighed down|crushed|buried|smothered)$/,
]

/** The growth EVENT tag — the one the engine's own cue table maps its growth cue to. */
const GROWTH_EVENT_TAG = 'breast expansion'
/** Danbooru: visible veins — the Engorged condition's one unambiguous visual. */
const ENGORGED_TAG = 'veiny breasts'
/** Danbooru: milk visibly expressed. */
const LACTATION_TAG = 'lactation'

/** True when the tag names breasts in any of the vocabularies the writer reaches for. */
const mentionsBreasts = (tag: string): boolean => BREAST_MENTION.test(tag)

/** True for the curated act / contact / neutral-anatomy tags that survive a strip. */
const isWhitelistedBreastTag = (key: string): boolean =>
  BREAST_TAG_WHITELIST.has(key) || BREAST_TAG_WHITELIST_PATTERNS.some((p) => p.test(key))

/** Band words and relative-size anchors — the vocabulary hoisted out of an unsanctioned run. */
export function isSizeVocabularyTag(tag: string): boolean {
  const key = sizeKey(tag)
  return BAND_WORD_MIN_TIER.has(key) || ANCHOR_MIN_TIER.has(key)
}

/**
 * Delete every breast claim the writer made for a sanctioned subject, keeping
 * the curated act/anatomy vocabulary and everything that never mentions breasts.
 *
 * A `null` sanction (no BE state for the subject, or no subject to attribute the
 * block to) filters nothing — the engine has said nothing to enforce.
 *
 * `tags` is one BLOCK: the action run, the scene run, or one character's run.
 * Blocks matter for the immobility rule, which needs a breast mention as context
 * and reads it from the block as the writer wrote it (before any stripping), so
 * the very tags that trigger the rule cannot erase their own evidence.
 */
export function sanitizeBreastTags(
  tags: ReadonlyArray<string>,
  sanction: SizeSanction | null | undefined,
): { kept: string[]; stripped: string[] } {
  if (!sanction) return { kept: [...tags], stripped: [] }
  const hasBreastContext = tags.some(mentionsBreasts)
  const stripsImmobility = hasBreastContext && sanction.tier < IMMOBILITY_MIN_TIER
  const kept: string[] = []
  const stripped: string[] = []
  for (const tag of tags) {
    const key = sizeKey(tag)
    const doomed = mentionsBreasts(tag)
      ? !isWhitelistedBreastTag(key)
      : stripsImmobility && IMMOBILITY_PATTERNS.some((pattern) => pattern.test(key))
    if (doomed) stripped.push(tag)
    else kept.push(tag)
  }
  return { kept, stripped }
}

// ============================================================================
// The act family — mechanical backstop for "the writer forgot the act"
// ============================================================================

/**
 * Danbooru tags that NAME AN ONGOING ACT between (or by) the people in frame.
 *
 * MEASURED FAILURE, repeatedly, across live rounds: told act-first in the
 * template, the writer still returns an action block like "lying on back,
 * breast expansion, breasts hanging low, looking down" for a beat that is
 * mid-paizuri. Nothing in that block names an act, so the model renders an
 * ambiguous solo pose. Template wording alone has not fixed compliance, so the
 * writer now also DECLARES whether an act is under way (`actInProgress`) and
 * this list is what checks the declaration against the tags it actually wrote.
 *
 * Curated from the same source as the breast whitelist above — real Danbooru
 * act vocabulary only. POSITION tags ("straddling", "lying", "on back"),
 * CONTACT tags ("breast squeezing"), EVENT tags ("breast expansion") and
 * EXPRESSION tags are deliberately absent: they are exactly what the writer
 * emits INSTEAD of the act, so counting them would make the check pass on the
 * failure it exists to catch. Aftermath vocabulary ("after sex", "afterglow")
 * is absent for the same reason — matching is exact, never substring.
 */
export const ACT_FAMILY_TAGS: ReadonlySet<string> = new Set([
  // Intercourse.
  'sex',
  'vaginal',
  'anal',
  'implied sex',
  'sex from behind',
  'doggystyle',
  'missionary',
  'cowgirl position',
  'reverse cowgirl position',
  'girl on top',
  'standing sex',
  'spooning',
  'mating press',
  'prone bone',
  'suspended congress',
  'upright straddle',
  // Oral.
  'fellatio',
  'irrumatio',
  'cunnilingus',
  'deepthroat',
  'deep throat',
  'oral',
  'implied fellatio',
  // Hand / foot / breast / body.
  'handjob',
  'footjob',
  'thighjob',
  'paizuri',
  'naizuri',
  'paizuri under clothes',
  'perpendicular paizuri',
  'penis between breasts',
  'grinding',
  'frottage',
  'tribadism',
  'scissoring',
  'masturbation',
  'female masturbation',
  'fingering',
  // Non-sexual physical acts the template also lists as act tags.
  'kiss',
  'french kiss',
  'hug',
])

/** Productive act families — penetration variants and the licking/sucking pair. */
const ACT_FAMILY_PATTERNS: ReadonlyArray<RegExp> = [
  /^(?:double |triple |multiple |vaginal |anal |oral )?penetration$/,
  /^(?:vaginal|anal|oral|breast) (?:sex|insertion)$/,
  /^(?:licking|sucking) (?:penis|pussy|testicles)$/,
  /^(?:penis|object) in (?:pussy|ass|mouth)$/,
]

/** True when this one tag names an ongoing act. Exact match, never substring. */
function isActFamilyTag(tag: string): boolean {
  const key = sizeKey(tag)
  return ACT_FAMILY_TAGS.has(key) || ACT_FAMILY_PATTERNS.some((pattern) => pattern.test(key))
}

/** True when a tag BLOCK names at least one ongoing act. */
export function hasActFamilyTag(tags: ReadonlyArray<string>): boolean {
  return tags.some(isActFamilyTag)
}

/**
 * Acts one person performs alone — an `actInProgress` scene built on these
 * needs no second participant, so they never trigger the missing-partner half
 * of the validation.
 */
const SOLO_ACT_TAGS: ReadonlySet<string> = new Set([
  'masturbation',
  'female masturbation',
  'fingering',
])

/** True when the block names an act that REQUIRES a second person in frame. */
export function hasPartneredActTag(tags: ReadonlyArray<string>): boolean {
  return tags.some((tag) => isActFamilyTag(tag) && !SOLO_ACT_TAGS.has(sizeKey(tag)))
}

/**
 * The engine's canonical size block for one subject — band word, the anchor its
 * tier has earned, and the growth-event tag only on a turn the engine actually
 * grew her. This is the ONLY size source in a sanctioned prompt: the writer's
 * copy was stripped above, and the composer places this block itself.
 */
export function engineSizeTags(sanction: SizeSanction): string[] {
  const tags = [bandWord(sanction.tier)]
  const anchor = imageSizeAnchor(sanction.tier)
  if (anchor) tags.push(anchor)
  // Lactation state is engine truth too (research/64 §3g, Ben: "lactation,
  // fullness, visible veins missed"): the writer put `lactation, leaking milk`
  // at the SCENE tail where the single-window trim cut it first; stated here
  // it rides the size block right behind the act.
  if (sanction.engorged) tags.push(ENGORGED_TAG)
  if (sanction.lactating) tags.push(LACTATION_TAG)
  if (sanction.grewThisTurn) tags.push(GROWTH_EVENT_TAG)
  return tags
}
