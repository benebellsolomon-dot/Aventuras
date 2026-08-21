/**
 * World-liveliness engines — tuning constants (research/61, FF5.2 Phase 3).
 *
 * The event tables are FF5.2's World Sim tables ported structurally verbatim
 * (2-point bands, CALM at both extremes on both tables); the directive text is
 * rewritten from event descriptions into narrator instructions. `{name}` is
 * the engine-picked NPC slot — picks are seeded and engine-side, never left to
 * the model (research/58 translation principle: we have ground truth FF lacks).
 *
 * ⚠ D5-style caveat: gate/suppression numbers are reference defaults; tune
 * against playtest cadence, not in the abstract.
 */

export type WorldEventTableId = 'standard' | 'duo'

/** What the event's directive template needs to render. */
export type WorldEventTarget = 'present-npc' | 'offscreen-npc' | null

export interface WorldEventDef {
  id: string
  /** Inclusive d20 band. CALM appears twice (1-2 and 19-20) per FF. */
  min: number
  max: number
  target: WorldEventTarget
  /** Narrator directive; `{name}` is replaced with the picked NPC. Empty = renders nothing (CALM). */
  directive: string
}

// FF CALM plants a passive Chekhov seed — that half is E2 (Phase 4); until
// then a CALM turn simply renders no block.
const CALM_LOW: WorldEventDef = { id: 'CALM', min: 1, max: 2, target: null, directive: '' }
const CALM_HIGH: WorldEventDef = { id: 'CALM', min: 19, max: 20, target: null, directive: '' }

/** Standard table: 3+ present NPCs and an off-screen cast to draw on. */
export const STANDARD_TABLE: ReadonlyArray<WorldEventDef> = [
  CALM_LOW,
  {
    id: 'ENTER_CHECK',
    min: 3,
    max: 4,
    target: 'offscreen-npc',
    directive:
      '{name} is approaching from elsewhere — have them arrive within the next beat or two, or let word from them (a message, a knock, a voice nearing) reach the scene now.',
  },
  {
    id: 'BACKGROUND_INCIDENT',
    min: 5,
    max: 6,
    target: null,
    directive:
      'A minor mundane incident happens just out of view — something audible or briefly referenced (a dropped crate, an argument next door, a bell at the wrong hour).',
  },
  {
    id: 'MOOD_SWING',
    min: 7,
    max: 8,
    target: 'present-npc',
    directive:
      "{name}'s mood visibly shifts this scene — a significant change in tone or behavior, grounded in something they just saw, heard, or remembered.",
  },
  {
    id: 'GOSSIP_SURGE',
    min: 9,
    max: 10,
    target: 'offscreen-npc',
    directive:
      'A rumor involving {name} reaches an unintended ear this scene — secondhand, distorted at the edges, arriving by note, messenger, or overheard talk.',
  },
  {
    id: 'CHANCE_MEETING',
    min: 11,
    max: 12,
    target: 'offscreen-npc',
    directive:
      'Off-screen, {name} crosses paths with someone unexpected — reference it obliquely (a mention, a glimpse at a distance, a trace left behind); they do not enter the scene.',
  },
  {
    id: 'OVERHEARD_DETAIL',
    min: 13,
    max: 14,
    target: 'offscreen-npc',
    directive:
      '{name} learns something useful off-screen this turn — if the prose has a natural opening (a brief "meanwhile" aside or a later mention), plant it; otherwise let it pass.',
  },
  {
    id: 'TASK_SHIFT',
    min: 15,
    max: 16,
    target: 'offscreen-npc',
    directive:
      "{name}'s errand elsewhere finishes early or runs long — a small schedule ripple the scene can feel (an early return teased, a conspicuous absence).",
  },
  {
    id: 'MUNDANE_INTERRUPTION',
    min: 17,
    max: 18,
    target: null,
    directive:
      'A mundane interruption breaks the momentum logically — a knock, a cough, a door slamming, a call from another room.',
  },
  CALM_HIGH,
]

/** Duo table: ≤2 present NPCs, or no off-screen cast — ambient/intimate-scale events. */
export const DUO_TABLE: ReadonlyArray<WorldEventDef> = [
  CALM_LOW,
  {
    id: 'ENV_SHIFT',
    min: 3,
    max: 4,
    target: null,
    directive:
      'The environment shifts around the scene — lights flicker, a window rattles, a phone buzzes, the weather turns audibly.',
  },
  {
    id: 'MOOD_SWING',
    min: 5,
    max: 6,
    target: 'present-npc',
    directive:
      "{name}'s emotion pivots suddenly this scene — calm snapping, a quiet sadness surfacing — grounded in something real to them.",
  },
  {
    id: 'PHYSICAL_REACTION',
    min: 7,
    max: 8,
    target: null,
    directive:
      "Someone's body interrupts on its own schedule — a stomach growls, a shiver, hiccups, a limb gone to sleep. Awkward, realistic, human.",
  },
  {
    id: 'MEMORY_TRIGGER',
    min: 9,
    max: 10,
    target: null,
    directive:
      'A sensory cue — a smell, a photograph, a familiar pattern — triggers a brief, involuntary flashback for someone in the scene.',
  },
  {
    id: 'OBJECT_DISCOVERY',
    min: 11,
    max: 12,
    target: null,
    directive:
      'An unnoticed detail of this place becomes relevant — a drawer left open, an old stain, something that was always there and suddenly matters.',
  },
  {
    id: 'OUTSIDE_INTRUSION',
    min: 13,
    max: 14,
    target: null,
    directive:
      'The outside world intrudes at a distance — a car alarm, a shouting neighbor, rain starting, sirens passing. It stays outside.',
  },
  {
    id: 'POWER_SHIFT',
    min: 15,
    max: 16,
    target: 'present-npc',
    directive:
      '{name} pivots internally this scene — confidence cracking into vulnerability, or timidity hardening into nerve. Show it through action, not narration of the shift.',
  },
  {
    id: 'MUNDANE_INTERRUPTION',
    min: 17,
    max: 18,
    target: null,
    directive:
      'A mundane interruption arrives — a wrong-number call, a phone ringing, an ambient chirp — breaking the moment logically.',
  },
  CALM_HIGH,
]

/** Sparse frequency: the gate roll must land at or under this (of 20, ~35%). */
export const WORLDSIM_SPARSE_GATE = 7

/**
 * Any PRESENT tracked girl at/above this arousal suppresses the world event
 * (FF: "skip the d20 roll if NSFW scene is active"). beMode-only signal; for
 * non-BE stories the block's advisory framing is the fallback.
 */
export const WORLDSIM_SUPPRESS_AROUSAL = 70

// ---- E4 agendas ----

/** maxSteps clamp — an agenda resolves within a scene-week, never drags forever. */
export const AGENDA_MAX_STEPS = 6

/** [OFF-SCREEN] block line cap (priority: done > non-mundane > mundane). */
export const MAX_OFFSCREEN_LINES = 6

/** Classifier agenda proposals per turn cap. */
export const MAX_AGENDA_PROPOSALS = 6

/**
 * FF's mundane fallback pool ("eat, rest, patrol, study, wander") — the
 * deterministic backfill for agenda-less off-screen NPCs. maxSteps kept short
 * so mundane lives churn visibly.
 */
export const MUNDANE_GOALS: ReadonlyArray<{ goal: string; maxSteps: number }> = [
  // No maxSteps 1: a one-step mundane completes on its first tick and the
  // done-slot backfill would then write EVERY turn (review write-amp finding).
  { goal: 'getting a proper meal', maxSteps: 2 },
  { goal: 'catching up on rest', maxSteps: 2 },
  { goal: 'making their usual rounds', maxSteps: 2 },
  { goal: 'absorbed in study', maxSteps: 3 },
  { goal: 'running a small errand', maxSteps: 2 },
  { goal: 'tidying up at home', maxSteps: 2 },
  { goal: 'wandering with no particular aim', maxSteps: 2 },
  { goal: 'tending to daily duties', maxSteps: 3 },
]
