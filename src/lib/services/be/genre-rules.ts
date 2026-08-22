/**
 * BE engine — the agnostic genre-rules pack (research/37 Spec 3 Task 5, pulled
 * forward by the research/41 precedence finding: always-injected world lore was
 * outranking the [BODY STATE] growth directive, so the narrator contract states
 * the precedence rule explicitly).
 *
 * Static prose guidance rendered by the narrative templates beside the
 * beStateBlock. Deliberately compact — highest-value rules only (Spec 3 flags
 * template bloat). Per-story flavor arrives via the two interpolation options;
 * the caller (context-builder) maps StorySettings onto them.
 */

export interface BeGenreRuleOptions {
  /** What drives growth in this world (free text, story-defined). */
  growthCosmology?: string
  /** Free-text pacing note ("slow-burn", "cartoonish surges", ...). */
  pacingFlavor?: string
}

export function buildBeGenreRules(options: BeGenreRuleOptions): string {
  const cosmology = options.growthCosmology?.trim()
  const pacing = options.pacingFlavor?.trim()

  const lines = [
    '[BE GENRE RULES]',
    'Growth authorization: the [BODY STATE] block is the sole authority on WHEN growth happens and HOW MUCH. World lore, story rules, and character beliefs describe mechanism and flavor — they never veto, delay, shrink, or amplify a growth directive, and they never authorize growth on their own. If lore says growth is slow or conditional but the block says growth landed, the block wins: render it.',
  ]
  if (cosmology) {
    lines.push(
      `This world's growth cosmology (mechanism and flavor): ${cosmology}`,
      'Absolute rule: growth happens ONLY when that act completes on the page; a [CHECK RESULT] GROWTH line that makes growth conditional on it outranks the authorization paragraph above.',
    )
  }
  if (pacing) lines.push(`Pacing flavor: ${pacing}`)
  lines.push(
    "Render growth beats in four phases — Anticipation (tension, warmth, tingling tightness before change), Onset (the moment it begins: strain, shifting mass, fabric and posture reacting), Peak (the change completing at the directive's magnitude), Aftermath (the settled new reality: weight, balance, clothing fit, her feelings about it). One turn usually carries one or two phases, not all four.",
    'Commit discipline: when a growth directive appears, growth is already canon — render it in THIS response; do not defer it, soften it into metaphor, or leave it ambiguous. Exception: an ONSET note marks growth deliberately staged across two beats — render the landed increment fully now and treat the ONSET as anticipation of the next beat; that is not deferral. Between directives, never invent growth, shrinkage, or ambient size drift.',
    'Sensory rotation: lead each growth beat through ONE dominant sensory channel (weight, warmth, fabric strain, sound, balance) and rotate channels across beats; keep effects scene-scoped to the characters the block names.',
    'Measurements: numbers are metric only (cm/kg/L), exactly as the block states them — cup letters stay the size-identity vocabulary; never US band sizing like "34DD"; keep comparisons within the block\'s own size register.',
    'Voice: narration states body facts plainly; characters may misjudge sizes in dialogue, but the narration itself never contradicts the block.',
  )
  return lines.join('\n')
}
