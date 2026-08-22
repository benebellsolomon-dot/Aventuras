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

// FF CALM plants a passive Chekhov seed (E2, research/62): with the chekhovGun
// setting on, directives.ts substitutes CALM_PLANT_DIRECTIVE; otherwise a CALM
// turn still renders no block. The empty directive here is the off-state.
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

// ---- E2 Chekhov's Gun (research/62) ----

/** FF's firing bases by weight: heavier debt fires easier. */
export const CHEKHOV_BASE_THRESHOLDS: Readonly<Record<1 | 2 | 3, number>> = { 1: 18, 2: 13, 3: 8 }

/** FF's 4-Age Minimum: a bullet must simmer before it may fire. */
export const CHEKHOV_MIN_FIRE_AGE = 4

/** Unlocked bullets die of old age here (FF prune rule). */
export const CHEKHOV_MAX_AGE = 12

/** Active-bullet capacity; over it, lowest-weight/oldest are evicted (FF cap). */
export const CHEKHOV_MAX_BULLETS = 20

/** Classifier narrative-debt loads accepted per turn (FF: "load 1-2 Bullets per turn"). */
export const CHEKHOV_MAX_LOADS_PER_TURN = 2

/** Fired-but-unresolved cooldown, in turns (FF: "VETO and reload into gun"). */
export const CHEKHOV_REFRACTORY = 2

/** Unresolved fires before a bullet retires silently (FF: "Pruned Bullets fire
 * silently") — bounds the identical-directive re-render loop. */
export const CHEKHOV_MAX_FIRES = 2

/** Turn-level cooldown after ANY fire — keeps callbacks an occasional beat
 * (~1 per 3 turns at saturation) instead of a metronome. D5 tunable. */
export const CHEKHOV_FIRE_COOLDOWN = 2

/** Bullets at/above this age jump the fire-priority queue — near-prune debt
 * gets its shot before heavy young debt monopolizes the slot. */
export const CHEKHOV_OLD_AGE = 8

/** Id counter ceiling — far above any real story; float-precision guard. */
export const CHEKHOV_NEXT_ID_MAX = 1_000_000

/** Threshold reduction when a subject character is on-scene (FF proximity mods, collapsed). */
export const CHEKHOV_SUBJECT_PROXIMITY_MOD = 2

/** Threshold reduction once a time lock has expired (FF urgency mod). */
export const CHEKHOV_URGENCY_MOD = 2

/** Effective threshold never drops below this — a natural 1 always fails,
 * which ports FF's "jam on Nat 1" without a separate jam state. */
export const CHEKHOV_THRESHOLD_FLOOR = 2

export const CHEKHOV_DESC_MAX = 160
export const CHEKHOV_SUBJECT_MAX = 40
export const CHEKHOV_MAX_SUBJECTS = 3

/** Time locks freeze a bullet for at most this many turns. */
export const CHEKHOV_LOCK_MAX = 12

/**
 * CALM's E2 half (FF: "Quiet moment; plant 1 passive environment Chekhov seed").
 * Rendered as the CALM [WORLD EVENT] directive only when chekhovGun is on; the
 * narrator plants the detail and the classifier's debt scan observes it — the
 * seed enters through the normal loading channel, never as LLM-authored state.
 */
// ---- E5 GM's Notebook (research/65) ----
/** Hard cap on live notes — FIFO-oldest drops beyond it. */
export const GM_NOTES_MAX = 16
/** A THREAD note (an open situation) nobody dropped for this many turns expires.
 * Reminders (facts) never expire on their own — a fact honored for 40 turns is
 * still a fact (review finding 3); they leave only by drop or eviction. */
export const GM_NOTE_MAX_AGE = 40
export const GM_NOTE_TEXT_MAX = 160
/** Two, not three: with a 16-note list, three adds a turn evicted load-bearing
 * notes within a handful of chatty turns (review finding 2). */
export const GM_NOTES_MAX_ADDS_PER_TURN = 2
/** Matches GM_NOTE_ID_PATTERN (n + up to 6 digits). */
export const GM_NOTE_NEXT_ID_MAX = 999_999

export const CALM_PLANT_DIRECTIVE =
  'A quiet beat. Plant one small, concrete environmental detail — an object out of place, a sound at the edge of hearing, a figure at a distance — that could matter later. Do not explain it or call attention to it.'
