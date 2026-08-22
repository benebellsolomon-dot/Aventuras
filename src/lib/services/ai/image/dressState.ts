/**
 * Dress-state inference for the booru scene writer's mechanical backstop
 * (D5 round 2, research/64 §4.1).
 *
 * Live failure shape (twice in one evening): the narrator's `<pic>` intent said
 * "standing bare and pressed against a man" / "sitting bare on a wooden crate,
 * legs open" and the writer still emitted `clothed, damp halter top` or no dress
 * state at all — the dossier's "current clothing: …" line (what she WORE when
 * the beat began) beat the beat. The image model then drew her clothed, or got
 * an "explicit" rating with nothing to draw.
 *
 * This module answers two pure questions the writer's check needs:
 *   - does the scene intent say a subject is bare, and how far (nude / topless /
 *     bottomless)?
 *   - does a character run already carry ANY dress-state tag?
 *
 * Deliberately conservative on the intent side: only whole-body or torso/lower
 * phrasings count. "bare shoulders", "bare arms", "bare feet", "bare thighs" are
 * ambiguous (a dress, a hiked skirt) and never trigger.
 */

export type ImpliedDressState = 'nude' | 'topless' | 'bottomless'

const NUDE_INTENT =
  /(?:(?<!partially |partly |half |half-)\b(?:naked|nude|unclothed|disrobed|undressed)\b(?! (?:eye|truth|ambition|flame|steel|aggression|greed|fear|hostility|power)\b)|\b(?:standing|sitting|sits|stands|lying|lies|kneeling|kneels|sprawled|stretched out|completely|fully|entirely|stripped|now) bare\b(?![- ](?:foot|feet|hand|hands|arm|arms|shoulder|shoulders|leg|legs|thigh|thighs|chest|chested|breast|breasts|skin|back))|\bbare (?:body|from head to toe|all over)\b|\bin the nude\b|\bwithout a stitch\b|\bnothing on\b|\bwearing nothing\b|\bclothes (?:gone|off|on the floor|discarded)\b)/i

const TOPLESS_INTENT =
  /(?:\btopless\b|\bbare-chested\b|\bbared? (?:breasts?|chest|bosom|torso)\b|\bbreasts? (?:bare|bared|exposed|out|uncovered|free)\b|\bexposed (?:breasts?|nipples?|chest)\b|\bnipples? (?:bare|exposed|visible|showing)\b|\b(?:top|shirt|blouse|halter|bra) (?:pulled down|pulled off|off|gone|discarded|removed)\b)/i

const BOTTOMLESS_INTENT =
  /(?:\bbottomless\b|\bbare (?:bottom|buttocks|ass|hips|sex|pussy|vulva|crotch)\b|\bexposed (?:pussy|vulva|sex|crotch|buttocks)\b|\b(?:panties|underwear|skirt|trousers|pants|shorts) (?:pulled down|pulled off|off|gone|discarded|removed|around (?:one|her) (?:leg|ankle|ankles|knees))\b)/i

/**
 * What the scene intent says is bare. Most-exposed first: a whole-body phrase
 * wins over a torso one. `null` when the intent names no exposure — the common
 * case, and the check then does nothing.
 */
export function inferImpliedDressState(text: string): ImpliedDressState | null {
  const s = String(text || '')
  if (NUDE_INTENT.test(s)) return 'nude'
  if (TOPLESS_INTENT.test(s)) return 'topless'
  if (BOTTOMLESS_INTENT.test(s)) return 'bottomless'
  return null
}

/** The Danbooru tag the writer's run must carry for each implied state. */
export const DRESS_TAG_FOR_STATE: Readonly<Record<ImpliedDressState, string>> = {
  nude: 'completely nude',
  topless: 'topless',
  bottomless: 'bottomless',
}

/**
 * Danbooru dress-state vocabulary: any of these in a character run means the
 * writer DID state how (un)dressed that person is this beat, so the check is
 * satisfied whatever it chose. Nudity tags first, then the clothes-displaced
 * family (a halter pulled down IS a stated dress state).
 */
export const DRESS_STATE_TAGS: ReadonlySet<string> = new Set([
  'nude',
  'completely nude',
  'naked',
  'topless',
  'bottomless',
  'no bra',
  'no panties',
  'no shirt',
  'no pants',
  'underwear only',
  'bra only',
  'panties only',
  'breasts out',
  'one breast out',
  'nipples',
  'clothes pull',
  'shirt pull',
  'dress pull',
  'bra pull',
  'panties pull',
  'swimsuit pull',
  'clothes down',
  'shirt down',
  'dress down',
  'bra down',
  'clothes lift',
  'shirt lift',
  'dress lift',
  'skirt lift',
  'sweater lift',
  'bra lift',
  'open shirt',
  'open clothes',
  'open dress',
  'open robe',
  'open jacket',
  'unbuttoned',
  'unbuttoned shirt',
  'undressing',
  'partially undressed',
  'clothes removed',
  'panties around one leg',
  'panties around ankles',
  'panties aside',
  'clothing aside',
  'torn clothes',
  'see-through',
])

/** Tags the writer uses to assert the OPPOSITE — dropped by the mechanical fallback. */
export const CLOTHED_ASSERTION_TAGS: ReadonlySet<string> = new Set([
  'clothed',
  'fully clothed',
  'dressed',
  'fully dressed',
])

/** True when any tag in the run states a dress state (case-insensitive). */
export function hasDressStateTag(tags: ReadonlyArray<string>): boolean {
  return tags.some((tag) => DRESS_STATE_TAGS.has(tag.trim().toLowerCase()))
}
