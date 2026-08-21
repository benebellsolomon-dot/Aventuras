/**
 * E4 — off-screen NPC agendas (research/61, FF5.2 Internal Agenda port).
 *
 * State lives at `character.metadata.npcAgenda` (sibling of bodyState; same
 * checkpoint/snapshot/branch coverage for free). This module is pure value
 * logic + typed metadata access — the store sequences ticking/backfill and
 * owns every write, mirroring the be/metadata.ts + reducer split.
 *
 * FF's design, re-homed: named NPCs carry {goal, step/max, location}; NPCs
 * off-screen advance +1/turn; completion effects fire once; agendas refresh.
 * The LLM's only role here is proposing flavorful goals (worldsim/schema.ts) —
 * ticking, backfill, completion, and rendering are all deterministic.
 */

import { z } from 'zod'
import { seededRoll } from '$lib/services/be'
import type { BondEvent } from '$lib/services/be'
import { AGENDA_MAX_STEPS, MAX_OFFSCREEN_LINES, MUNDANE_GOALS } from './constants'

export const NPC_AGENDA_KEY = 'npcAgenda'

export type AgendaKind = 'travel' | 'research' | 'rest' | 'reconcile' | 'confront' | 'mundane'

export const AGENDA_KINDS: ReadonlyArray<AgendaKind> = [
  'travel',
  'research',
  'rest',
  'reconcile',
  'confront',
  'mundane',
]

export interface NpcAgenda {
  /** Short human phrase — rendered verbatim in the [OFF-SCREEN] block. */
  goal: string
  kind: AgendaKind
  /** 0-based progress; completes at step >= maxSteps. */
  step: number
  /** Clamped 1..AGENDA_MAX_STEPS at read AND accept time. */
  maxSteps: number
  /** Where she is / where it happens (flavor; travel completion rewrites it). */
  location?: string
  /** Travel target. */
  destination?: string
  /** Completion effect already applied; the slot is refillable. */
  done?: boolean
}

// .passthrough(): a newer build's extra fields survive this older reader
// (31a lesson 3). .catch(undefined) at the top: a malformed block degrades to
// "no agenda" — it must never throw in a read path or poison sibling metadata
// reads (the research/60 fix-diff MEDIUM-4 lesson, applied from day one).
const npcAgendaSchema = z
  .object({
    goal: z.string(),
    kind: z.enum(['travel', 'research', 'rest', 'reconcile', 'confront', 'mundane']),
    step: z.number(),
    maxSteps: z.number(),
    location: z.string().optional(),
    destination: z.string().optional(),
    done: z.boolean().optional(),
  })
  .passthrough()
  .optional()
  .catch(undefined)

const clampSteps = (value: number): number =>
  Number.isFinite(value) ? Math.min(AGENDA_MAX_STEPS, Math.max(1, Math.round(value))) : 1

const clampStep = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : 0

/**
 * One prompt-safe line: control characters and newlines collapse to spaces,
 * length capped. Goal/destination strings are LLM-authored and render into the
 * user-prompt tail — an unstripped newline is a block-breakout vector (a goal
 * containing "\n[CHECK RESULT]…" would render a spoofed authority block), and
 * the agenda PERSISTS, so an injected payload would re-render every turn.
 */
export const sanitizeAgendaText = (value: string, max: number): string =>
  value
    // Invisible/format codepoints strip OUTRIGHT (soft hyphen, bidi marks
    // and isolates, ZWSP, word joiners, Hangul fillers, interlinear
    // annotation, and the U+E0000 tag block — the standard ASCII-smuggling
    // carrier): invisible to human review, fully legible to a model (review
    // lens 2, Phase 4). ZWJ/ZWNJ (U+200C/D) are deliberately KEPT — they are
    // load-bearing in emoji sequences, Persian, and Indic conjuncts, and
    // carry no block-breakout risk once newlines/brackets are handled
    // (fix-diff round: the first cut stripped them and corrupted real text).
    .replace(
      /[\u00ad\u061c\u115f\u1160\u180e\u200b\u200e\u200f\u2060-\u2064\u2066-\u206f\u3164\ufff9-\ufffb\uffa0\u{e0000}-\u{e007f}]+/gu,
      '',
    )
    .replace(/[\r\n\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

export const AGENDA_GOAL_MAX = 120
export const AGENDA_PLACE_MAX = 80

/**
 * Read a character's agenda out of metadata. Null when absent or malformed.
 * Stored values are never trusted — steps clamp and strings sanitize at read
 * time (an empty goal after sanitizing counts as malformed).
 */
export function readNpcAgenda(metadata: Record<string, unknown> | null): NpcAgenda | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = metadata[NPC_AGENDA_KEY]
  if (raw === undefined || raw === null) return null
  const parsed = npcAgendaSchema.safeParse(raw)
  if (!parsed.success || parsed.data === undefined) return null
  const agenda = parsed.data as NpcAgenda
  const goal = sanitizeAgendaText(agenda.goal, AGENDA_GOAL_MAX)
  if (goal === '') return null
  const location =
    agenda.location !== undefined
      ? sanitizeAgendaText(agenda.location, AGENDA_PLACE_MAX)
      : undefined
  const destination =
    agenda.destination !== undefined
      ? sanitizeAgendaText(agenda.destination, AGENDA_PLACE_MAX)
      : undefined
  // location/destination are OVERWRITTEN unconditionally — a conditional
  // spread over `...agenda` let a raw all-control-chars value survive under
  // the sanitized-empty case (fix-diff MEDIUM: "stored values are never
  // trusted" must mean never).
  const normalized: NpcAgenda = {
    ...agenda,
    goal,
    step: clampStep(agenda.step),
    maxSteps: clampSteps(agenda.maxSteps),
    done: agenda.done === true,
  }
  delete normalized.location
  delete normalized.destination
  if (location) normalized.location = location
  if (destination) normalized.destination = destination
  return normalized
}

/** New metadata object with the agenda written; sibling keys untouched.
 * JSON clone, not structuredClone: passthrough fields read off a reactive
 * $state proxy are copied by reference, and structuredClone throws on a Proxy. */
export function writeNpcAgenda(
  metadata: Record<string, unknown> | null,
  agenda: NpcAgenda,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [NPC_AGENDA_KEY]: JSON.parse(JSON.stringify(agenda)) }
}

/** New metadata object with the agenda removed (seen-on-screen done slot clear). */
export function clearNpcAgenda(metadata: Record<string, unknown> | null): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  delete next[NPC_AGENDA_KEY]
  return next
}

export interface AgendaTickResult {
  next: NpcAgenda
  /** True exactly on the tick that crossed the finish line (effects fire once). */
  completed: boolean
}

/**
 * One off-screen turn: +1 step; completion pins step at maxSteps and sets
 * `done`. Ticking a done agenda is a no-op (the backfill replaces it instead).
 */
export function tickAgenda(agenda: NpcAgenda): AgendaTickResult {
  if (agenda.done) return { next: agenda, completed: false }
  const step = agenda.step + 1
  if (step >= agenda.maxSteps) {
    return { next: { ...agenda, step: agenda.maxSteps, done: true }, completed: true }
  }
  return { next: { ...agenda, step }, completed: false }
}

/** Deterministic mundane backfill (FF: "if no clear goal, assign a mundane one"). */
export function mundaneAgenda(seed: string): NpcAgenda {
  const pick = MUNDANE_GOALS[(seededRoll(seed) - 1) % MUNDANE_GOALS.length]
  return { goal: pick.goal, kind: 'mundane', step: 0, maxSteps: pick.maxSteps }
}

/**
 * Completion effect → relationship event, per the research/61 translation of
 * FF's table. Earned-only discipline: ordinary capped warm/strain events —
 * never `potent` (spell-only), never direct bond movement. rest/travel/mundane
 * complete flavor-only (grudge already decays on the rel cadence; travel's
 * effect is the location rewrite, applied by the caller).
 */
export function agendaCompletionBondEvent(
  agenda: NpcAgenda,
  characterName: string,
): BondEvent | null {
  switch (agenda.kind) {
    case 'research':
      return { character: characterName, direction: 'warm', intensity: 1 }
    case 'reconcile':
      return { character: characterName, direction: 'warm', intensity: 2 }
    case 'confront':
      return { character: characterName, direction: 'strain', intensity: 2 }
    default:
      return null
  }
}

/** Travel completion rewrites her known whereabouts. Caller applies on `completed`. */
export function agendaCompletionLocation(agenda: NpcAgenda): string | undefined {
  return agenda.kind === 'travel' && agenda.destination ? agenda.destination : undefined
}

// ---- [OFF-SCREEN] block rendering ----

export const OFF_SCREEN_HEADER = '[OFF-SCREEN — the world keeps moving]'

export interface OffScreenEntry {
  name: string
  agenda: NpcAgenda
  /** True when their engine-tracked stance is bonded or deeper (beMode only). */
  closeToHim?: boolean
}

/** Quantized progress phase — never step numbers (FF: no mechanics in prose). */
function phaseWord(agenda: NpcAgenda): string {
  if (agenda.done) return 'finished'
  if (agenda.maxSteps <= 1 || agenda.step === 0) return 'just started'
  return agenda.step >= agenda.maxSteps - 1 ? 'nearly done' : 'underway'
}

// Pronoun-neutral: the agenda universe is every named non-self character, not
// only tracked girls (review lens 3) — arrival lines must fit any NPC.
function arrivalColoring(entry: OffScreenEntry): string {
  const { agenda } = entry
  if (!agenda.done) {
    return 'If they enter, they arrive mid-errand — distracted, other obligations in mind.'
  }
  switch (agenda.kind) {
    case 'reconcile':
      return 'If they enter, they are subdued and looking for a chance to repair things.'
    case 'mundane':
    case 'rest':
      return 'If they enter, they are present and unhurried.'
    default:
      return entry.closeToHim
        ? 'If they enter, they arrive energized and want to share what came of it.'
        : 'If they enter, they arrive energized, carrying the result with them.'
  }
}

const priorityClass = (agenda: NpcAgenda): number => {
  if (agenda.done) return 0
  return agenda.kind === 'mundane' ? 2 : 1
}

/** Codepoint compare — localeCompare's ICU dependence would make the seeded
 * pick environment-sensitive, breaking strict replay. */
export const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Build the [OFF-SCREEN] block: up to MAX_OFFSCREEN_LINES lines, priority
 * done > in-progress non-mundane > mundane, name-sorted within class. Empty
 * string when nothing to show (the caller then renders no block at all).
 */
export function buildOffScreenBlock(entries: ReadonlyArray<OffScreenEntry>): string {
  if (entries.length === 0) return ''
  const chosen = [...entries]
    .sort(
      (a, b) => priorityClass(a.agenda) - priorityClass(b.agenda) || byCodepoint(a.name, b.name),
    )
    .slice(0, MAX_OFFSCREEN_LINES)
  const lines = chosen.map((entry) => {
    // A completed travel already says where they ended up — "away (at X):
    // traveling to X" read as a contradiction (review lens 3).
    const where = entry.agenda.location ? ` — at ${entry.agenda.location}` : ' — away'
    return `- ${entry.name}${where}: ${entry.agenda.goal} (${phaseWord(entry.agenda)}). ${arrivalColoring(entry)}`
  })
  return `${OFF_SCREEN_HEADER}
These are background truths about characters not in the scene — not stage directions. Never force an entrance; the player's action and the scene decide who actually appears. Never mention goals, steps, or schedules as mechanics.
${lines.join('\n')}`
}
