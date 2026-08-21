/**
 * Pre-generation turn directives (research/61): the [OFF-SCREEN] and
 * [WORLD EVENT] user-prompt-tail blocks, computed between the check and
 * narrative phases from PERSISTED state only — last turn's classifier
 * presence, stored agendas, stored arousal. Pure and synchronous.
 *
 * Cache contract: both settings unset ⇒ both strings empty ⇒ the narrative
 * prompt is byte-identical to a build without this module.
 */

import {
  bondOf,
  normalizePresenceName,
  readBodyState,
  readScenePresence,
  recentPresenceUnion,
  type PresenceEntrySource,
} from '$lib/services/be'
import { buildOffScreenBlock, readNpcAgenda, type OffScreenEntry } from './agenda'
import { WORLDSIM_SUPPRESS_AROUSAL } from './constants'
import { buildWorldEventBlock, rollWorldEvent, type OffScreenNpc } from './events'

export interface TurnDirectives {
  offScreenBlock: string
  worldEventBlock: string
}

export const EMPTY_TURN_DIRECTIVES: TurnDirectives = { offScreenBlock: '', worldEventBlock: '' }

/** FF's own share-gate ("wants to share if BOND ≥ +3") — same scale post-research/60. */
const SHARE_BOND = 3

export interface DirectiveCharacter {
  name: string
  relationship: string | null
  /** 'active' | 'inactive' | 'deceased' — undefined/null reads as active. */
  status?: string | null
  metadata: Record<string, unknown> | null
}

export interface TurnDirectiveInput {
  storyId: string
  /** The user-action entry id — the pre-generation seed contract (CheckPhase's). */
  entryId: string
  settings:
    | { worldSimFrequency?: 'off' | 'sparse' | 'lively'; npcAgendas?: boolean }
    | null
    | undefined
  characters: ReadonlyArray<DirectiveCharacter>
  /** Visible story entries — presence is read from the last classified turn. */
  entries: ReadonlyArray<PresenceEntrySource>
}

export function computeTurnDirectives(input: TurnDirectiveInput): TurnDirectives {
  const frequency = input.settings?.worldSimFrequency
  const worldSimOn = frequency === 'sparse' || frequency === 'lively'
  const agendasOn = input.settings?.npcAgendas === true
  if (!worldSimOn && !agendasOn) return EMPTY_TURN_DIRECTIVES

  // The dead and the departed never run errands or get summoned by ENTER_CHECK
  // (review lens 3): only living, still-in-story, non-self characters count.
  const nonSelf = input.characters.filter(
    (c) => c.relationship !== 'self' && c.status !== 'deceased' && c.status !== 'inactive',
  )
  // Presence unknown (turn 1, classifier gap) → nobody is provably off-screen
  // and the NPC count is unknown: the world event degrades to the Duo table
  // (its events never invoke off-screen NPCs) and the off-screen block renders
  // nothing. Conservative on ignorance, like the rest of the presence stack.
  const presence = readScenePresence([...input.entries])
  // The ACTIVE-CAST bound (mirrors the store's ticking bound): a character who
  // drifted out of the recent-presence window stops rendering and stops being
  // an event target — a frozen "finished" agenda must not haunt the block
  // forever (review lens 1/2/3, all three found the ghost).
  const activeCast = recentPresenceUnion([...input.entries])
  const presentNpcs = presence
    ? nonSelf.filter((c) => presence.has(normalizePresenceName(c.name)))
    : []
  const offScreen = presence
    ? nonSelf.filter(
        (c) =>
          !presence.has(normalizePresenceName(c.name)) &&
          activeCast.has(normalizePresenceName(c.name)),
      )
    : []

  let worldEventBlock = ''
  let eventTargetName: string | undefined
  if (worldSimOn) {
    // FF: "skip the d20 roll if NSFW scene is active" — approximated by the
    // engine's own arousal state among PRESENT tracked girls (beMode signal;
    // non-BE stories rely on the block's advisory framing instead).
    const suppressed = presentNpcs.some((c) => {
      const state = readBodyState(c.metadata)
      return state?.arousal !== undefined && state.arousal >= WORLDSIM_SUPPRESS_AROUSAL
    })
    const offScreenNpcs: OffScreenNpc[] = offScreen.map((c) => ({
      name: c.name,
      agenda: readNpcAgenda(c.metadata),
    }))
    const event = rollWorldEvent({
      storyId: input.storyId,
      entryId: input.entryId,
      frequency,
      presentNpcNames: presentNpcs.map((c) => c.name),
      offScreenNpcs,
      suppressed,
    })
    if (event) {
      worldEventBlock = buildWorldEventBlock(event)
      // Only an ENTER_CHECK forces an entrance — dropping the target's line
      // for the other off-screen events (gossip, chance meeting, task shift)
      // would delete the very grounding their directive references (fix-diff
      // MEDIUM: the first cut over-suppressed).
      if (event.eventId === 'ENTER_CHECK') eventTargetName = event.targetName
    }
  }

  let offScreenBlock = ''
  if (agendasOn) {
    const entries: OffScreenEntry[] = []
    for (const character of offScreen) {
      // The world event owns its target this turn: rendering her [OFF-SCREEN]
      // line too would pit "never force an entrance" against ENTER_CHECK's
      // "have them arrive" in the same prompt (review lens 3).
      if (eventTargetName !== undefined && character.name === eventTargetName) continue
      const agenda = readNpcAgenda(character.metadata)
      if (!agenda) continue
      const state = readBodyState(character.metadata)
      entries.push({
        name: character.name,
        agenda,
        closeToHim: state !== null && bondOf(state) >= SHARE_BOND,
      })
    }
    offScreenBlock = buildOffScreenBlock(entries)
  }

  return { offScreenBlock, worldEventBlock }
}
