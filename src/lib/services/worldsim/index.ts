/**
 * World-liveliness engines (research/61 + 62, FF5.2 Phases 3–4):
 *   E3 — seeded world-sim events (stateless directive blocks)
 *   E4 — off-screen NPC agendas (metadata state + deterministic ticking)
 *   E2 — Chekhov's Gun narrative debt (story-scoped state on the self
 *        character's metadata, seeded firing, [CALLBACK] directives)
 *
 * Write path discipline: agenda metadata is written ONLY by the story store's
 * applyAgendaTurn pass, chekhov state ONLY by its applyChekhovTurn pass
 * (single writers, riding the same wrapUpdate/rollback machinery as
 * bodyState). Everything in this module is pure.
 */

export {
  AGENDA_KINDS,
  NPC_AGENDA_KEY,
  OFF_SCREEN_HEADER,
  agendaCompletionBondEvent,
  agendaCompletionLocation,
  buildOffScreenBlock,
  clearNpcAgenda,
  mundaneAgenda,
  readNpcAgenda,
  tickAgenda,
  writeNpcAgenda,
} from './agenda'
export type { AgendaKind, AgendaTickResult, NpcAgenda, OffScreenEntry } from './agenda'

export { WORLD_EVENT_HEADER, buildWorldEventBlock, rollWorldEvent } from './events'
export type { OffScreenNpc, WorldEvent, WorldEventInput } from './events'

export {
  agendaFromProposal,
  agendaProposalsFromResult,
  buildAgendaInstructions,
  extendClassificationSchemaWithAgendas,
} from './schema'
export type { AgendaProposal } from './schema'

export {
  EMPTY_TURN_DIRECTIVES,
  computeChekhovFire,
  computeTurnDirectives,
  isIntimacySuppressed,
  livingNonSelf,
} from './directives'
export type {
  ChekhovFireContext,
  ChekhovFireOutcome,
  DirectiveCharacter,
  TurnDirectiveInput,
  TurnDirectives,
} from './directives'

export {
  CALLBACK_HEADER,
  CHEKHOV_ID_PATTERN,
  CHEKHOV_STATE_KEY,
  EMPTY_CHEKHOV_STATE,
  advanceChekhovState,
  buildCallbackBlock,
  decideChekhovFire,
  effectiveThreshold,
  findSelfCharacter,
  readChekhovState,
  researchSeed,
  sanitizeDebtText,
  writeChekhovState,
} from './chekhov'
export type {
  BulletWeight,
  ChekhovAdvanceInput,
  ChekhovBullet,
  ChekhovFireInput,
  ChekhovFireResult,
  ChekhovLoad,
  ChekhovState,
} from './chekhov'

export {
  buildChekhovInstructions,
  CHEKHOV_MAX_RESOLVED_PER_TURN,
  extendClassificationSchemaWithChekhov,
  narrativeDebtFromResult,
  resolvedDebtsFromResult,
} from './chekhov-schema'
export type { NarrativeDebtProposal } from './chekhov-schema'

export {
  EMPTY_GM_NOTEBOOK,
  GM_NOTEBOOK_KEY,
  GM_NOTE_ID_PATTERN,
  GM_NOTE_KINDS,
  GM_NOTES_HEADER,
  advanceGmNotebook,
  buildGmNotesBlock,
  coerceNoteKind,
  readGmNotebook,
  writeGmNotebook,
} from './notebook'
export type {
  GmNote,
  GmNoteKind,
  GmNoteLoad,
  GmNotebookAdvanceInput,
  GmNotebookState,
} from './notebook'
export {
  GM_NOTES_MAX_DROPS_PER_TURN,
  buildGmNotesInstructions,
  extendClassificationSchemaWithGmNotes,
  gmNotesAddFromResult,
  gmNotesDropFromResult,
} from './notebook-schema'
export type { GmNoteProposal } from './notebook-schema'

export {
  AGENDA_MAX_STEPS,
  CALM_PLANT_DIRECTIVE,
  CHEKHOV_FIRE_COOLDOWN,
  CHEKHOV_MAX_AGE,
  CHEKHOV_MAX_BULLETS,
  CHEKHOV_MAX_FIRES,
  CHEKHOV_MAX_LOADS_PER_TURN,
  CHEKHOV_MIN_FIRE_AGE,
  CHEKHOV_OLD_AGE,
  CHEKHOV_REFRACTORY,
  DUO_TABLE,
  GM_NOTES_MAX,
  GM_NOTES_MAX_ADDS_PER_TURN,
  GM_NOTE_MAX_AGE,
  GM_NOTE_TEXT_MAX,
  MAX_AGENDA_PROPOSALS,
  MAX_OFFSCREEN_LINES,
  MUNDANE_GOALS,
  STANDARD_TABLE,
  WORLDSIM_SPARSE_GATE,
  WORLDSIM_SUPPRESS_AROUSAL,
} from './constants'
export type { WorldEventDef, WorldEventTableId, WorldEventTarget } from './constants'
