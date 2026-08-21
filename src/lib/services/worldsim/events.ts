/**
 * E3 — World Sim (research/61, FF5.2 World Sim port).
 *
 * Stateless by design: the event for a turn is a pure function of
 * (storyId, userAction entryId, settings, last-known presence, cast) —
 * recomputable, replay-stable, zero persistence. Seed contract mirrors
 * CheckPhase: the PRE-generation user-action entry id, so a regenerate keeps
 * the same event and a retried turn re-rolls, exactly like checks.
 */

import { seededRoll } from '$lib/services/be'
import { byCodepoint, type NpcAgenda } from './agenda'
import {
  DUO_TABLE,
  STANDARD_TABLE,
  WORLDSIM_SPARSE_GATE,
  type WorldEventDef,
  type WorldEventTableId,
} from './constants'

export interface OffScreenNpc {
  name: string
  agenda: NpcAgenda | null
}

export interface WorldEventInput {
  storyId: string
  /** The user-action entry id (pre-generation; the CheckPhase seed contract). */
  entryId: string
  frequency: 'off' | 'sparse' | 'lively' | undefined
  /** Present NPCs (presence signal ∩ non-self cast). Presence-unknown → pass []. */
  presentNpcNames: ReadonlyArray<string>
  /** Non-self cast minus present. Presence-unknown → pass [] (forces Duo). */
  offScreenNpcs: ReadonlyArray<OffScreenNpc>
  /** Intimate-scene suppression (computed by the caller from arousal state). */
  suppressed: boolean
}

export interface WorldEvent {
  tableId: WorldEventTableId
  roll: number
  eventId: string
  /** Fully rendered directive ({name} substituted). */
  directive: string
  /** The picked NPC, when the event targets one — lets the [OFF-SCREEN] block
   * drop that character's line so the two blocks never contradict each other. */
  targetName?: string
}

function eventForRoll(table: ReadonlyArray<WorldEventDef>, roll: number): WorldEventDef | null {
  return table.find((def) => roll >= def.min && roll <= def.max) ?? null
}

/** Seeded pick from a codepoint-sorted copy — neither input order nor the
 * runtime's ICU collation can change the pick (replay contract). */
function pickName(names: ReadonlyArray<string>, seed: string): string {
  const sorted = [...names].sort(byCodepoint)
  return sorted[(seededRoll(seed) - 1) % sorted.length]
}

/**
 * Roll this turn's world event. Null = no roll happened or the event degraded
 * (off, suppressed, sparse-gated, or an event whose target pool is empty — a
 * MOOD_SWING with nobody on-scene degrades to a quiet turn rather than
 * inventing a target). A true CALM band roll returns the event with an empty
 * directive: it renders nothing by itself, but E2 (research/62) distinguishes
 * FF's "quiet moment" — which plants a Chekhov seed — from a mere degrade.
 */
export function rollWorldEvent(input: WorldEventInput): WorldEvent | null {
  if (input.frequency !== 'sparse' && input.frequency !== 'lively') return null
  if (input.suppressed) return null

  const base = `${input.storyId}:${input.entryId}:worldsim`
  // Separate gate seed: sparse and lively agree on WHICH event a turn would
  // produce — the setting only decides whether it fires.
  if (input.frequency === 'sparse' && seededRoll(`${base}:gate`) > WORLDSIM_SPARSE_GATE) {
    return null
  }

  // Task ruling (research/61): table selection from the classifier presence
  // count. Duo when ≤2 present NPCs or no off-screen cast — Duo events never
  // invoke off-screen NPCs, so the presence-unknown degrade ([] in, Duo out)
  // is safe.
  const useStandard = input.presentNpcNames.length >= 3 && input.offScreenNpcs.length > 0
  const tableId: WorldEventTableId = useStandard ? 'standard' : 'duo'
  const table = useStandard ? STANDARD_TABLE : DUO_TABLE

  const roll = seededRoll(base)
  const def = eventForRoll(table, roll)
  if (!def) return null // table gap — impossible by construction
  if (def.id === 'CALM') return { tableId, roll, eventId: 'CALM', directive: '' }

  let directive = def.directive
  let targetName: string | undefined
  if (def.target === 'present-npc') {
    if (input.presentNpcNames.length === 0) return null
    targetName = pickName(input.presentNpcNames, `${base}:npc`)
    directive = directive.replaceAll('{name}', targetName)
  } else if (def.target === 'offscreen-npc') {
    if (input.offScreenNpcs.length === 0) return null
    // ENTER_CHECK prefers an NPC whose travel agenda just completed (the FF
    // coupling: travel completion "may trigger Enter_Check next scene").
    const arrivals =
      def.id === 'ENTER_CHECK'
        ? input.offScreenNpcs.filter((npc) => npc.agenda?.done && npc.agenda.kind === 'travel')
        : []
    const pool = (arrivals.length > 0 ? arrivals : input.offScreenNpcs).map((npc) => npc.name)
    targetName = pickName(pool, `${base}:npc`)
    directive = directive.replaceAll('{name}', targetName)
  }

  return { tableId, roll, eventId: def.id, directive, ...(targetName ? { targetName } : {}) }
}

export const WORLD_EVENT_HEADER = '[WORLD EVENT — background texture, advisory]'

/** Render the one-turn directive block. */
export function buildWorldEventBlock(event: WorldEvent): string {
  return `${WORLD_EVENT_HEADER}
${event.directive}
Weave it in naturally as background texture. Keep it secondary to the player's action and the scene's momentum — never let it derail the current beat. If it cannot fit this beat, let it pass unremarked.`
}
