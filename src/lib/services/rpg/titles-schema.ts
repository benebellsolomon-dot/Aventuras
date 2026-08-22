/**
 * E7 — classifier schema extension for earned titles (research/65).
 *
 * Same contract as the worldsim extensions: arrays arrive via schema
 * extension, instructions piggyback on the customVariableInstructions slot,
 * extraction is tolerant and truncate-not-reject. The classifier only
 * PROPOSES; `awardTitles` decides.
 */

import { z } from 'zod'
import { SKILLS } from './constants'
import {
  RPG_TITLE_MAX_SKILLS,
  RPG_TITLE_NAME_MAX,
  RPG_TITLE_REASON_MAX,
  RPG_TITLES_MAX,
  RPG_TITLES_MAX_PER_TURN,
  normalizeTitle,
  sanitizeTitleText,
  type RpgTitle,
  type RpgTitleLoad,
} from './titles'

export const titleProposalSchema = z.object({
  name: z
    .string()
    .describe(
      `A short honorific, 1-3 words, under ${RPG_TITLE_NAME_MAX} characters, e.g. "Charmer", "Wyrm-Slayer"`,
    ),
  skills: z
    .array(z.string())
    .default([])
    .describe(`1-${RPG_TITLE_MAX_SKILLS} skill ids from the SKILL IDS list this title covers`),
  reason: z
    .string()
    .default('')
    .describe(`The accomplishment, one clause, under ${RPG_TITLE_REASON_MAX} characters`),
})

export type TitleProposal = z.infer<typeof titleProposalSchema>

const TITLES_EARNED_DESCRIPTION = `Titles the protagonist EARNED in this response through a clear, completed, named accomplishment — not an attempt, not progress, not a mood. Empty almost always; at most ${RPG_TITLES_MAX_PER_TURN}.`

/** Extend the classification schema; returns the input UNCHANGED when it isn't extendable. */
export function extendClassificationSchemaWithTitles(schema: z.ZodType): z.ZodType {
  const objectSchema = schema as unknown as z.ZodObject<z.ZodRawShape>
  if (typeof objectSchema.extend !== 'function') return schema
  return objectSchema.extend({
    titlesEarned: z.array(titleProposalSchema).default([]).describe(TITLES_EARNED_DESCRIPTION),
  })
}

/** Dynamic instruction block — renders the earned list so nothing is re-awarded. */
export function buildTitlesInstructions(titles: ReadonlyArray<RpgTitle>): string {
  const earned =
    titles.length > 0
      ? titles
          .map((t) => `- ${sanitizeTitleText(t.name, RPG_TITLE_NAME_MAX)} (${t.skills.join(', ')})`)
          .join('\n')
      : '(none yet)'
  const skillIds = SKILLS.map((s) => `${s.id} = ${s.label}`).join(', ')
  return `## Earned Titles
The protagonist can earn titles for clear accomplishments; each grants a small bonus on the skills it covers (${RPG_TITLES_MAX} at most). Additionally fill one top-level array:
- \`titlesEarned\`: ONLY when this response shows the protagonist COMPLETING a notable, named feat — winning a duel, talking a hostile crowd down, finishing a ritual, slaying something dangerous. Propose a short honorific (\`name\`), the 1-${RPG_TITLE_MAX_SKILLS} skills it covers (\`skills\`, ids from SKILL IDS), and the deed (\`reason\`). Never for attempts, partial progress, or titles already EARNED below. Almost every response earns nothing; at most ${RPG_TITLES_MAX_PER_TURN}.
SKILL IDS: ${skillIds}
EARNED:
${earned}`
}

/** Validated title proposals off a classification result; malformed entries dropped, VALID entries capped. */
export function titlesEarnedFromResult(result: Record<string, unknown>): RpgTitleLoad[] {
  const raw = result['titlesEarned']
  if (!Array.isArray(raw)) return []
  const loads: RpgTitleLoad[] = []
  for (const candidate of raw) {
    if (loads.length >= RPG_TITLES_MAX_PER_TURN) break
    const parsed = titleProposalSchema.safeParse(candidate)
    if (!parsed.success) continue
    const title = normalizeTitle(parsed.data)
    if (title) loads.push(title)
  }
  return loads
}
