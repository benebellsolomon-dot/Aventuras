import { describe, expect, it, vi } from 'vitest'

import { seededRoll } from '$lib/services/be'
import { defaultRpgSheet, writeRpgSheet, type CheckRecord } from '$lib/services/rpg'
import { CheckPhase } from './CheckPhase'
import type { GenerationContext } from '../types'

type ContextCharacter = GenerationContext['worldState']['characters'][number]

function makeContext(overrides: {
  beMode?: boolean
  hasProtagonist?: boolean
  content?: string
  rawInput?: string
  /** Extra non-protagonist rows, so target resolution has something to find. */
  girls?: string[]
}): GenerationContext {
  const { beMode = true, hasProtagonist = true, content = 'Sneak past the guards' } = overrides
  const girls = (overrides.girls ?? []).map(
    (name) =>
      ({ id: `char-${name.toLowerCase()}`, name, relationship: 'ally' }) as ContextCharacter,
  )
  return {
    story: { id: 'story-1', settings: { beMode } } as unknown as GenerationContext['story'],
    visibleEntries: [],
    allEntries: [],
    worldState: {
      characters: hasProtagonist
        ? [
            {
              name: 'Ben',
              relationship: 'self',
              metadata: writeRpgSheet(null, defaultRpgSheet()),
            } as unknown as ContextCharacter,
            ...girls,
          ]
        : [...girls],
      locations: [],
      items: [],
      storyBeats: [],
      chapters: [],
      memoryConfig: {} as GenerationContext['worldState']['memoryConfig'],
      lorebookEntries: [],
    },
    userAction: { entryId: 'entry-9', content, rawInput: overrides.rawInput ?? content },
  }
}

async function run(
  phase: CheckPhase,
  input: Parameters<CheckPhase['execute']>[0],
): Promise<{ record: CheckRecord | null; events: string[] }> {
  const events: string[] = []
  const gen = phase.execute(input)
  let next = await gen.next()
  while (!next.done) {
    events.push((next.value as { type: string }).type)
    next = await gen.next()
  }
  return { record: next.value, events }
}

describe('CheckPhase (research/47 Step 6)', () => {
  it('skips silently when beMode is off — no assess call, no events', async () => {
    const assessRisk = vi.fn()
    const phase = new CheckPhase({ assessRisk })
    const { record, events } = await run(phase, {
      context: makeContext({ beMode: false }),
      actionType: 'do',
      choiceTag: null,
    })
    expect(record).toBeNull()
    expect(events).toEqual([])
    expect(assessRisk).not.toHaveBeenCalled()
  })

  it('skips say/think/story action types', async () => {
    const assessRisk = vi.fn()
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({}),
      actionType: 'say',
      choiceTag: null,
    })
    expect(record).toBeNull()
    expect(assessRisk).not.toHaveBeenCalled()
  })

  it('a matching tagged choice resolves without an assess call, with the exact seed', async () => {
    const assessRisk = vi.fn()
    const phase = new CheckPhase({ assessRisk })
    const content = 'Sneak past the guards'
    const { record, events } = await run(phase, {
      context: makeContext({ content }),
      actionType: 'do',
      choiceTag: { text: content, type: 'action', skill: 'stealth', dc: 14 },
    })
    expect(assessRisk).not.toHaveBeenCalled()
    expect(record?.skill).toBe('stealth')
    expect(record?.dc).toBe(14)
    expect(record?.nat).toBe(seededRoll('story-1:entry-9:check'))
    expect(events).toEqual(['phase_start', 'check_resolved', 'phase_complete'])
  })

  it('an edited action ignores the stale tag and falls back to assessment', async () => {
    const assessRisk = vi.fn().mockResolvedValue({ risky: false })
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: 'Actually, wave hello instead' }),
      actionType: 'do',
      choiceTag: { text: 'Sneak past the guards', type: 'action', skill: 'stealth', dc: 14 },
    })
    expect(assessRisk).toHaveBeenCalledOnce()
    expect(record).toBeNull()
  })

  it('risky free text resolves from the assess verdict', async () => {
    const assessRisk = vi
      .fn()
      .mockResolvedValue({ risky: true, skill: 'athletics', dc: 12, essenceCost: 0 })
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: 'Climb the cliff face' }),
      actionType: 'do',
      choiceTag: null,
    })
    expect(record?.skill).toBe('athletics')
    expect(record?.band).toBeDefined()
  })

  it('non-risky free text completes the phase with a null result', async () => {
    const assessRisk = vi.fn().mockResolvedValue({ risky: false })
    const phase = new CheckPhase({ assessRisk })
    const { record, events } = await run(phase, {
      context: makeContext({ content: 'Look around the room' }),
      actionType: 'do',
      choiceTag: null,
    })
    expect(record).toBeNull()
    expect(events).toEqual(['phase_start', 'phase_complete'])
  })
})

describe('CheckPhase — growthIntent threading (check-backed growth)', () => {
  const CONTENT = 'Channel more essence to push her size even further'

  it('a tagged growth choice carries growthIntent + the resolved target onto the record', async () => {
    const assessRisk = vi.fn()
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: CONTENT, girls: ['Amelia'] }),
      actionType: 'do',
      choiceTag: {
        text: CONTENT,
        type: 'action',
        skill: 'channeling',
        dc: 14,
        essenceCost: 2,
        targetCharacter: 'Amelia',
        growthIntent: true,
      },
    })
    expect(assessRisk).not.toHaveBeenCalled()
    expect(record?.growthIntent).toBe(true)
    expect(record?.target).toBe('Amelia')
    expect(record?.targetId).toBe('char-amelia')
  })

  it('the free-text verdict path threads it the same way', async () => {
    const assessRisk = vi.fn().mockResolvedValue({
      risky: true,
      skill: 'channeling',
      dc: 14,
      essenceCost: 2,
      targetCharacter: 'Amelia',
      growthIntent: true,
    })
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: CONTENT, girls: ['Amelia'] }),
      actionType: 'do',
      choiceTag: null,
    })
    expect(record?.growthIntent).toBe(true)
    expect(record?.targetId).toBe('char-amelia')
  })

  it('keeps the flag when no target girl resolves — the store owns subject resolution', async () => {
    // Reversal of the shipped gate: dropping the flag here made a landed,
    // paid-for growth depend on the tagger emitting BOTH tags, and it dropped
    // `targetCharacter` on a live crit. The untargeted record now travels, and
    // the store either fills the sole candidate or applies nothing.
    const assessRisk = vi.fn()
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: CONTENT, girls: ['Amelia'] }),
      actionType: 'do',
      choiceTag: {
        text: CONTENT,
        type: 'action',
        skill: 'channeling',
        dc: 14,
        targetCharacter: 'Someone Who Left',
        growthIntent: true,
      },
    })
    expect(record?.growthIntent).toBe(true)
    expect(record?.target).toBeUndefined()
    expect(record?.targetId).toBeUndefined()
    expect(record?.targetInferred).toBeUndefined()
  })

  it('an untagged-target growth verdict still carries the flag through the free-text path', async () => {
    const assessRisk = vi.fn().mockResolvedValue({
      risky: true,
      skill: 'channeling',
      dc: 8,
      essenceCost: 1,
      growthIntent: true,
    })
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: CONTENT, girls: ['Amelia'] }),
      actionType: 'do',
      choiceTag: null,
    })
    expect(record?.growthIntent).toBe(true)
    expect(record?.targetId).toBeUndefined()
  })

  it('an untagged / non-growth check leaves the flag off entirely', async () => {
    const assessRisk = vi.fn()
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: 'Sneak past the guards', girls: ['Amelia'] }),
      actionType: 'do',
      choiceTag: { text: 'Sneak past the guards', type: 'action', skill: 'stealth', dc: 14 },
    })
    expect(record?.growthIntent).toBeUndefined()
  })

  it('an edited action drops the stale growth tag along with the rest of it', async () => {
    const assessRisk = vi.fn().mockResolvedValue({ risky: false })
    const phase = new CheckPhase({ assessRisk })
    const { record } = await run(phase, {
      context: makeContext({ content: 'Actually, just hold her hand', girls: ['Amelia'] }),
      actionType: 'do',
      choiceTag: {
        text: CONTENT,
        type: 'action',
        skill: 'channeling',
        dc: 14,
        targetCharacter: 'Amelia',
        growthIntent: true,
      },
    })
    expect(assessRisk).toHaveBeenCalledOnce()
    expect(record).toBeNull()
  })
})
