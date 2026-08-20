/**
 * Per-character EMOTION / EXPRESSION layer for booru image prompts.
 *
 * PROBLEM (measured): the dedicated booru writer reliably lands identity, scene
 * and size, but a character's emotional state only reached the image when the
 * writer happened to type an expression tag. A furious girl and a delighted one
 * rendered with the same blank face.
 *
 * There are TWO truth sources for "how does she look right now", and both feed
 * this layer:
 *
 * 1. The NARRATIVE BEAT — only the writer LLM can read it, so the template asks
 *    for 1-3 expression tags per person and the schema makes that a required
 *    field. The curated vocabulary below is the same one the template lists, so
 *    the writer picks REAL danbooru tags instead of inventing "furious face".
 * 2. The ENGINE's soft state — deterministic, per-girl, and ground truth for the
 *    arousal axis. `engineExpressionTags` maps the fields the BE engine actually
 *    stores (arousal, a landed growth, transformation attitude, and an explicitly
 *    set bond) onto tags from that same vocabulary.
 *
 * Like `compressStateCues`, this is a RENDERING layer: it reads BodyState and
 * never writes it, and it invents no state — every mapped field is one the
 * reducer already persists.
 */

import { SPRITE_AROUSAL_FLUSH_THRESHOLD } from '$lib/services/be'
import { bondStance } from '$lib/services/be'
import type { BodyState, TransformationAttitude } from '$lib/services/be'

/**
 * Curated danbooru expression vocabulary, organized by emotion family.
 *
 * Two jobs: it is the classifier that tells an expression tag apart from an
 * identity or clothing tag inside a character run (so the assembly can place and
 * budget expressions), and it is the palette the engine mapping below draws
 * from. The booru writer template lists the same families in prose — keep the
 * two in step when either changes.
 *
 * The arousal family's top rung (`ahegao`, `rolling eyes`, `tongue out`) is
 * deliberately writer-only: it belongs to unmistakably explicit beats, which the
 * engine's arousal number cannot tell apart from a merely flustered one.
 */
export const EXPRESSION_TAG_FAMILIES: Readonly<Record<string, ReadonlyArray<string>>> = {
  joy: ['smile', 'grin', 'happy', 'laughing', 'light smile', ':d'],
  sadness: ['sad', 'frown', 'crying', 'tears', 'teary eyes', 'crying with eyes open'],
  anger: ['angry', 'scowl', 'clenched teeth', 'glaring', 'annoyed', 'pout', 'v-shaped eyebrows'],
  fear: ['scared', 'surprised', 'wide-eyed', 'trembling', 'nervous', 'shaking', 'sweatdrop'],
  embarrassment: [
    'embarrassed',
    'blush',
    'nose blush',
    'full-face blush',
    'averted eyes',
    'looking away',
    'covering face',
    'flying sweatdrops',
  ],
  affection: [
    'loving gaze',
    'seductive smile',
    'naughty face',
    'bedroom eyes',
    'heart',
    'heart-shaped pupils',
  ],
  arousal: [
    'half-closed eyes',
    'heavy breathing',
    'open mouth',
    'parted lips',
    'moaning',
    'drooling',
    'rolling eyes',
    'tongue out',
    'ahegao',
    'torogao',
  ],
  composure: ['expressionless', 'smug', 'serious', 'closed eyes'],
}

const EXPRESSION_TAG_VOCABULARY: ReadonlySet<string> = new Set(
  Object.values(EXPRESSION_TAG_FAMILIES).flatMap((family) =>
    family.map((tag) => tag.toLowerCase()),
  ),
)

/** Is this tag an expression tag (vs. identity, clothing, size, setting)? */
export function isExpressionTag(tag: string): boolean {
  return EXPRESSION_TAG_VOCABULARY.has(tag.trim().toLowerCase())
}

/**
 * Cap on the DETERMINISTIC block — the same 1-3 the template asks the writer
 * for. Expressions compete with identity for CLIP's attention window; a face
 * needs a couple of tags, not a paragraph.
 */
export const MAX_ENGINE_EXPRESSION_TAGS = 3

/** Below this the scene evidences no arousal worth rendering on her face. */
export const AROUSAL_BLUSH_THRESHOLD = 40

/** The top engine rung — visibly overwhelmed, mouth open. */
export const AROUSAL_PEAK_THRESHOLD = 85

/**
 * Arousal ladder, highest rung first. The middle rung reuses the engine's own
 * flush threshold (the one `imageStateCues` and the sprite cell already key on)
 * so the face, the sprite, and the body-state cue can never disagree.
 *
 * `heavy breathing` is deliberately absent: at or above the flush threshold
 * `imageStateCues` already emits the flushed cue, which `compressStateCues`
 * renders as "blush, heavy breathing" into the same character's run.
 */
const AROUSAL_LADDER: ReadonlyArray<readonly [number, ReadonlyArray<string>]> = [
  [AROUSAL_PEAK_THRESHOLD, ['blush', 'half-closed eyes', 'open mouth']],
  [SPRITE_AROUSAL_FLUSH_THRESHOLD, ['blush', 'half-closed eyes']],
  [AROUSAL_BLUSH_THRESHOLD, ['blush']],
]

/** Expression tags for an arousal reading (empty below the blush threshold). */
export function arousalExpressionTags(arousal: number | undefined): string[] {
  const value = arousal ?? 0
  const rung = AROUSAL_LADDER.find(([threshold]) => value >= threshold)
  return rung ? [...rung[1]] : []
}

/** The genre's five transformation attitudes → one face tag each. */
const ATTITUDE_EXPRESSION: Readonly<Record<TransformationAttitude, string>> = {
  craving: 'seductive smile',
  accepting: 'smile',
  conflicted: 'nervous',
  fearful: 'scared',
  resentful: 'scowl',
}

/** Bond extremes only — the middle of the track has no distinctive face. */
function bondExpression(state: BodyState): string | null {
  // Read the raw field, NOT bondOf(): an unset bond reads through to a default,
  // and rendering a default as devotion or wariness would be inventing state.
  if (state.bond === undefined) return null
  const stance = bondStance(state.bond)
  if (stance === 'devoted') return 'loving gaze'
  if (stance === 'wary') return 'averted eyes'
  return null
}

/**
 * The deterministic per-girl expression block, strongest signal first:
 * arousal ladder → the growth that landed this beat → transformation attitude →
 * a bond extreme. Capped at `MAX_ENGINE_EXPRESSION_TAGS`.
 *
 * The growth rung mirrors the sprite's precedence (a landed growth pins the
 * distressed cell); here it is one `surprised` tag, because the body change
 * itself already rides the `breast expansion` cues on the body line.
 */
export function engineExpressionTags(state: BodyState): string[] {
  const candidates = [...arousalExpressionTags(state.arousal)]
  if ((state.lastGrowth?.delta ?? 0) > 0) candidates.push('surprised')
  if (state.attitude) candidates.push(ATTITUDE_EXPRESSION[state.attitude])
  const bond = bondExpression(state)
  if (bond) candidates.push(bond)

  const out: string[] = []
  for (const tag of candidates) {
    if (out.length >= MAX_ENGINE_EXPRESSION_TAGS) break
    if (out.includes(tag)) continue
    out.push(tag)
  }
  return out
}
