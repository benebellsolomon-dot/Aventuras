/**
 * E5 — GM's Notebook (research/65).
 *
 * FF5.2 keeps a capped hidden scratchpad the model re-reads every turn. Here it
 * is a SMALL, always-hot, engine-persisted list of continuity notes the
 * narrator must keep straight ("Stacy doesn't know about the eclipse
 * protocol", "you are posing as a spice merchant") — distinct from long-term
 * memory (beats, summaries, retrieval), which covers recall, not hot facts.
 *
 * Ownership contract: the classifier OBSERVES (proposes adds, reports stale
 * ids); the engine owns the list — caps, expiry, ids, FIFO — and the story
 * store's `applyGmNotebookTurn` is the single writer. State lives at
 * `metadata.gmNotebook` on the SELF character (the chekhov hosting ruling:
 * full rollback/branch/retry coverage; no protagonist ⇒ engine inert).
 *
 * Everything here is pure.
 */

import { z } from 'zod'
import { sanitizeDebtText } from './chekhov'
import {
  GM_NOTES_MAX,
  GM_NOTE_MAX_AGE,
  GM_NOTE_TEXT_MAX,
  GM_NOTES_MAX_ADDS_PER_TURN,
  GM_NOTE_NEXT_ID_MAX,
} from './constants'

export const GM_NOTEBOOK_KEY = 'gmNotebook'

/** The only id shape the engine mints or accepts. */
export const GM_NOTE_ID_PATTERN = /^n\d{1,6}$/

export const GM_NOTE_KINDS = ['reminder', 'thread'] as const
export type GmNoteKind = (typeof GM_NOTE_KINDS)[number]

export interface GmNote {
  id: string
  kind: GmNoteKind
  text: string
  /** Turns since the note was written — expiry counter. */
  age: number
}

export interface GmNotebookState {
  notes: ReadonlyArray<GmNote>
  nextId: number
}

// Deep-frozen AND typed readonly — no caller can be talked into pushing.
export const EMPTY_GM_NOTEBOOK: GmNotebookState = Object.freeze({
  notes: Object.freeze([]) as ReadonlyArray<GmNote>,
  nextId: 1,
})

/** A proposed note (classifier extraction output, already sanitized). */
export interface GmNoteLoad {
  kind: GmNoteKind
  text: string
}

const noteSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    text: z.string(),
    age: z.number().catch(0),
  })
  .passthrough()

// Notes parse ELEMENT-WISE below: one malformed note must not wipe the list
// (review finding 8 — the array-level catch alone would).
const notebookSchema = z
  .object({
    notes: z.array(z.unknown()).catch([]),
    nextId: z.number().catch(0),
  })
  .passthrough()
  .optional()
  .catch(undefined)

const clampAge = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.min(GM_NOTE_MAX_AGE, Math.round(value)) : 0

export const coerceNoteKind = (value: unknown): GmNoteKind =>
  value === 'thread' ? 'thread' : 'reminder'

const idSuffix = (id: string): number => {
  const parsed = Number.parseInt(id.slice(1), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeNote(raw: z.infer<typeof noteSchema>): GmNote | null {
  const text = sanitizeDebtText(raw.text, GM_NOTE_TEXT_MAX)
  const id = raw.id.trim()
  if (text === '' || !GM_NOTE_ID_PATTERN.test(id)) return null
  // Literal, not spread: a 4-field record gains nothing from passthrough, and
  // unknown keys would otherwise persist forever (security review F6).
  return { id, kind: coerceNoteKind(raw.kind), text, age: clampAge(raw.age) }
}

/** Read the notebook off the SELF character's metadata; null = no state yet. */
export function readGmNotebook(metadata: Record<string, unknown> | null): GmNotebookState | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = metadata[GM_NOTEBOOK_KEY]
  if (raw === undefined || raw === null) return null
  const parsed = notebookSchema.safeParse(raw)
  if (!parsed.success || parsed.data === undefined) return null
  const notes: GmNote[] = []
  const seen = new Set<string>()
  for (const rawNote of parsed.data.notes) {
    const parsedNote = noteSchema.safeParse(rawNote)
    if (!parsedNote.success) continue
    const note = normalizeNote(parsedNote.data)
    if (!note || seen.has(note.id)) continue
    seen.add(note.id)
    notes.push(note)
  }
  // Over-long stored lists keep the NEWEST (the end the writer trims from).
  if (notes.length > GM_NOTES_MAX) notes.splice(0, notes.length - GM_NOTES_MAX)
  const maxUsed = notes.reduce((max, n) => Math.max(max, idSuffix(n.id)), 0)
  const rawStored =
    Number.isFinite(parsed.data.nextId) && parsed.data.nextId > 0
      ? Math.round(parsed.data.nextId)
      : 1
  const stored = rawStored > GM_NOTE_NEXT_ID_MAX ? 1 : rawStored
  const nextId = Math.min(GM_NOTE_NEXT_ID_MAX, Math.max(stored, maxUsed + 1))
  return { ...(parsed.data as unknown as GmNotebookState), notes, nextId }
}

/** New metadata object with the notebook written; sibling keys untouched. */
export function writeGmNotebook(
  metadata: Record<string, unknown> | null,
  state: GmNotebookState,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [GM_NOTEBOOK_KEY]: JSON.parse(JSON.stringify(state)) }
}

export interface GmNotebookAdvanceInput {
  state: GmNotebookState
  /** Ids the classifier reported stale/moot — already validated against the active list. */
  dropIds: ReadonlyArray<string>
  /** New notes this turn (already sanitized; capped here). */
  loads: ReadonlyArray<GmNoteLoad>
}

/**
 * One turn of the notebook: drop reported ids → age every survivor (expire at
 * GM_NOTE_MAX_AGE) → append new notes (per-turn cap, duplicate text skipped)
 * → FIFO-trim to GM_NOTES_MAX (oldest first). Pure; never mutates `state`.
 */
export function advanceGmNotebook(input: GmNotebookAdvanceInput): GmNotebookState {
  const drop = new Set(input.dropIds)
  const aged: GmNote[] = []
  for (const note of input.state.notes) {
    if (drop.has(note.id)) continue
    const age = Math.min(GM_NOTE_MAX_AGE, note.age + 1)
    // Threads expire; reminders are facts and only leave by drop or eviction.
    if (note.kind === 'thread' && age >= GM_NOTE_MAX_AGE) continue
    aged.push({ ...note, age })
  }
  const existingTexts = new Set(aged.map((n) => n.text.toLowerCase()))
  let nextId = input.state.nextId
  let added = 0
  const appended: GmNote[] = []
  for (const load of input.loads) {
    if (added >= GM_NOTES_MAX_ADDS_PER_TURN) break
    if (nextId >= GM_NOTE_NEXT_ID_MAX) break
    const text = sanitizeDebtText(load.text, GM_NOTE_TEXT_MAX)
    if (text === '' || existingTexts.has(text.toLowerCase())) continue
    existingTexts.add(text.toLowerCase())
    appended.push({ id: `n${nextId}`, kind: coerceNoteKind(load.kind), text, age: 0 })
    nextId += 1
    added += 1
  }
  const notes = evictToCap([...aged, ...appended])
  return { ...input.state, notes, nextId }
}

/**
 * Over-cap eviction: the oldest THREAD goes first (an open situation ages out
 * of relevance), then the oldest REMINDER — never a note added this turn.
 * Document order is preserved. Pure.
 */
function evictToCap(notes: ReadonlyArray<GmNote>): GmNote[] {
  const kept = [...notes]
  const evictOne = (kind: GmNoteKind): boolean => {
    let victim = -1
    for (let i = 0; i < kept.length; i++) {
      const n = kept[i]
      if (n.kind !== kind || n.age === 0) continue
      if (victim === -1 || n.age > kept[victim].age) victim = i
    }
    if (victim === -1) return false
    kept.splice(victim, 1)
    return true
  }
  while (kept.length > GM_NOTES_MAX) {
    if (evictOne('thread') || evictOne('reminder')) continue
    kept.shift()
  }
  return kept
}

// ---- Rendering ----

export const GM_NOTES_HEADER = '[GM NOTES — continuity to keep straight]'

/** The narrator-facing block. Empty string when there is nothing to say. */
export function buildGmNotesBlock(notes: ReadonlyArray<GmNote>): string {
  if (notes.length === 0) return ''
  const lines = notes.map(
    (n) =>
      `- ${n.kind === 'thread' ? 'Thread' : 'Remember'}: ${sanitizeDebtText(n.text, GM_NOTE_TEXT_MAX)}`,
  )
  return [
    GM_NOTES_HEADER,
    ...lines,
    '"Remember" lines are established facts: honor them silently, never announce them. "Thread" lines are situations still in motion: let them move only when the scene reaches them. A directive block below that contradicts a note wins for this turn.',
  ].join('\n')
}
