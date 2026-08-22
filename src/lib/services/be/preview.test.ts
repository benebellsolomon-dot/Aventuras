import { describe, expect, test } from 'vitest'

import { DEFAULT_BE_STORY_CONFIG } from './constants'
import { defaultBodyState } from './metadata'
import { previewGuaranteedGrowth } from './preview'
import { reduceCharacterBody } from './reducer'
import type { BeEvent, BeStoryConfig, BodyState, GrowthVerdict } from './types'

const CONFIG: BeStoryConfig = {
  ...DEFAULT_BE_STORY_CONFIG,
  enabled: true,
  passiveFillEnabled: false,
}

const guaranteedEvent = (critPierce = false): BeEvent => ({
  character: 'Lucy',
  kind: 'catalyst',
  intensity: 2,
  guaranteed: true,
  ...(critPierce ? { critPierce: true } : {}),
})

/** Turns to run a trajectory out so any staged/banked delta finishes metering. */
const SETTLE_TURNS = 6

/** Tier this state settles at after `SETTLE_TURNS` event-less turns. */
function settledTier(state: BodyState, config: BeStoryConfig, events: BeEvent[]): number {
  let current = state
  for (let turn = 0; turn < SETTLE_TURNS; turn++) {
    current = reduceCharacterBody(current, turn === 0 ? events : [], config, `oracle:${turn}`).state
  }
  return current.tier
}

/**
 * The reducer's ACTUAL verdict for a guaranteed event, read back off the result.
 * This is the oracle the preview is measured against — derived from the log and
 * the settled tier (never from the preview), which is what makes the comparison
 * a test rather than a restatement.
 *
 * `lands` vs `at_cap` is decided by running the turn out: growth is real only if
 * the event leaves her PERMANENTLY bigger than the same turns without it, which
 * correctly calls a slow_burn stage that can never clear the cap what it is.
 */
function reducerVerdict(
  state: BodyState,
  config: BeStoryConfig,
  critPierce: boolean,
): GrowthVerdict {
  const event = guaranteedEvent(critPierce)
  const record = reduceCharacterBody(state, [event], config, 'oracle:0')
    .log.filter((entry) => entry.kind === 'catalyst')
    .at(-1)
  if (!record) throw new Error('the guaranteed event produced no log record')

  if (record.outcome === 'muzzled' || record.outcome === 'ineligible') return 'blocked'
  if (record.outcome === 'banked') return 'blocked_recovery'
  return settledTier(state, config, [event]) > settledTier(state, config, []) ? 'lands' : 'at_cap'
}

/** Every state shape whose gates the preview claims to reproduce. */
const CASES: ReadonlyArray<{ name: string; state: BodyState; config?: BeStoryConfig }> = [
  { name: 'clean', state: defaultBodyState(10) },
  { name: 'cooldown armed (grew last turn)', state: { ...defaultBodyState(10), cooldown: 2 } },
  { name: 'cooldown expiring this turn', state: { ...defaultBodyState(10), cooldown: 1 } },
  { name: 'locked', state: { ...defaultBodyState(10), locked: true } },
  { name: 'locked AND on cooldown', state: { ...defaultBodyState(10), locked: true, cooldown: 2 } },
  {
    name: 'at the size cap',
    state: defaultBodyState(10),
    config: { ...CONFIG, sizeCapTier: 10 },
  },
  {
    name: 'at the size cap AND on cooldown',
    state: { ...defaultBodyState(10), cooldown: 2 },
    config: { ...CONFIG, sizeCapTier: 10 },
  },
  {
    name: 'one tier below the cap, on cooldown',
    state: { ...defaultBodyState(10), cooldown: 2 },
    config: { ...CONFIG, sizeCapTier: 11 },
  },
  {
    name: 'cooldown, cap headroom already fully banked',
    state: {
      ...defaultBodyState(10),
      cooldown: 2,
      pendingGrowth: { delta: 1, source: 'catalyst' },
    },
    config: { ...CONFIG, sizeCapTier: 11 },
  },
  {
    name: 'ineligible kind (catalyst-forbidding cosmology)',
    state: defaultBodyState(10),
    config: { ...CONFIG, growthEligibleKinds: ['contact'] },
  },
  {
    name: 'pending growth lands this turn and re-arms the cooldown',
    state: { ...defaultBodyState(10), pendingGrowth: { delta: 1, source: 'catalyst' } },
  },
  {
    name: 'greedy_flesh (shorter cooldown) with one beat left',
    state: { ...defaultBodyState(10), cooldown: 1, quirks: ['greedy_flesh'] },
  },
  {
    // Tier 30's land crosses an INTERACTION_MILESTONE, so slow_burn's step-3
    // bonus fires and the opening simulation has to account for the extra tier.
    name: 'slow_burn bank releasing into a milestone crossing',
    state: {
      ...defaultBodyState(30),
      quirks: ['slow_burn'],
      pendingGrowth: { delta: 2, source: 'catalyst' },
    },
    config: { ...CONFIG, sizeCapTier: 32 },
  },
  {
    name: 'slow_burn (this turn stages instead of landing)',
    state: { ...defaultBodyState(10), quirks: ['slow_burn'] },
  },
]

describe('previewGuaranteedGrowth predicts the reducer', () => {
  for (const critPierce of [false, true]) {
    for (const { name, state, config = CONFIG } of CASES) {
      test(`${name}${critPierce ? ' (crit punch-through)' : ''}`, () => {
        expect(previewGuaranteedGrowth(state, config, { critPierce })).toBe(
          reducerVerdict(state, config, critPierce),
        )
      })
    }
  }
})

describe('previewGuaranteedGrowth — the verdicts by name', () => {
  test('a clean body grows', () => {
    expect(previewGuaranteedGrowth(defaultBodyState(10), CONFIG)).toBe('lands')
  })

  test('a body still recovering banks instead (the live failure)', () => {
    expect(previewGuaranteedGrowth({ ...defaultBodyState(10), cooldown: 2 }, CONFIG)).toBe(
      'blocked_recovery',
    )
  })

  test('a CRIT punches through that same cooldown', () => {
    expect(
      previewGuaranteedGrowth({ ...defaultBodyState(10), cooldown: 2 }, CONFIG, {
        critPierce: true,
      }),
    ).toBe('lands')
  })

  test('the story ceiling reads as at_cap, cooldown or not', () => {
    const capped: BeStoryConfig = { ...CONFIG, sizeCapTier: 10 }
    expect(previewGuaranteedGrowth(defaultBodyState(10), capped)).toBe('at_cap')
    expect(previewGuaranteedGrowth({ ...defaultBodyState(10), cooldown: 2 }, capped)).toBe('at_cap')
    expect(
      previewGuaranteedGrowth({ ...defaultBodyState(10), cooldown: 2 }, capped, {
        critPierce: true,
      }),
    ).toBe('at_cap')
  })

  test('the lock and a forbidding cosmology both read as blocked', () => {
    expect(previewGuaranteedGrowth({ ...defaultBodyState(10), locked: true }, CONFIG)).toBe(
      'blocked',
    )
    expect(
      previewGuaranteedGrowth(defaultBodyState(10), {
        ...CONFIG,
        growthEligibleKinds: ['contact'],
      }),
    ).toBe('blocked')
  })

  test('is pure — it never touches the state it is handed', () => {
    const state: BodyState = { ...defaultBodyState(10), cooldown: 2 }
    const frozen = JSON.parse(JSON.stringify(state)) as BodyState
    previewGuaranteedGrowth(state, CONFIG)
    expect(state).toEqual(frozen)
  })
})

describe('absolute growth rule — gated preview (research/66)', () => {
  const gated = (state: Partial<BodyState>, critPierce = false, config: BeStoryConfig = CONFIG) =>
    previewGuaranteedGrowth({ ...defaultBodyState(), ...state }, config, {
      gateRequired: true,
      critPierce,
    })

  test('a clean body reads conditional, never lands; the kinds gate is bypassed (the reducer does too)', () => {
    expect(gated({})).toBe('conditional')
    expect(gated({}, false, { ...CONFIG, growthEligibleKinds: ['contact'] })).toBe('conditional')
  })

  test('cooldown with no bank still reads blocked_recovery (the earned delta banks either way); a crit reads conditional', () => {
    expect(gated({ cooldown: 2 })).toBe('blocked_recovery')
    expect(gated({ cooldown: 2 }, true)).toBe('conditional')
  })

  test('a bank makes the turn conditional — the bank lands only if the act completes', () => {
    expect(gated({ cooldown: 2, pendingGrowth: { delta: 1, source: 'catalyst' } })).toBe(
      'conditional',
    )
  })

  test('lock and cap still win', () => {
    expect(gated({ locked: true })).toBe('blocked')
    expect(gated({ tier: 10 }, false, { ...CONFIG, sizeCapTier: 10 })).toBe('at_cap')
  })
})
