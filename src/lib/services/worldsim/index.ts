/**
 * World-liveliness engines (research/61, FF5.2 Phase 3):
 *   E3 — seeded world-sim events (stateless directive blocks)
 *   E4 — off-screen NPC agendas (metadata state + deterministic ticking)
 *
 * Write path discipline: agenda metadata is written ONLY by the story store's
 * applyAgendaTurn pass (single writer, rides the same wrapUpdate/rollback
 * machinery as bodyState). Everything in this module is pure.
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

export { EMPTY_TURN_DIRECTIVES, computeTurnDirectives } from './directives'
export type { DirectiveCharacter, TurnDirectiveInput, TurnDirectives } from './directives'

export {
  AGENDA_MAX_STEPS,
  DUO_TABLE,
  MAX_AGENDA_PROPOSALS,
  MAX_OFFSCREEN_LINES,
  MUNDANE_GOALS,
  STANDARD_TABLE,
  WORLDSIM_SPARSE_GATE,
  WORLDSIM_SUPPRESS_AROUSAL,
} from './constants'
export type { WorldEventDef, WorldEventTableId, WorldEventTarget } from './constants'
