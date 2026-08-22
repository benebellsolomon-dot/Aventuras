/**
 * E5 — classifier schema extension for the GM's Notebook (research/65).
 *
 * Same contract as chekhov-schema.ts: arrays arrive via schema extension,
 * instructions piggyback on the customVariableInstructions slot, extraction is
 * tolerant and truncate-not-reject (no hard `.max()` — an overflow must never
 * void the whole turn's classification). The classifier only OBSERVES: it
 * proposes new notes (`gmNotesAdd`) and reports notes that became stale or
 * moot (`gmNotesDrop`) against the rendered ACTIVE NOTES list.
 */

import { z } from 'zod'
import { sanitizeDebtText } from './chekhov'
import { GM_NOTES_MAX, GM_NOTE_TEXT_MAX, GM_NOTES_MAX_ADDS_PER_TURN } from './constants'
import { GM_NOTE_ID_PATTERN, coerceNoteKind, type GmNote, type GmNoteLoad } from './notebook'

/** A response can moot the whole list at once (cover blown wholesale). */
export const GM_NOTES_MAX_DROPS_PER_TURN = GM_NOTES_MAX
const GM_NOTE_ID_RENDER_MAX = 16

export const gmNoteProposalSchema = z.object({
  kind: z
    .string()
    .describe('"reminder" (a fact to keep straight) or "thread" (an open situation in play)'),
  text: z
    .string()
    .describe(
      `The note, concrete and self-contained, under ${GM_NOTE_TEXT_MAX} characters, e.g. "Stacy does not know the eclipse protocol exists" or "You are posing as a spice merchant named Orin"`,
    ),
})

export type GmNoteProposal = z.infer<typeof gmNoteProposalSchema>

const GM_NOTES_ADD_DESCRIPTION = `NEW continuity notes the narrator must keep straight from now on: who knows what, standing pretenses and disguises, promises of silence, rules the scene established. NOT setups/payoffs, quests, or relationship shifts (tracked elsewhere). Empty most turns; at most ${GM_NOTES_MAX_ADDS_PER_TURN}.`

const GM_NOTES_DROP_DESCRIPTION =
  'Ids from the ACTIVE NOTES list that this response made stale or moot (the secret came out, the disguise dropped). Empty when none did.'

/** Extend the classification schema; returns the input UNCHANGED when it isn't extendable. */
export function extendClassificationSchemaWithGmNotes(schema: z.ZodType): z.ZodType {
  const objectSchema = schema as unknown as z.ZodObject<z.ZodRawShape>
  if (typeof objectSchema.extend !== 'function') return schema
  return objectSchema.extend({
    gmNotesAdd: z.array(gmNoteProposalSchema).default([]).describe(GM_NOTES_ADD_DESCRIPTION),
    gmNotesDrop: z.array(z.string()).default([]).describe(GM_NOTES_DROP_DESCRIPTION),
  })
}

/** Dynamic instruction block — renders the active notes so drops can name real ids. */
export function buildGmNotesInstructions(notes: ReadonlyArray<GmNote>): string {
  const active =
    notes.length > 0
      ? notes
          .map(
            (n) =>
              `- ${sanitizeDebtText(n.id, GM_NOTE_ID_RENDER_MAX)} [${n.kind}]: ${sanitizeDebtText(n.text, GM_NOTE_TEXT_MAX)}`,
          )
          .join('\n')
      : '(none)'
  return `## GM's Notebook (continuity notes)
This story keeps a short list of continuity notes for the narrator. Additionally fill two top-level arrays:
- \`gmNotesAdd\`: NEW notes this response established that later narration must honor — who knows (or does not know) what, a standing pretense or disguise, a promise of silence, a rule the scene set. Write each as one concrete sentence. Do NOT log setups/payoffs (tracked separately), quests (story beats), relationship shifts (tracked separately), or moods. \`kind\` = "reminder" for a fact, "thread" for an open situation. Most responses add none; at most ${GM_NOTES_MAX_ADDS_PER_TURN}.
- \`gmNotesDrop\`: ids from ACTIVE NOTES below that this response made stale or moot. Empty when none did.
ACTIVE NOTES:
${active}`
}

/** Validated note proposals off a classification result; malformed entries dropped, VALID entries capped. */
export function gmNotesAddFromResult(result: Record<string, unknown>): GmNoteLoad[] {
  const raw = result['gmNotesAdd']
  if (!Array.isArray(raw)) return []
  const loads: GmNoteLoad[] = []
  for (const candidate of raw) {
    if (loads.length >= GM_NOTES_MAX_ADDS_PER_TURN) break
    const parsed = gmNoteProposalSchema.safeParse(candidate)
    if (!parsed.success) continue
    const text = sanitizeDebtText(parsed.data.text, GM_NOTE_TEXT_MAX)
    if (text === '') continue
    loads.push({ kind: coerceNoteKind(parsed.data.kind), text })
  }
  return loads
}

/** Validated drop ids: engine-shaped AND present in the active list — nothing else can touch anything. */
export function gmNotesDropFromResult(
  result: Record<string, unknown>,
  notes: ReadonlyArray<GmNote>,
): string[] {
  const raw = result['gmNotesDrop']
  if (!Array.isArray(raw)) return []
  const known = new Set(notes.map((n) => n.id))
  const drops: string[] = []
  for (const candidate of raw) {
    if (drops.length >= GM_NOTES_MAX_DROPS_PER_TURN) break
    if (typeof candidate !== 'string') continue
    const id = candidate.trim()
    if (GM_NOTE_ID_PATTERN.test(id) && known.has(id) && !drops.includes(id)) drops.push(id)
  }
  return drops
}
