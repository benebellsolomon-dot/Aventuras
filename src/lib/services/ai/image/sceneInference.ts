/**
 * Scene inference for the si-bridge structured spec (Spec 2 Task 6).
 *
 * Pure keyword gates — no LLM call, no store deps. Design principles:
 * - The <pic> scene text is the primary signal; surrounding narrative may
 *   escalate the rating by AT MOST one step (combineSceneIntimacy) — an
 *   establishing shot inside an explicit beat must not render explicit.
 * - Over-rating tells the bridge to suppress censorship on a scene the text
 *   meant as benign, so ambiguous vocabulary (climax, riding, mounted) is
 *   deliberately excluded rather than guarded.
 * - The location mapper returns null on no confident match — the bridge
 *   ignores null, and a wrong curated key is worse than none.
 */

export type SceneIntimacy = 'clean' | 'suggestive' | 'nude' | 'explicit'

const INTIMACY_ORDER: ReadonlyArray<SceneIntimacy> = ['clean', 'suggestive', 'nude', 'explicit']

// Most-explicit-first; the first matching tier wins. All bare tokens are
// word-bounded, and known idiom false-positives are excluded (naked eye,
// same-sex, cock the hammer, shower of arrows...).
const INTIMACY_TIERS: ReadonlyArray<readonly [SceneIntimacy, RegExp]> = [
  [
    'explicit',
    /(?:\b(?:penetrat\w*|orgasm\w*|pussy|cum(?:s|ming|shot)?|fellatio|cunnilingus|paizuri|fuck\w*|mating press|blowjob|handjob|creampie|deepthroat\w*|penis|erection|doggy ?style|his shaft)\b|\beat(?:s|ing)? her out\b|(?<!same[- ])(?<!opposite[- ])(?<!fairer[- ])\bsex\b|(?<!fighting )\bcock\b(?! (?:the|a|an|back|crow\w*)\b)|\bthrust(?:s|ing)? (?:into|inside|deeper|up into|against h(?:im|er))\b)/i,
  ],
  [
    'nude',
    /(?:\bnaked\b(?! (?:eye|truth|ambition|flame|steel|aggression|greed|fear|hostility|power)\b)|\b(?:nude|topless|undress(?:ed|es)?|strip(?:s|ped)? (?:off|out of|down)|bare(?:d)? (?:breasts?|chest|skin)|exposed nipples?|areolae?)\b)/i,
  ],
  [
    'suggestive',
    /\b(?:cleavage|lingerie|underwear|bra\b|panties|negligee|see-through|sheer (?:top|blouse|fabric)|wet (?:shirt|blouse|top)|strain(?:s|ing)?, buttons?|buttons? (?:pulling|straining|about to)|unbutton\w*|towel(?:ed)? (?:around|slipping)|low-cut)\b/i,
  ],
]

/** Rating tier for a scene from its text; defaults to 'clean'. */
export function inferSceneIntimacy(text: string): SceneIntimacy {
  const s = String(text || '')
  for (const [tier, pattern] of INTIMACY_TIERS) {
    if (pattern.test(s)) return tier
  }
  return 'clean'
}

/**
 * Combine the scene's own rating with the surrounding narrative's: the
 * narrative can raise the scene by ONE step only. A clean establishing shot in
 * an explicit beat renders suggestive, not explicit.
 */
export function combineSceneIntimacy(scene: SceneIntimacy, context: SceneIntimacy): SceneIntimacy {
  const s = INTIMACY_ORDER.indexOf(scene)
  const c = INTIMACY_ORDER.indexOf(context)
  return c > s ? INTIMACY_ORDER[s + 1] : scene
}

// The bridge's 14 curated setting keys (INTEGRATION.md §5), checked in order —
// specific keys (love_hotel, locker_room, onsen) before the general ones their
// vocabulary could shadow. Phrase-level patterns for "car": a mere mention of a
// car is not an in-car scene. Idiomatic uses are excluded (pool of blood,
// shower of arrows, out of the woods, post office, bed of the truck).
const LOCATION_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['love_hotel', /\blove hotel\b/i],
  ['locker_room', /\b(?:locker room|changing room)\b/i],
  ['onsen', /\b(?:onsen|hot[- ]?springs?|bathhouse)\b/i],
  ['poolside', /\b(?:poolside|swimming pool|pool deck)\b/i],
  ['bathroom', /(?:\bshower\b(?! of )|\b(?:bathroom|bathtub|washroom|restroom|bath)\b)/i],
  [
    'bedroom',
    /(?:\b(?:bedroom|her room|his room|their room|four-poster)\b|\bon (?:the|her|his) bed\b(?! of ))/i,
  ],
  ['classroom', /\b(?:classroom|lecture hall|homeroom|school desk)\b/i],
  ['office', /(?:(?<!post )\boffice\b|\b(?:cubicle|conference room|boardroom)\b)/i],
  ['kitchen', /\bkitchen\b/i],
  ['living_room', /\b(?:living room|sitting room|parlou?r|couch|sofa)\b/i],
  ['rooftop', /\b(?:rooftop|roof terrace|on the roof)\b/i],
  ['beach', /\b(?:beach|seaside|seashore|surf line)\b/i],
  ['forest', /(?:\b(?:forest|woodland|grove|thicket)\b|(?<!out of )\bthe woods\b)/i],
  ['car', /\b(?:back ?seat|passenger seat|car seat|in(?:side)? the car|parked car)\b/i],
]

/** Map free text (a location name or scene prose) to a curated bridge location key, or null. */
export function inferBridgeLocation(text: string): string | null {
  const s = String(text || '')
  if (!s) return null
  for (const [key, pattern] of LOCATION_PATTERNS) {
    if (pattern.test(s)) return key
  }
  return null
}
