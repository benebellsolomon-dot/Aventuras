import { describe, expect, it } from 'vitest'

import { seededRoll, writeBodyState, type BodyState } from '$lib/services/be'
import { defaultBodyState } from '$lib/services/be'
import { writeNpcAgenda, type NpcAgenda } from './agenda'
import { WORLDSIM_SUPPRESS_AROUSAL } from './constants'
import {
  EMPTY_TURN_DIRECTIVES,
  computeTurnDirectives,
  type DirectiveCharacter,
  type TurnDirectiveInput,
} from './directives'
import { OFF_SCREEN_HEADER } from './agenda'
import { WORLD_EVENT_HEADER } from './events'

const STORY = 's1'

/** Entry id whose event roll is guaranteed non-CALM on either table (roll 9). */
function firingEntryId(): string {
  for (let i = 0; i < 5000; i++) {
    if (seededRoll(`${STORY}:e${i}:worldsim`) === 9) return `e${i}`
  }
  throw new Error('unreachable')
}

const FIRING = firingEntryId()

const character = (
  name: string,
  metadata: Record<string, unknown> | null = null,
  relationship: string | null = 'ally',
  status: string | null = 'active',
): DirectiveCharacter => ({ name, relationship, metadata, status })

const presenceEntry = (names: string[]) => ({
  type: 'narration',
  worldStateDelta: { classificationResult: { scene: { presentCharacterNames: names } } },
})

const agenda = (overrides: Partial<NpcAgenda> = {}): NpcAgenda => ({
  goal: 'making their usual rounds',
  kind: 'mundane',
  step: 1,
  maxSteps: 3,
  ...overrides,
})

// Petra appears in an older presence entry (the active-cast window) but not
// the most recent one — off-screen, in orbit.
const baseInput = (overrides: Partial<TurnDirectiveInput> = {}): TurnDirectiveInput => ({
  storyId: STORY,
  entryId: FIRING,
  settings: { worldSimFrequency: 'lively', npcAgendas: true },
  characters: [
    character('Hero', null, 'self'),
    character('Mira'),
    character('Nyssa'),
    character('Opal'),
    character('Petra', writeNpcAgenda(null, agenda())),
  ],
  entries: [
    presenceEntry(['Mira', 'Nyssa', 'Opal', 'Petra']),
    presenceEntry(['Mira', 'Nyssa', 'Opal']),
  ],
  ...overrides,
})

describe('computeTurnDirectives', () => {
  it('both settings unset → both blocks empty (byte-identity guard)', () => {
    expect(computeTurnDirectives(baseInput({ settings: {} }))).toEqual(EMPTY_TURN_DIRECTIVES)
    expect(computeTurnDirectives(baseInput({ settings: undefined }))).toEqual(EMPTY_TURN_DIRECTIVES)
    expect(computeTurnDirectives(baseInput({ settings: { worldSimFrequency: 'off' } }))).toEqual(
      EMPTY_TURN_DIRECTIVES,
    )
  })

  it('renders the world event block from last-known presence (standard table: 3 present + off-screen)', () => {
    const { worldEventBlock } = computeTurnDirectives(baseInput())
    expect(worldEventBlock.startsWith(WORLD_EVENT_HEADER)).toBe(true)
  })

  it('presence unknown → duo degrade and no off-screen block', () => {
    const result = computeTurnDirectives(baseInput({ entries: [] }))
    // Roll 9 on duo is MEMORY_TRIGGER (no target) — still fires, ambient only.
    expect(result.worldEventBlock).toContain('sensory cue')
    expect(result.offScreenBlock).toBe('')
  })

  it('suppresses the world event when a PRESENT girl is at high arousal', () => {
    const aroused: BodyState = { ...defaultBodyState(), arousal: WORLDSIM_SUPPRESS_AROUSAL }
    const input = baseInput({
      characters: [
        character('Hero', null, 'self'),
        character('Mira', writeBodyState(null, aroused)),
        character('Nyssa'),
        character('Opal'),
        character('Petra', writeNpcAgenda(null, agenda())),
      ],
    })
    expect(computeTurnDirectives(input).worldEventBlock).toBe('')
    // The same arousal OFF-screen does not suppress.
    const offScreenAroused = baseInput({
      characters: [
        character('Hero', null, 'self'),
        character('Mira'),
        character('Nyssa'),
        character('Opal'),
        character('Petra', writeBodyState(writeNpcAgenda(null, agenda()), aroused)),
      ],
    })
    expect(computeTurnDirectives(offScreenAroused).worldEventBlock).not.toBe('')
  })

  it('renders the off-screen block for off-screen characters with agendas only', () => {
    // Agendas alone (world sim off) — no event target can drop Petra's line.
    const { offScreenBlock } = computeTurnDirectives(baseInput({ settings: { npcAgendas: true } }))
    expect(offScreenBlock.startsWith(OFF_SCREEN_HEADER)).toBe(true)
    expect(offScreenBlock).toContain('Petra')
    // Present girls and agenda-less off-screen girls do not appear.
    expect(offScreenBlock).not.toContain('Mira')
  })

  it('excludes the protagonist from both cast pools', () => {
    // A "present" list of only the protagonist → zero present NPCs → duo table.
    const input = baseInput({
      entries: [presenceEntry(['Hero'])],
      characters: [character('Hero', writeNpcAgenda(null, agenda()), 'self'), character('Mira')],
    })
    const result = computeTurnDirectives(input)
    // The protagonist's (nonsensical) agenda never renders.
    expect(result.offScreenBlock).not.toContain('Hero')
  })

  it('a character outside the recent-presence window drops out of the block (no immortal ghosts)', () => {
    const input = baseInput({
      // The active-cast window no longer contains Petra.
      entries: [presenceEntry(['Mira', 'Nyssa', 'Opal'])],
      characters: [
        character('Hero', null, 'self'),
        character('Mira'),
        character('Nyssa'),
        character('Opal'),
        character('Petra', writeNpcAgenda(null, agenda({ step: 3, done: true, kind: 'research' }))),
      ],
    })
    expect(computeTurnDirectives(input).offScreenBlock).toBe('')
  })

  it('deceased and inactive characters are excluded from both blocks', () => {
    const input = baseInput({
      characters: [
        character('Hero', null, 'self'),
        character('Mira'),
        character('Nyssa'),
        character('Opal'),
        character('Petra', writeNpcAgenda(null, agenda()), 'ally', 'deceased'),
      ],
    })
    const result = computeTurnDirectives(input)
    expect(result.offScreenBlock).toBe('')
    expect(result.worldEventBlock).not.toContain('Petra')
  })

  it("ENTER_CHECK's target is dropped from the off-screen block; other targeted events keep the line", () => {
    // baseInput's FIRING rolls 9 = GOSSIP_SURGE on standard — targets Petra
    // (sole off-screen NPC) but she does NOT enter, so her line is the
    // grounding and stays.
    const gossip = computeTurnDirectives(baseInput())
    expect(gossip.worldEventBlock).toContain('Petra')
    expect(gossip.offScreenBlock).toContain('Petra')

    // Roll 3 = ENTER_CHECK — the event forces her entrance, so the
    // "never force an entrance" off-screen line must not contradict it.
    let enterId = ''
    for (let i = 0; i < 5000; i++) {
      if (seededRoll(`${STORY}:e${i}:worldsim`) === 3) {
        enterId = `e${i}`
        break
      }
    }
    const enter = computeTurnDirectives(baseInput({ entryId: enterId }))
    expect(enter.worldEventBlock).toContain('Petra')
    expect(enter.offScreenBlock).not.toContain('Petra')
  })
})
