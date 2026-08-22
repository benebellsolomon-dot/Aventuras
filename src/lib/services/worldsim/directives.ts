/**
 * Pre-generation turn directives (research/61 + 62): the [OFF-SCREEN],
 * [WORLD EVENT], and [CALLBACK] user-prompt-tail blocks, computed between the
 * check and narrative phases from PERSISTED state only — last turn's
 * classifier presence, stored agendas, stored bullets, stored arousal. Pure
 * and synchronous.
 *
 * Cache contract: all settings unset ⇒ all strings empty ⇒ the narrative
 * prompt is byte-identical to a build without this module.
 *
 * `computeChekhovFire` is exported as THE fire derivation for both sites —
 * here (render the block) and the store's applyChekhovTurn (mark the outcome).
 * One function, two call sites, so the decisions provably agree (the
 * research/61 presence-derivation lesson, designed in).
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
import {
  buildCallbackBlock,
  decideChekhovFire,
  findSelfCharacter,
  readChekhovState,
  type ChekhovFireResult,
  type ChekhovState,
} from './chekhov'
import { CALM_PLANT_DIRECTIVE, WORLDSIM_SUPPRESS_AROUSAL } from './constants'
import { buildWorldEventBlock, rollWorldEvent, type OffScreenNpc } from './events'
import { buildGmNotesBlock, readGmNotebook } from './notebook'

export interface TurnDirectives {
  offScreenBlock: string
  worldEventBlock: string
  callbackBlock: string
  /** E5 (research/65): the GM's Notebook continuity block — renders FIRST in the tail. */
  gmNotesBlock: string
}

export const EMPTY_TURN_DIRECTIVES: TurnDirectives = {
  offScreenBlock: '',
  worldEventBlock: '',
  callbackBlock: '',
  gmNotesBlock: '',
}

/** FF's own share-gate ("wants to share if BOND ≥ +3") — same scale post-research/60. */
const SHARE_BOND = 3

export interface DirectiveCharacter {
  id: string
  name: string
  relationship: string | null
  /** 'active' | 'inactive' | 'deceased' — undefined/null reads as active. */
  status?: string | null
  metadata: Record<string, unknown> | null
}

/** The dead and the departed never run errands or get summoned: only living,
 * still-in-story, non-self characters count as world-sim actors. */
export function livingNonSelf<T extends DirectiveCharacter>(characters: ReadonlyArray<T>): T[] {
  return characters.filter(
    (c) => c.relationship !== 'self' && c.status !== 'deceased' && c.status !== 'inactive',
  )
}

const isGone = (c: DirectiveCharacter): boolean =>
  c.status === 'deceased' || c.status === 'inactive'

/** FF: "skip the d20 roll if NSFW scene is active" — approximated by the
 * engine's own arousal state among PRESENT tracked girls (beMode signal;
 * non-BE stories rely on the blocks' advisory framing instead). */
export function isIntimacySuppressed(
  presentNpcs: ReadonlyArray<{ metadata: Record<string, unknown> | null }>,
): boolean {
  return presentNpcs.some((c) => {
    const state = readBodyState(c.metadata)
    return state?.arousal !== undefined && state.arousal >= WORLDSIM_SUPPRESS_AROUSAL
  })
}

export interface ChekhovFireContext {
  storyId: string
  /** The user-action entry id — the pre-generation seed contract (CheckPhase's). */
  userActionEntryId: string
  /** PRE-TURN characters (the store passes its captured pre-write snapshot). */
  characters: ReadonlyArray<DirectiveCharacter>
  /** Entries up to and including the user action — the store slices strictly
   * before this turn's narration entry to reproduce the pipeline's view. */
  entries: ReadonlyArray<PresenceEntrySource>
}

export interface ChekhovFireOutcome {
  /** Null when there is no self character or no readable state. */
  state: ChekhovState | null
  result: ChekhovFireResult | null
}

/**
 * The turn's Chekhov fire decision, derived from persisted, entry-stable
 * inputs only. Both call sites (render + mark) MUST go through this function.
 *
 * Known residual window (accepted, research/62 §Review outcome): the store's
 * `characters` snapshot is taken at classification-apply time, ~one generation
 * later than the pipeline's — a character or settings edit landing DURING
 * generation can shift the mark relative to the render. Bounded consequence:
 * a wrong refractory mark on one bullet.
 */
export function computeChekhovFire(input: ChekhovFireContext): ChekhovFireOutcome {
  const self = findSelfCharacter(input.characters)
  const state = self ? readChekhovState(self.metadata) : null
  if (!state || state.bullets.length === 0) return { state, result: null }
  const presence = readScenePresence([...input.entries])
  const nonSelf = livingNonSelf(input.characters)
  const presentNpcs = presence
    ? nonSelf.filter((c) => presence.has(normalizePresenceName(c.name)))
    : []
  // A bullet whose every subject is deceased or gone-from-story never fires —
  // "weave this back in as a return" about the dead is a contradiction the
  // narrator shouldn't have to veto (review lens 3). Subject-less environment
  // bullets are unaffected.
  const gone = new Set(input.characters.filter(isGone).map((c) => normalizePresenceName(c.name)))
  const bullets = state.bullets.filter(
    (b) => b.subjects.length === 0 || b.subjects.some((s) => !gone.has(normalizePresenceName(s))),
  )
  const result = decideChekhovFire({
    storyId: input.storyId,
    userActionEntryId: input.userActionEntryId,
    bullets,
    // Proximity counts LIVING NON-SELF presence only: the protagonist is
    // always on-scene, so raw presence would hand every protagonist-tagged
    // bullet a permanent −2 (review lens 3).
    presentNames: presence ? new Set(presentNpcs.map((c) => normalizePresenceName(c.name))) : null,
    suppressed: isIntimacySuppressed(presentNpcs),
    ...(state.cooldown !== undefined ? { cooldown: state.cooldown } : {}),
  })
  return { state, result }
}

export interface TurnDirectiveInput {
  storyId: string
  /** The user-action entry id — the pre-generation seed contract (CheckPhase's). */
  entryId: string
  settings:
    | {
        worldSimFrequency?: 'off' | 'sparse' | 'lively'
        npcAgendas?: boolean
        chekhovGun?: boolean
        gmNotebook?: boolean
      }
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
  // The engine needs a host: without a self character nothing tracks what a
  // CALM plant produces, so the setting alone must not emit directives
  // (fix-diff round — the classifier extension is gated the same way).
  const chekhovOn =
    input.settings?.chekhovGun === true && findSelfCharacter(input.characters) !== null
  // E5: same host rule — the notebook lives on the self character.
  const notebookSelf =
    input.settings?.gmNotebook === true ? findSelfCharacter(input.characters) : null
  if (!worldSimOn && !agendasOn && !chekhovOn && notebookSelf === null) return EMPTY_TURN_DIRECTIVES

  const gmNotesBlock = notebookSelf
    ? buildGmNotesBlock(readGmNotebook(notebookSelf.metadata)?.notes ?? [])
    : ''
  if (!worldSimOn && !agendasOn && !chekhovOn) return { ...EMPTY_TURN_DIRECTIVES, gmNotesBlock }

  const nonSelf = livingNonSelf(input.characters)
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
    const suppressed = isIntimacySuppressed(presentNpcs)
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
    if (event && event.eventId === 'CALM') {
      // CALM's E2 half (research/62): FF's "quiet moment" plants a passive
      // environment seed. Only with the chekhov engine on — otherwise CALM
      // stays the absence of a block, exactly as before.
      if (chekhovOn) {
        worldEventBlock = buildWorldEventBlock({ ...event, directive: CALM_PLANT_DIRECTIVE })
      }
    } else if (event) {
      worldEventBlock = buildWorldEventBlock(event)
      // Only an ENTER_CHECK forces an entrance — dropping the target's line
      // for the other off-screen events (gossip, chance meeting, task shift)
      // would delete the very grounding their directive references (fix-diff
      // MEDIUM: the first cut over-suppressed).
      if (event.eventId === 'ENTER_CHECK') eventTargetName = event.targetName
    }
  }

  let callbackBlock = ''
  // Normalized subjects of the fired bullet — their [OFF-SCREEN] lines are
  // dropped below, exactly like the ENTER_CHECK target: "never force an
  // entrance" and "weave this back in as a return" must not name the same
  // character in one prompt (review lens 3).
  const callbackSubjects = new Set<string>()
  if (chekhovOn) {
    const fire = computeChekhovFire({
      storyId: input.storyId,
      userActionEntryId: input.entryId,
      characters: input.characters,
      entries: input.entries,
    })
    if (fire.result) {
      callbackBlock = buildCallbackBlock(fire.result.bullet)
      for (const subject of fire.result.bullet.subjects) {
        callbackSubjects.add(normalizePresenceName(subject))
      }
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
      if (callbackSubjects.has(normalizePresenceName(character.name))) continue
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

  return { offScreenBlock, worldEventBlock, callbackBlock, gmNotesBlock }
}
