import { describe, expect, it, vi } from 'vitest'

import { defaultBodyState, seededRoll, writeBodyState, type BodyState } from '$lib/services/be'
import { defaultRpgSheet, writeRpgSheet, type CheckRecord } from '$lib/services/rpg'
import { CheckPhase } from './CheckPhase'
import type { GenerationContext } from '../types'

type ContextCharacter = GenerationContext['worldState']['characters'][number]
type ContextEntry = GenerationContext['worldState']['lorebookEntries'][number]

function makeContext(overrides: {
  beMode?: boolean
  hasProtagonist?: boolean
  content?: string
  rawInput?: string
  /** Extra non-protagonist rows, so target resolution has something to find. */
  girls?: string[]
  /** Body state for every girl above — the pre-flight verdict needs a body. */
  bodyState?: Partial<BodyState>
  /** Story settings merged over the defaults (size cap, eligible kinds). */
  settings?: Record<string, unknown>
  lorebookEntries?: ContextEntry[]
}): GenerationContext {
  const { beMode = true, hasProtagonist = true, content = 'Sneak past the guards' } = overrides
  const girls = (overrides.girls ?? []).map(
    (name) =>
      ({
        id: `char-${name.toLowerCase()}`,
        name,
        relationship: 'ally',
        ...(overrides.bodyState
          ? { metadata: writeBodyState(null, { ...defaultBodyState(20), ...overrides.bodyState }) }
          : {}),
      }) as ContextCharacter,
  )
  return {
    story: {
      id: 'story-1',
      settings: { beMode, ...overrides.settings },
    } as unknown as GenerationContext['story'],
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
      lorebookEntries: overrides.lorebookEntries ?? [],
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

/**
 * Pre-flight growth verdict (the narration-vs-engine seam).
 *
 * The seed is fixed, so nat is 15 and the default sheet adds +0: DC 14 bands
 * SUCCESS, DC 7 bands CRIT, DC 25 bands FAIL.
 */
describe('CheckPhase — pre-flight growth verdict', () => {
  const CONTENT = 'Channel more essence to push her size even further'

  const growthTag = (dc = 14) => ({
    text: CONTENT,
    type: 'action' as const,
    skill: 'channeling' as const,
    dc,
    essenceCost: 1,
    targetCharacter: 'Amelia',
    growthIntent: true,
  })

  const growthCheck = async (context: GenerationContext, dc = 14): Promise<CheckRecord | null> => {
    const phase = new CheckPhase({ assessRisk: vi.fn() })
    const { record } = await run(phase, { context, actionType: 'do', choiceTag: growthTag(dc) })
    return record
  }

  it('a clean target gets the lands verdict', async () => {
    const record = await growthCheck(
      makeContext({ content: CONTENT, girls: ['Amelia'], bodyState: {} }),
    )
    expect(record?.growthVerdict).toBe('lands')
  })

  it('with a cosmology set, a landing verdict becomes conditional; banking/cap/lock keep their own wording', async () => {
    const cosmology = { beGrowthCosmology: "Player's semen when ejaculated during sex" }
    const lands = await growthCheck(
      makeContext({ content: CONTENT, girls: ['Amelia'], bodyState: {}, settings: cosmology }),
    )
    expect(lands?.growthVerdict).toBe('conditional')
    const banks = await growthCheck(
      makeContext({
        content: CONTENT,
        girls: ['Amelia'],
        bodyState: { cooldown: 2 },
        settings: cosmology,
      }),
    )
    expect(banks?.growthVerdict).toBe('blocked_recovery')
    const locked = await growthCheck(
      makeContext({
        content: CONTENT,
        girls: ['Amelia'],
        bodyState: { locked: true },
        settings: cosmology,
      }),
    )
    expect(locked?.growthVerdict).toBe('blocked')
  })

  it('the live failure: a girl who grew last turn reads blocked_recovery', async () => {
    const record = await growthCheck(
      makeContext({ content: CONTENT, girls: ['Amelia'], bodyState: { cooldown: 2 } }),
    )
    expect(record?.band).toBe('success')
    expect(record?.growthVerdict).toBe('blocked_recovery')
  })

  it('a CRIT on that same cooldown lands instead (crit punches through)', async () => {
    const record = await growthCheck(
      makeContext({ content: CONTENT, girls: ['Amelia'], bodyState: { cooldown: 2 } }),
      7,
    )
    expect(record?.band).toBe('crit')
    expect(record?.growthVerdict).toBe('lands')
  })

  it('a locked girl reads blocked', async () => {
    // `at_cap` has no route through this phase — no story setting feeds
    // sizeCapTier today — so preview.test.ts owns that verdict's coverage.
    const locked = await growthCheck(
      makeContext({ content: CONTENT, girls: ['Amelia'], bodyState: { locked: true } }),
    )
    expect(locked?.growthVerdict).toBe('blocked')
  })

  it('a fail band previews nothing — a fizzle grows nobody', async () => {
    const record = await growthCheck(
      makeContext({ content: CONTENT, girls: ['Amelia'], bodyState: { cooldown: 2 } }),
      25,
    )
    expect(record?.band).toBe('fail')
    expect(record?.growthVerdict).toBeUndefined()
  })

  it('no verdict without a resolved target girl — there is no body to preview', async () => {
    const phase = new CheckPhase({ assessRisk: vi.fn() })
    const { record } = await run(phase, {
      context: makeContext({ content: CONTENT, girls: ['Amelia'], bodyState: { cooldown: 2 } }),
      actionType: 'do',
      choiceTag: { ...growthTag(), targetCharacter: undefined },
    })
    expect(record?.growthIntent).toBe(true)
    expect(record?.growthVerdict).toBeUndefined()
  })

  it('no verdict for a target who carries no body state yet', async () => {
    const record = await growthCheck(makeContext({ content: CONTENT, girls: ['Amelia'] }))
    expect(record?.target).toBe('Amelia')
    expect(record?.growthVerdict).toBeUndefined()
  })

  it('a non-growth check never carries one', async () => {
    const phase = new CheckPhase({ assessRisk: vi.fn() })
    const { record } = await run(phase, {
      context: makeContext({
        content: 'Sneak past the guards',
        girls: ['Amelia'],
        bodyState: { cooldown: 2 },
      }),
      actionType: 'do',
      choiceTag: {
        text: 'Sneak past the guards',
        type: 'action',
        skill: 'stealth',
        dc: 14,
        targetCharacter: 'Amelia',
      },
    })
    expect(record?.growthVerdict).toBeUndefined()
  })

  it('the story cosmology gates it: a catalyst-forbidding story reads blocked', async () => {
    const record = await growthCheck(
      makeContext({
        content: CONTENT,
        girls: ['Amelia'],
        bodyState: {},
        settings: { beGrowthEligibleKinds: ['contact'] },
      }),
    )
    expect(record?.growthVerdict).toBe('blocked')
  })
})

describe('CheckPhase — pre-flight verdict on a cast', () => {
  const CONTENT = 'Cast Swell of the Vale on Amelia'

  const spellEntry = (effects: Array<{ kind: string; intensity?: number }>) =>
    ({
      id: 'spell-1',
      type: 'spell',
      state: { type: 'spell', school: 'transmutation', essenceCost: 1, dc: 14, effects },
    }) as unknown as GenerationContext['worldState']['lorebookEntries'][number]

  const castCheck = async (
    effects: Array<{ kind: string; intensity?: number }>,
  ): Promise<CheckRecord | null> => {
    const context = makeContext({
      content: CONTENT,
      girls: ['Amelia'],
      bodyState: { cooldown: 2 },
      lorebookEntries: [spellEntry(effects)],
    })
    // The sheet must KNOW the spell or resolveCheck drops the marker entirely.
    const protagonist = context.worldState.characters[0]
    protagonist.metadata = writeRpgSheet(null, {
      ...defaultRpgSheet(),
      knownSpells: ['spell-1'],
    })
    const phase = new CheckPhase({ assessRisk: vi.fn() })
    const { record } = await run(phase, {
      context,
      actionType: 'do',
      choiceTag: {
        text: CONTENT,
        type: 'action',
        skill: 'transmutation',
        dc: 14,
        essenceCost: 1,
        targetCharacter: 'Amelia',
        spellId: 'spell-1',
      },
    })
    return record
  }

  it('a growth spell on a recovering girl previews the bank', async () => {
    const record = await castCheck([{ kind: 'growth', intensity: 2 }])
    expect(record?.spellId).toBe('spell-1')
    expect(record?.growthVerdict).toBe('blocked_recovery')
  })

  it('a spell with no growth effect claims no growth verdict', async () => {
    const record = await castCheck([{ kind: 'bond', intensity: 2 }])
    expect(record?.spellId).toBe('spell-1')
    expect(record?.growthVerdict).toBeUndefined()
  })
})
