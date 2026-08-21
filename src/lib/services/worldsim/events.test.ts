import { describe, expect, it } from 'vitest'

import { seededRoll } from '$lib/services/be'
import type { NpcAgenda } from './agenda'
import { DUO_TABLE, STANDARD_TABLE, WORLDSIM_SPARSE_GATE } from './constants'
import {
  WORLD_EVENT_HEADER,
  buildWorldEventBlock,
  rollWorldEvent,
  type WorldEventInput,
} from './events'

const STORY = 's1'

/** Scan for an entry id whose event roll lands exactly on `target`. */
function entryIdForRoll(target: number, alsoGate?: 'pass' | 'fail'): string {
  for (let i = 0; i < 5000; i++) {
    const id = `e${i}`
    if (seededRoll(`${STORY}:${id}:worldsim`) !== target) continue
    if (alsoGate) {
      const gate = seededRoll(`${STORY}:${id}:worldsim:gate`)
      if (alsoGate === 'pass' && gate > WORLDSIM_SPARSE_GATE) continue
      if (alsoGate === 'fail' && gate <= WORLDSIM_SPARSE_GATE) continue
    }
    return id
  }
  throw new Error(`no entry id found for roll ${target}`)
}

const baseInput = (overrides: Partial<WorldEventInput> = {}): WorldEventInput => ({
  storyId: STORY,
  entryId: 'e1',
  frequency: 'lively',
  presentNpcNames: ['Mira', 'Nyssa', 'Opal'],
  offScreenNpcs: [{ name: 'Petra', agenda: null }],
  suppressed: false,
  ...overrides,
})

const agenda = (overrides: Partial<NpcAgenda> = {}): NpcAgenda => ({
  goal: 'a long journey',
  kind: 'travel',
  step: 2,
  maxSteps: 2,
  done: true,
  destination: 'the harbor',
  ...overrides,
})

describe('event tables', () => {
  it.each([
    ['standard', STANDARD_TABLE],
    ['duo', DUO_TABLE],
  ] as const)('%s table tiles every roll 1-20 exactly once', (_name, table) => {
    for (let roll = 1; roll <= 20; roll++) {
      const matches = table.filter((def) => roll >= def.min && roll <= def.max)
      expect(matches).toHaveLength(1)
    }
  })

  it('CALM sits at both extremes on both tables (FF layout)', () => {
    for (const table of [STANDARD_TABLE, DUO_TABLE]) {
      expect(table.find((d) => d.min === 1 && d.max === 2)?.id).toBe('CALM')
      expect(table.find((d) => d.min === 19 && d.max === 20)?.id).toBe('CALM')
    }
  })
})

describe('rollWorldEvent — gating', () => {
  it('is null when frequency is off or unset', () => {
    expect(rollWorldEvent(baseInput({ frequency: undefined }))).toBeNull()
    expect(rollWorldEvent(baseInput({ frequency: 'off' }))).toBeNull()
  })

  it('is null when suppressed (intimate scene)', () => {
    expect(rollWorldEvent(baseInput({ suppressed: true, entryId: entryIdForRoll(5) }))).toBeNull()
  })

  it('sparse fires only when the gate roll passes, and produces the SAME event lively would', () => {
    const firing = entryIdForRoll(5, 'pass')
    const gated = entryIdForRoll(5, 'fail')

    const sparse = rollWorldEvent(baseInput({ frequency: 'sparse', entryId: firing }))
    const lively = rollWorldEvent(baseInput({ frequency: 'lively', entryId: firing }))
    expect(sparse).not.toBeNull()
    expect(sparse).toEqual(lively)

    expect(rollWorldEvent(baseInput({ frequency: 'sparse', entryId: gated }))).toBeNull()
    expect(rollWorldEvent(baseInput({ frequency: 'lively', entryId: gated }))).not.toBeNull()
  })

  it('is deterministic: same input, same event', () => {
    const input = baseInput({ entryId: entryIdForRoll(9) })
    expect(rollWorldEvent(input)).toEqual(rollWorldEvent(input))
  })

  it('CALM rolls return the CALM event with an empty directive (E2 needs to tell CALM from a degrade)', () => {
    for (const roll of [1, 20]) {
      const event = rollWorldEvent(baseInput({ entryId: entryIdForRoll(roll) }))
      expect(event?.eventId).toBe('CALM')
      expect(event?.directive).toBe('')
    }
  })
})

describe('rollWorldEvent — table selection', () => {
  const rollOf = (input: WorldEventInput) => rollWorldEvent(input)?.tableId

  it('standard needs 3+ present NPCs AND an off-screen cast', () => {
    const entryId = entryIdForRoll(9)
    expect(rollOf(baseInput({ entryId }))).toBe('standard')
    expect(rollOf(baseInput({ entryId, presentNpcNames: ['Mira', 'Nyssa'] }))).toBe('duo')
    expect(rollOf(baseInput({ entryId, offScreenNpcs: [] }))).toBe('duo')
  })

  it('presence-unknown degrade: empty lists select duo', () => {
    // Roll 9-10 is MEMORY_TRIGGER on duo (target: none) — fires even with
    // nobody known on-scene.
    const event = rollWorldEvent(
      baseInput({ entryId: entryIdForRoll(9), presentNpcNames: [], offScreenNpcs: [] }),
    )
    expect(event?.tableId).toBe('duo')
    expect(event?.eventId).toBe('MEMORY_TRIGGER')
  })
})

describe('rollWorldEvent — NPC targeting', () => {
  it('substitutes a present NPC into present-npc events, deterministically', () => {
    // Standard 7-8 = MOOD_SWING (present-npc).
    const input = baseInput({ entryId: entryIdForRoll(7) })
    const event = rollWorldEvent(input)
    expect(event?.eventId).toBe('MOOD_SWING')
    expect(event?.directive).not.toContain('{name}')
    const named = input.presentNpcNames.filter((n) => event?.directive.includes(n))
    expect(named).toHaveLength(1)
    expect(rollWorldEvent(input)?.directive).toBe(event?.directive)
  })

  it('degrades a present-npc event to a quiet turn when nobody is on-scene', () => {
    // Duo 5-6 = MOOD_SWING; solo scene (no present NPCs) has no target.
    const event = rollWorldEvent(
      baseInput({ entryId: entryIdForRoll(5), presentNpcNames: [], offScreenNpcs: [] }),
    )
    expect(event).toBeNull()
  })

  it('ENTER_CHECK prefers an off-screen NPC whose travel agenda just completed', () => {
    // Standard 3-4 = ENTER_CHECK.
    const input = baseInput({
      entryId: entryIdForRoll(3),
      offScreenNpcs: [
        { name: 'Petra', agenda: null },
        { name: 'Quill', agenda: agenda() }, // done travel — the arrival
        { name: 'Runa', agenda: agenda({ kind: 'research' }) },
      ],
    })
    const event = rollWorldEvent(input)
    expect(event?.eventId).toBe('ENTER_CHECK')
    expect(event?.directive).toContain('Quill')
  })

  it('ENTER_CHECK falls back to any off-screen NPC when no travel arrival exists', () => {
    const input = baseInput({
      entryId: entryIdForRoll(3),
      offScreenNpcs: [{ name: 'Petra', agenda: null }],
    })
    expect(rollWorldEvent(input)?.directive).toContain('Petra')
  })
})

describe('buildWorldEventBlock', () => {
  it('renders the fixed header, the directive, and the advisory framing', () => {
    const event = rollWorldEvent(baseInput({ entryId: entryIdForRoll(17) }))
    expect(event).not.toBeNull()
    const block = buildWorldEventBlock(event!)
    expect(block.startsWith(WORLD_EVENT_HEADER)).toBe(true)
    expect(block).toContain(event!.directive)
    expect(block).toContain('let it pass unremarked')
  })
})
