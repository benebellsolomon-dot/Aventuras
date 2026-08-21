import { describe, expect, it } from 'vitest'

import { seededRoll, writeBodyState, type BodyState } from '$lib/services/be'
import { defaultBodyState } from '$lib/services/be'
import { writeNpcAgenda, type NpcAgenda } from './agenda'
import { CALM_PLANT_DIRECTIVE, WORLDSIM_SUPPRESS_AROUSAL } from './constants'
import {
  CALLBACK_HEADER,
  writeChekhovState,
  type ChekhovBullet,
  type ChekhovState,
} from './chekhov'
import {
  EMPTY_TURN_DIRECTIVES,
  computeChekhovFire,
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
): DirectiveCharacter => ({ id: `id-${name}`, name, relationship, metadata, status })

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

// ---- E2 Chekhov (research/62) ----

const bullet = (overrides: Partial<ChekhovBullet> = {}): ChekhovBullet => ({
  id: 'c1',
  description: 'the locked drawer in the study',
  weight: 3,
  age: 5,
  subjects: [],
  ...overrides,
})

const chekhovState = (bullets: ChekhovBullet[]): ChekhovState => ({
  bullets,
  nextId: bullets.length + 1,
})

/** Entry id whose c1 fire roll passes a weight-3/age-5 threshold (roll ≥ 3)
 * and whose world event roll is NOT CALM (so blocks don't interact). */
function chekhovFiringEntryId(): string {
  for (let i = 0; i < 5000; i++) {
    const id = `e${i}`
    const worldRoll = seededRoll(`${STORY}:${id}:worldsim`)
    if (seededRoll(`${STORY}:${id}:chekhov:c1`) >= 3 && worldRoll > 2 && worldRoll < 19) return id
  }
  throw new Error('unreachable')
}

/** Entry id whose world event roll is CALM (1-2 or 19-20). */
function calmEntryId(): string {
  for (let i = 0; i < 5000; i++) {
    const id = `e${i}`
    const roll = seededRoll(`${STORY}:${id}:worldsim`)
    if (roll <= 2 || roll >= 19) return id
  }
  throw new Error('unreachable')
}

const withChekhov = (
  bullets: ChekhovBullet[],
  overrides: Partial<TurnDirectiveInput> = {},
): TurnDirectiveInput =>
  baseInput({
    settings: { worldSimFrequency: 'lively', npcAgendas: true, chekhovGun: true },
    characters: [
      character('Hero', writeChekhovState(null, chekhovState(bullets)), 'self'),
      character('Mira'),
      character('Nyssa'),
      character('Opal'),
      character('Petra', writeNpcAgenda(null, agenda())),
    ],
    ...overrides,
  })

describe('computeTurnDirectives — chekhov [CALLBACK]', () => {
  it('chekhov unset → callbackBlock empty and CALM renders nothing (byte-identity guard)', () => {
    const calm = computeTurnDirectives(baseInput({ entryId: calmEntryId() }))
    expect(calm.worldEventBlock).toBe('')
    expect(calm.callbackBlock).toBe('')
  })

  it('fires an eligible bullet into the [CALLBACK] block', () => {
    const result = computeTurnDirectives(
      withChekhov([bullet()], { entryId: chekhovFiringEntryId() }),
    )
    expect(result.callbackBlock.startsWith(CALLBACK_HEADER)).toBe(true)
    expect(result.callbackBlock).toContain('the locked drawer in the study')
  })

  it('an ineligible bullet (age < 4) never fires regardless of roll', () => {
    const result = computeTurnDirectives(
      withChekhov([bullet({ age: 3 })], { entryId: chekhovFiringEntryId() }),
    )
    expect(result.callbackBlock).toBe('')
  })

  it('intimacy suppression blocks the callback like it blocks world events', () => {
    const aroused: BodyState = { ...defaultBodyState(), arousal: WORLDSIM_SUPPRESS_AROUSAL }
    const result = computeTurnDirectives(
      withChekhov([bullet()], {
        entryId: chekhovFiringEntryId(),
        characters: [
          character('Hero', writeChekhovState(null, chekhovState([bullet()])), 'self'),
          character('Mira', writeBodyState(null, aroused)),
          character('Nyssa'),
          character('Opal'),
          character('Petra', writeNpcAgenda(null, agenda())),
        ],
      }),
    )
    expect(result.callbackBlock).toBe('')
  })

  it('CALM + chekhov on renders the plant directive as the world event', () => {
    const result = computeTurnDirectives(withChekhov([], { entryId: calmEntryId() }))
    expect(result.worldEventBlock).toContain(CALM_PLANT_DIRECTIVE)
  })

  it("a fired bullet's subjects drop out of the [OFF-SCREEN] block (no return-vs-never-force clash)", () => {
    // Petra is off-screen with an agenda AND the subject of the firing bullet:
    // "weave this back in as a return" and "never force an entrance" must not
    // name her in the same prompt (review lens 3, ENTER_CHECK lineage).
    const result = computeTurnDirectives(
      withChekhov([bullet({ subjects: ['Petra'] })], { entryId: chekhovFiringEntryId() }),
    )
    expect(result.callbackBlock).not.toBe('')
    expect(result.offScreenBlock).not.toContain('Petra')
  })

  it('a bullet whose every subject is dead or gone never fires', () => {
    const chars = withChekhov([bullet({ subjects: ['Petra'] })]).characters.map((c) =>
      c.name === 'Petra' ? { ...c, status: 'deceased' } : c,
    )
    const gone = computeTurnDirectives(
      withChekhov([bullet({ subjects: ['Petra'] })], {
        entryId: chekhovFiringEntryId(),
        characters: chars,
      }),
    )
    expect(gone.callbackBlock).toBe('')
    // A mixed-subject bullet still fires — one living anchor is enough.
    const mixedChars = withChekhov([bullet({ subjects: ['Petra', 'Mira'] })]).characters.map((c) =>
      c.name === 'Petra' ? { ...c, status: 'deceased' } : c,
    )
    const mixed = computeTurnDirectives(
      withChekhov([], { entryId: chekhovFiringEntryId(), characters: mixedChars }),
    )
    expect(mixed.callbackBlock).not.toBe('')
  })

  it('the turn-level cooldown suppresses firing', () => {
    const coolState: ChekhovState = { ...chekhovState([bullet()]), cooldown: 2 }
    const result = computeTurnDirectives(
      withChekhov([], {
        entryId: chekhovFiringEntryId(),
        characters: [
          character('Hero', writeChekhovState(null, coolState), 'self'),
          character('Mira'),
          character('Nyssa'),
          character('Opal'),
          character('Petra', writeNpcAgenda(null, agenda())),
        ],
      }),
    )
    expect(result.callbackBlock).toBe('')
  })

  it('computeChekhovFire is deterministic and identical across repeated calls (two-site contract)', () => {
    const input = {
      storyId: STORY,
      userActionEntryId: chekhovFiringEntryId(),
      characters: withChekhov([bullet()]).characters,
      entries: withChekhov([bullet()]).entries,
    }
    const first = computeChekhovFire(input)
    const second = computeChekhovFire(input)
    expect(first.result?.bullet.id).toBe('c1')
    expect(second).toEqual(first)
  })
})
