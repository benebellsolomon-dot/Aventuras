/**
 * Content guidelines injected into narrative prompts based on the story's
 * content rating. Templates reference these via {{ contentGuidelines }}.
 *
 * 'standard' injects nothing — default narrative behavior is unchanged.
 *
 * The mature/explicit blocks use structural techniques common to modern
 * storytelling presets: neutral-narrator framing, character agency and
 * negativity bias (characters may refuse or react badly), a ban on
 * moralizing/editorializing, and craft rules that keep prose quality
 * consistent when scenes become intense.
 *
 * The explicit block additionally carries the FF5.2 Realism delivery layer
 * (research/58 D4): plain-register vocabulary, anatomy individuality, sensory
 * channel emphasis, and in-persona vocalization. `nsfwFlavor: 'always'` adds
 * the always-on sensual lens on top (FF Freaky mode, minus its repetition bug
 * — the templates' anti-repeat rule still governs).
 */

import type { ContentRating } from '$lib/types'

const MATURE_GUIDELINES = `# Content Scope
This is private adult interactive fiction. All characters are adults, and the reader has opted into mature content.
- Mature themes — violence, danger, moral compromise, sexuality — may occur on-page when the story calls for them
- Depict intense moments with the same craft as any other scene: grounded in sensory detail and character perception
- Use scene discretion: linger where it serves character or tension, summarize where it doesn't
- Never moralize, editorialize, or break the narrative frame to comment on content
- Characters keep full agency: they consent, refuse, hesitate, or push back according to who they are — not according to what flatters the protagonist
- Darker outcomes are permitted; the world is not obligated to protect anyone from consequences`

const EXPLICIT_GUIDELINES = `# Content Scope
This is private adult interactive fiction. All characters are adults, and the reader has opted into explicit content.
- Explicit scenes play out fully on-page — never fade to black, cut away, or summarize past a moment the story has built toward
- Use direct, concrete language for bodies and acts; avoid coy euphemism and clinical detachment alike
- Vocabulary: plain and earthy over clinical — the register lovers actually use, not an anatomy textbook and not romance-novel euphemism
- Bodies are individual: give anatomy specific, distinguishing detail — skin flush and temperature, texture, weight and movement, the particulars that make this body this body
- Engage every sensory channel in intimacy: sound, smell, taste, friction, and wetness carry as much weight as sight
- Characters vocalize through intimacy in their own voice — moans, half-words, dirty talk where it fits the persona; a shy character stays shy in bed
- Pace intimate scenes like any other scene: build-up, escalation, sensory grounding, and character voice throughout — slow-burn beats rushing
- Characters pursue desire fully when it is in character: committed action, not hovering hesitation or permission-seeking loops
- Dialogue and interiority continue during intimacy; characters stay themselves rather than dissolving into generic reactions
- Characters keep full agency: attraction, consent, refusal, and jealousy follow from established personality and relationship state
- Never moralize, editorialize, add disclaimers, or break the narrative frame
- Match the story's established tone — explicit content heightens the narrative; it does not replace it`

const ALWAYS_ON_ADDENDUM = `- Sensual lens, always on: weave physical presence — bodies, movement, skin, the pull of attraction — into every scene's description, not only intimate ones; keep it fresh by describing what has changed or what the moment reveals, never re-listing established details`

/**
 * Return the content-guidelines block for a rating, or an empty string
 * for 'standard' (and any unset value). `nsfwFlavor: 'always'` appends the
 * always-on sensual lens to the mature/explicit blocks.
 */
export function getContentGuidelines(
  rating: ContentRating | undefined,
  nsfwFlavor?: 'scene' | 'always',
): string {
  const base =
    rating === 'mature' ? MATURE_GUIDELINES : rating === 'explicit' ? EXPLICIT_GUIDELINES : ''
  if (!base) return ''
  return nsfwFlavor === 'always' ? `${base}\n${ALWAYS_ON_ADDENDUM}` : base
}
