/**
 * E2 — classifier schema extension for narrative debt (research/62).
 *
 * Same contract as be/schema.ts and worldsim/schema.ts: arrays arrive via
 * schema extension (the classifier's Zod strips unknown keys), instructions
 * piggyback on the customVariableInstructions slot, extraction is tolerant.
 *
 * The classifier only OBSERVES: it reports new debt the narration introduced
 * (`narrativeDebt`) and which listed setups the narration paid off
 * (`resolvedDebts`). Loading, aging, firing, retiring — all engine-side.
 *
 * Deliberately NO hard `.max()` length/count constraints on these fields:
 * providers that don't enforce maxLength/maxItems in structured output would
 * fail the WHOLE classification parse on overflow, silently voiding every
 * entity update for the turn (review lens 1+2+3, HIGH). Caps live in the
 * `.describe` text for the model and are enforced by truncation/slicing in
 * the extractors below. (Type-shape requirements remain — structured-output
 * providers do enforce types. The sibling BE/agenda extensions have since
 * been converted to this same pattern — the Phase 4 review upgraded the
 * risk research/61 had accepted.)
 */

import { z } from 'zod'
import type { ChekhovBullet, ChekhovLoad } from './chekhov'
import { CHEKHOV_ID_PATTERN, clampWeight, sanitizeDebtText } from './chekhov'
import {
  CHEKHOV_DESC_MAX,
  CHEKHOV_LOCK_MAX,
  CHEKHOV_MAX_LOADS_PER_TURN,
  CHEKHOV_MAX_SUBJECTS,
  CHEKHOV_SUBJECT_MAX,
} from './constants'

export const narrativeDebtSchema = z.object({
  description: z
    .string()
    .describe(
      `The unresolved setup, concrete and self-contained, under ${CHEKHOV_DESC_MAX} characters, e.g. "the locked drawer in the study" or "Jonas promised to return by nightfall"`,
    ),
  weight: z.number().describe('1 = minor texture, 2 = meaningful setup, 3 = major plot debt'),
  subjects: z
    .array(z.string())
    .default([])
    .describe(
      `Named characters this setup involves (up to ${CHEKHOV_MAX_SUBJECTS}); empty for pure environment details`,
    ),
  lockTurns: z
    .number()
    .describe(
      `ONLY when the setup names a future moment ("tonight", "at noon"): estimated story beats until it is due, 1-${CHEKHOV_LOCK_MAX}. Omit otherwise.`,
    )
    .optional(),
})

export type NarrativeDebtProposal = z.infer<typeof narrativeDebtSchema>

export const CHEKHOV_MAX_RESOLVED_PER_TURN = 8

/** Render-time bound for bullet ids (real ids are ≤7 chars per
 * CHEKHOV_ID_PATTERN — headroom only so a corrupt stored id can't bloat the
 * ACTIVE SETUPS prompt line before read-validation drops it). */
const CHEKHOV_ID_RENDER_MAX = 16

const NARRATIVE_DEBT_DESCRIPTION = `NEW unresolved setups this response introduced: planted objects, explicit promises, secrets, appointments, pointedly-noted details that should pay off later. NOT quests or plot arcs (tracked separately), NOT relationship shifts. Empty most turns; at most ${CHEKHOV_MAX_LOADS_PER_TURN}.`

const RESOLVED_DEBTS_DESCRIPTION =
  'Ids from the ACTIVE SETUPS list that this response clearly paid off or rendered moot. Empty when none were.'

/**
 * Extend a classification schema with the narrativeDebt + resolvedDebts
 * arrays. Returns the input UNCHANGED when it isn't an extendable object
 * schema — callers detect the no-op by reference identity and should warn.
 */
export function extendClassificationSchemaWithChekhov(schema: z.ZodType): z.ZodType {
  const objectSchema = schema as unknown as z.ZodObject<z.ZodRawShape>
  if (typeof objectSchema.extend !== 'function') return schema
  return objectSchema.extend({
    narrativeDebt: z.array(narrativeDebtSchema).default([]).describe(NARRATIVE_DEBT_DESCRIPTION),
    resolvedDebts: z.array(z.string()).default([]).describe(RESOLVED_DEBTS_DESCRIPTION),
  })
}

/**
 * Prompt instruction block — DYNAMIC: it renders the current active bullets so
 * the classifier can report resolutions against real ids. Descriptions AND ids
 * are sanitized again at render (they are LLM-authored/persisted; "never trust
 * stored values" applies to prompt surfaces too). Time-locked setups are
 * marked so a scheduled-but-not-yet-due appointment isn't reported resolved
 * just because the scene moved on.
 */
export function buildChekhovInstructions(bullets: ReadonlyArray<ChekhovBullet>): string {
  const active =
    bullets.length > 0
      ? bullets
          .map(
            (b) =>
              `- ${sanitizeDebtText(b.id, CHEKHOV_ID_RENDER_MAX)}: ${sanitizeDebtText(b.description, CHEKHOV_DESC_MAX)}${
                b.lockTurns !== undefined && b.lockTurns > 0 ? ' (scheduled — not yet due)' : ''
              }`,
          )
          .join('\n')
      : '(none)'
  return `## Narrative Debt (Setup / Payoff Tracking)
This story tracks unresolved setups so earlier details can resurface later. Additionally fill two top-level arrays:
- \`narrativeDebt\`: NEW concrete, payoff-able setups this response introduced — a planted object, an explicit promise, a secret, an appointment, a pointedly-noted detail. If you cannot name the specific object, promise, or appointment, log nothing. Do NOT log quests or plot arcs (story beats track those), relationship shifts (tracked separately), or vague moods. \`weight\` = 1 minor / 2 meaningful / 3 major. \`subjects\` = named characters involved. \`lockTurns\` ONLY for setups due at a stated future moment. Most responses introduce none; at most ${CHEKHOV_MAX_LOADS_PER_TURN}.
- \`resolvedDebts\`: ids from ACTIVE SETUPS below that this response clearly paid off or rendered moot. Empty when none were.
ACTIVE SETUPS:
${active}`
}

/**
 * Pull validated debt proposals off a classification result as engine loads.
 * Tolerates absence and silently drops malformed entries (the *FromResult
 * family's rules); every cap the schema no longer hard-enforces is applied
 * here by truncation/slicing, and again at load.
 */
export function narrativeDebtFromResult(result: Record<string, unknown>): ChekhovLoad[] {
  const raw = result['narrativeDebt']
  if (!Array.isArray(raw)) return []
  const loads: ChekhovLoad[] = []
  // Cap VALID entries, not raw indexes — a run of malformed leading entries
  // must not starve out well-formed ones behind it.
  for (const candidate of raw) {
    if (loads.length >= CHEKHOV_MAX_LOADS_PER_TURN) break
    const parsed = narrativeDebtSchema.safeParse(candidate)
    if (!parsed.success) continue
    const description = sanitizeDebtText(parsed.data.description, CHEKHOV_DESC_MAX)
    if (description === '') continue
    const lockTurns = Number.isFinite(parsed.data.lockTurns) ? parsed.data.lockTurns! : 0
    loads.push({
      description,
      weight: clampWeight(parsed.data.weight),
      subjects: parsed.data.subjects
        .map((s) => sanitizeDebtText(s, CHEKHOV_SUBJECT_MAX))
        .filter((s) => s !== '')
        .slice(0, CHEKHOV_MAX_SUBJECTS),
      ...(lockTurns > 0
        ? { lockTurns: Math.min(CHEKHOV_LOCK_MAX, Math.max(1, Math.round(lockTurns))) }
        : {}),
    })
  }
  return loads
}

/**
 * Validated resolution ids: shape-checked ("c<digits>") and — critically —
 * restricted to ids that exist in the active list, so a hallucinated or
 * injected id can never touch anything.
 */
export function resolvedDebtsFromResult(
  result: Record<string, unknown>,
  bullets: ReadonlyArray<ChekhovBullet>,
): string[] {
  const raw = result['resolvedDebts']
  if (!Array.isArray(raw)) return []
  // Time-locked bullets are not resolvable: the "(scheduled — not yet due)"
  // marker is advisory, and a model ignoring it would delete an appointment
  // before it could ever fire (fix-diff round). A moot schedule unlocks and
  // prunes naturally instead.
  const known = new Set(
    bullets.filter((b) => !(b.lockTurns !== undefined && b.lockTurns > 0)).map((b) => b.id),
  )
  const resolved: string[] = []
  for (const candidate of raw) {
    if (resolved.length >= CHEKHOV_MAX_RESOLVED_PER_TURN) break
    if (typeof candidate !== 'string') continue
    const id = candidate.trim()
    if (CHEKHOV_ID_PATTERN.test(id) && known.has(id) && !resolved.includes(id)) {
      resolved.push(id)
    }
  }
  return resolved
}
