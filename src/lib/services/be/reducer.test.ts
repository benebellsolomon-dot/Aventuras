import { describe, expect, test } from 'vitest'
import { DEFAULT_BE_STORY_CONFIG } from './constants'
import { defaultBodyState } from './metadata'
import { reduceCharacterBody, seededRoll } from './reducer'
import type { BeEvent, BeLogRecord, BeStoryConfig, BodyState } from './types'

const CONFIG: BeStoryConfig = { ...DEFAULT_BE_STORY_CONFIG, enabled: true }
// Fill-sensitive legacy tests opt out of the Spec-1 passive tick (pipeline.test.ts owns it).
const NO_TICK: BeStoryConfig = { ...CONFIG, passiveFillEnabled: false }

const growthEvent = (overrides: Partial<BeEvent> = {}): BeEvent => ({
  character: 'Lucy',
  kind: 'catalyst',
  intensity: 2,
  ...overrides,
})

/** Find a seed whose first roll lands in the wanted outcome band (deterministic search). */
function seedFor(predicate: (roll: number) => boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const seed = `probe-${i}`
    if (predicate(seededRoll(`${seed}:0`))) return seed
  }
  throw new Error('no seed found — bands unreachable?')
}

describe('seededRoll', () => {
  test('is deterministic and in 1..20', () => {
    const rolls = new Set<number>()
    for (let i = 0; i < 400; i++) {
      const roll = seededRoll(`s${i}`)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
      expect(seededRoll(`s${i}`)).toBe(roll)
      rolls.add(roll)
    }
    expect(rolls.size).toBe(20) // full spread over 400 draws
  })
})

describe('reduceCharacterBody', () => {
  test('same inputs produce identical results (replay safety)', () => {
    // Arrange
    const state = defaultBodyState(10)
    const events = [growthEvent(), growthEvent({ kind: 'attempt' })]

    // Act
    const a = reduceCharacterBody(state, events, CONFIG, 'story:42:Lucy')
    const b = reduceCharacterBody(state, events, CONFIG, 'story:42:Lucy')

    // Assert
    expect(a).toEqual(b)
  })

  test('never mutates its inputs', () => {
    const state = defaultBodyState(10)
    state.conditions = [{ label: 'tingling warmth', ttl: 2 }]
    const frozen = JSON.parse(JSON.stringify(state)) as BodyState
    const events = [growthEvent()]

    reduceCharacterBody(state, events, CONFIG, 'seed')

    expect(state).toEqual(frozen)
  })

  test('critical success lands half now, stages the rest, and arms the cooldown', () => {
    const seed = seedFor((roll) => roll + 2 >= 18) // intensity 2 → +2 bonus
    const result = reduceCharacterBody(defaultBodyState(10), [growthEvent()], CONFIG, seed)

    expect(result.state.tier).toBe(11) // anticipation split: +1 now
    expect(result.state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
    expect(result.state.cooldown).toBe(CONFIG.growthCooldownBeats)
    const record = result.log.find((entry) => entry.kind === 'catalyst')
    expect(record).toMatchObject({ outcome: 'critical', delta: 1, tierAfter: 11 })
  })

  test('failure leaves tier untouched', () => {
    const seed = seedFor((roll) => roll + 2 < 6)
    const result = reduceCharacterBody(defaultBodyState(10), [growthEvent()], CONFIG, seed)

    expect(result.state.tier).toBe(10)
    expect(result.log.find((entry) => entry.kind === 'catalyst')?.outcome).toBe('fail')
  })

  test('the size-lock muzzles growth without rolling — even at max intensity', () => {
    const state = { ...defaultBodyState(10), locked: true }
    const result = reduceCharacterBody(state, [growthEvent({ intensity: 3 })], CONFIG, 'any')

    expect(result.state.tier).toBe(10)
    expect(result.log.find((entry) => entry.kind === 'catalyst')?.outcome).toBe('muzzled')
  })

  test('a successful growth cools down later events in the same turn', () => {
    const seed = seedFor((roll) => roll + 2 >= 18)
    const events = [growthEvent(), growthEvent(), growthEvent()]
    const result = reduceCharacterBody(defaultBodyState(10), events, CONFIG, seed)

    const outcomes = result.log
      .filter((entry) => entry.kind === 'catalyst')
      .map((entry) => entry.outcome)
    expect(outcomes[0]).toBe('critical')
    expect(outcomes.slice(1)).toEqual(['cooldown', 'cooldown'])
    expect(result.state.tier).toBe(11) // only the first event's landed half
  })

  test('an active cooldown gates growth and ticks down once per turn', () => {
    const state = { ...defaultBodyState(10), cooldown: 2 }
    const first = reduceCharacterBody(state, [growthEvent()], CONFIG, 'x')
    expect(first.log.find((entry) => entry.kind === 'catalyst')?.outcome).toBe('cooldown')
    expect(first.state.cooldown).toBe(1)

    const second = reduceCharacterBody(first.state, [], CONFIG, 'x')
    expect(second.state.cooldown).toBe(0)
  })

  test('the story size cap clamps growth to the ceiling', () => {
    const seed = seedFor((roll) => roll + 2 >= 18) // would be +2
    const config: BeStoryConfig = { ...CONFIG, sizeCapTier: 11 }
    const result = reduceCharacterBody(defaultBodyState(10), [growthEvent()], config, seed)

    expect(result.state.tier).toBe(11)
    expect(result.log.find((entry) => entry.kind === 'catalyst')?.delta).toBe(1)
  })

  test('milking drains fluids and never touches tier', () => {
    const state = defaultBodyState(20)
    state.fluids = { fillPercent: 90, fluidType: 'milk' }
    const result = reduceCharacterBody(
      state,
      [growthEvent({ kind: 'milking', intensity: 2 })],
      NO_TICK,
      's',
    )

    expect(result.state.fluids.fillPercent).toBe(10)
    expect(result.state.tier).toBe(20)
  })

  test('stabilize clears pending growth', () => {
    const state: BodyState = {
      ...defaultBodyState(10),
      pendingGrowth: { delta: 1, source: 'ritual' },
    }
    const result = reduceCharacterBody(state, [growthEvent({ kind: 'stabilize' })], CONFIG, 's')

    expect(result.state.pendingGrowth).toBeUndefined()
  })

  test('conditions tick down and expire exactly once per turn, attributed to the character', () => {
    const state = defaultBodyState(10)
    state.conditions = [
      { label: 'tingling warmth', ttl: 2 },
      { label: 'fading flush', ttl: 1 },
      { label: 'permanent mark' },
    ]
    const result = reduceCharacterBody(state, [], CONFIG, 's', 'Lucy')

    expect(result.state.conditions).toEqual([
      { label: 'tingling warmth', ttl: 1 },
      { label: 'permanent mark' },
    ])
    const decay = result.log.find((entry) => entry.kind === 'decay')
    expect(decay?.character).toBe('Lucy')
  })

  test('soft states apply clamped, before drain events resolve', () => {
    const state = defaultBodyState(20)
    const result = reduceCharacterBody(
      state,
      [growthEvent({ kind: 'milking', intensity: 1 })],
      NO_TICK,
      's',
      'Lucy',
      { character: 'Lucy', attitude: 'craving', arousal: 450, fluidFill: 90 },
    )

    expect(result.state.attitude).toBe('craving')
    expect(result.state.arousal).toBe(100) // clamped
    // fill set to 90 first, then the milking event drains 40 → 50
    expect(result.state.fluids.fillPercent).toBe(50)
    expect(result.log.some((entry) => entry.kind === 'mood')).toBe(true)
  })

  test('soft states persist across turns without re-proposal', () => {
    const first = reduceCharacterBody(defaultBodyState(20), [], CONFIG, 's', 'Lucy', {
      character: 'Lucy',
      attitude: 'fearful',
      arousal: 40,
    })
    const second = reduceCharacterBody(first.state, [], CONFIG, 's2', 'Lucy')
    expect(second.state.attitude).toBe('fearful')
    expect(second.state.arousal).toBe(40)
  })

  test('junk intensity is clamped instead of trusted', () => {
    const result = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ intensity: 999 }), growthEvent({ intensity: Number.NaN })],
      CONFIG,
      'clamp-seed',
    )
    const rolled = result.log.filter((entry) => entry.note?.startsWith('roll '))
    expect(rolled.length).toBeGreaterThanOrEqual(1)
    for (const entry of rolled) {
      expect(entry.note).toMatch(/@i[123]$/)
    }
  })
})

describe('growth-eligible kinds (per-story cosmology)', () => {
  // Playtest finding (research/41): a story whose canon says "only the catalyst
  // drives growth" must never land canon-illegal growth from contact rolls.
  const CATALYST_ONLY: BeStoryConfig = { ...NO_TICK, growthEligibleKinds: ['catalyst'] }

  test('ineligible growth kind never rolls: no tier change, no cooldown, outcome ineligible', () => {
    // Arrange: a seed that WOULD crit at intensity 2 if the roll happened
    const seed = seedFor((roll) => roll + 2 >= 18)
    const state = defaultBodyState(10)

    // Act
    const { state: next, log } = reduceCharacterBody(
      state,
      [growthEvent({ kind: 'contact' })],
      CATALYST_ONLY,
      seed,
    )

    // Assert
    expect(next.tier).toBe(10)
    expect(next.lastGrowth).toBeUndefined()
    expect(next.cooldown).toBe(0)
    expect(log.at(-1)).toMatchObject({ kind: 'contact', outcome: 'ineligible', delta: 0 })
  })

  test('eligible kind still rolls under a restricted config', () => {
    const seed = seedFor((roll) => roll + 2 >= 18)
    const { state: next, log } = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ kind: 'catalyst' })],
      CATALYST_ONLY,
      seed,
    )
    expect(next.tier).toBeGreaterThan(10)
    expect(log.at(-1)?.outcome).toBe('critical')
  })

  test('undefined growthEligibleKinds keeps every growth kind eligible (backward compat)', () => {
    const seed = seedFor((roll) => roll + 2 >= 11 && roll + 2 < 18)
    const { state: next } = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ kind: 'contact' })],
      CONFIG,
      seed,
    )
    expect(next.tier).toBe(11)
  })

  test('milking and stabilize are unaffected by the eligibility filter', () => {
    const state: BodyState = {
      ...defaultBodyState(10),
      fluids: { fillPercent: 80, fluidType: 'milk' },
      pendingGrowth: { delta: 1, source: 'contact' },
    }
    const { state: next } = reduceCharacterBody(
      state,
      [growthEvent({ kind: 'milking', intensity: 1 }), growthEvent({ kind: 'stabilize' })],
      CATALYST_ONLY,
      'any-seed',
    )
    expect(next.fluids.fillPercent).toBe(40)
    expect(next.pendingGrowth).toBeUndefined()
  })
})

/**
 * Cast-guaranteed growth (resolve-then-narrate ruling).
 *
 * The shipped bug: the player cast a growth spell, the RPG check SUCCEEDED, the
 * narrator was handed `[CHECK RESULT] success` and wrote the growth — and THEN
 * the reducer rolled its own hidden d20, rolled a 1, and nothing landed. Two dice
 * layers, only the first of them visible to the player. A successful cast IS the
 * dice now; every other gate still binds.
 */
describe('cast-guaranteed growth (resolve-then-narrate)', () => {
  // A seed on which an ambient intensity-2 event fails outright — the live bug in
  // miniature, and the control every test below is measured against.
  const failSeed = seedFor((roll) => roll + 2 < 6)

  test('the very event that fails ambient LANDS when it comes from a cast', () => {
    const ambient = reduceCharacterBody(defaultBodyState(10), [growthEvent()], NO_TICK, failSeed)
    expect(ambient.state.tier).toBe(10)
    expect(ambient.log.at(-1)).toMatchObject({ outcome: 'fail', delta: 0 })

    const cast = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ guaranteed: true })],
      NO_TICK,
      failSeed,
    )
    expect(cast.state.tier).toBe(11)
    expect(cast.state.lastGrowth).toEqual({ delta: 1, tierBefore: 10 })
    expect(cast.log.at(-1)).toMatchObject({ outcome: 'success', delta: 1, tierAfter: 11 })
    // The log says WHY it did not roll — a beLog reader must be able to tell a
    // guaranteed cast from a lucky roll.
    expect(cast.log.at(-1)?.note).toBe('cast @i2 (guaranteed)')
  })

  test('every band intensity lands, deterministically (crit +1 / success +0 / partial −1)', () => {
    // translateSpellEffects turns the check band into an intensity: crit → 3,
    // success → 2, partial → 1. All three must land, and land the SAME way twice.
    for (const intensity of [1, 2, 3]) {
      const once = reduceCharacterBody(
        defaultBodyState(10),
        [growthEvent({ intensity, guaranteed: true })],
        NO_TICK,
        failSeed,
      )
      const twice = reduceCharacterBody(
        defaultBodyState(10),
        [growthEvent({ intensity, guaranteed: true })],
        NO_TICK,
        failSeed,
      )
      expect(once).toEqual(twice) // replay-identical: no dice were consulted
      expect(once.state.tier).toBeGreaterThan(10)
      expect(once.log.at(-1)?.outcome).toBe(intensity === 3 ? 'critical' : 'success')
    }
  })

  test('a scene-defining (i3) cast crits and splits: +1 now, +1 staged', () => {
    const result = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ intensity: 3, guaranteed: true })],
      NO_TICK,
      failSeed,
    )
    expect(result.state.tier).toBe(11)
    expect(result.state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
  })

  test('ambient growth keeps its probability roll (the bypass is cast-only)', () => {
    // Sweep enough seeds that an unrolled ambient path could not hide: ambient
    // outcomes must still spread across the bands, cast outcomes never do.
    const ambientOutcomes = new Set<string>()
    const castOutcomes = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const seed = `sweep-${i}`
      ambientOutcomes.add(
        reduceCharacterBody(defaultBodyState(10), [growthEvent()], NO_TICK, seed).log.at(-1)
          ?.outcome ?? '',
      )
      castOutcomes.add(
        reduceCharacterBody(
          defaultBodyState(10),
          [growthEvent({ guaranteed: true })],
          NO_TICK,
          seed,
        ).log.at(-1)?.outcome ?? '',
      )
    }
    expect(ambientOutcomes.size).toBeGreaterThan(1)
    expect(ambientOutcomes).toContain('fail')
    expect(castOutcomes).toEqual(new Set(['success']))
  })

  test('bypassing the roll does not shift a co-occurring ambient event', () => {
    // seededRoll is keyed per event index, not a sequential stream — proving it
    // here so a future "draw from a stream" refactor cannot silently desync the
    // ambient goldens. Size-capped at the current tier so nothing lands and the
    // cooldown stays unarmed, leaving the second event free to roll in both runs.
    const capped: BeStoryConfig = { ...NO_TICK, sizeCapTier: 10 }
    const ambientFirst = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent(), growthEvent({ kind: 'contact' })],
      capped,
      'stream-seed',
    )
    const castFirst = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ guaranteed: true }), growthEvent({ kind: 'contact' })],
      capped,
      'stream-seed',
    )
    const secondEvent = (log: ReadonlyArray<BeLogRecord>) =>
      log.find((entry) => entry.kind === 'contact')
    expect(secondEvent(castFirst.log)).toEqual(secondEvent(ambientFirst.log))
    expect(secondEvent(castFirst.log)?.note).toMatch(/^roll \d+ @i2$/)
  })

  test('the size-lock still muzzles a cast', () => {
    const state = { ...defaultBodyState(10), locked: true }
    const result = reduceCharacterBody(
      state,
      [growthEvent({ intensity: 3, guaranteed: true })],
      NO_TICK,
      'any',
    )
    expect(result.state.tier).toBe(10)
    expect(result.log.at(-1)?.outcome).toBe('muzzled')
  })

  // FIXTURE UPDATED (earned-growth banking): a cooldown still gates a cast —
  // nothing lands this turn — but the earned delta no longer EVAPORATES. It
  // stages into pendingGrowth and lands as the cooldown clears, so the outcome
  // word moved from 'cooldown' (dropped) to 'banked' (deferred). The
  // still-tier-10 assertion is the part that had to stay true.
  test('an active cooldown defers a cast into the bank instead of dropping it', () => {
    const state = { ...defaultBodyState(10), cooldown: 2 }
    const result = reduceCharacterBody(state, [growthEvent({ guaranteed: true })], NO_TICK, 'any')
    expect(result.state.tier).toBe(10)
    expect(result.log.at(-1)?.outcome).toBe('banked')
    expect(result.state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
  })

  // FIXTURE UPDATED (earned-growth banking): same ruling one level out — the
  // ambient crit still consumes the turn's single growth, and the cast that
  // follows it still lands nothing NOW, but its delta joins the bank rather
  // than being thrown away.
  test('one growth per turn: a landed ambient event banks a later cast', () => {
    const critSeed = seedFor((roll) => roll + 2 >= 18)
    const result = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent(), growthEvent({ guaranteed: true })],
      NO_TICK,
      critSeed,
    )
    const outcomes = result.log.filter((e) => e.kind === 'catalyst').map((e) => e.outcome)
    expect(outcomes).toEqual(['critical', 'banked'])
    expect(result.state.tier).toBe(11) // one growth landed this turn, not two
    // The ambient crit staged +1 (anticipation split); the cast added its +1.
    expect(result.state.pendingGrowth).toEqual({ delta: 2, source: 'catalyst' })
  })

  test('the story size cap still clamps a cast', () => {
    const capped: BeStoryConfig = { ...NO_TICK, sizeCapTier: 10 }
    const result = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ intensity: 3, guaranteed: true })],
      capped,
      'any',
    )
    expect(result.state.tier).toBe(10)
    expect(result.log.at(-1)?.delta).toBe(0)
  })

  test('the growth cosmology still refuses a cast of an ineligible kind', () => {
    // A story whose canon says only intimate contact grows a girl does not get a
    // catalyst-shaped exception just because the player rolled well.
    const contactOnly: BeStoryConfig = { ...NO_TICK, growthEligibleKinds: ['contact'] }
    const result = reduceCharacterBody(
      defaultBodyState(10),
      [growthEvent({ guaranteed: true })],
      contactOnly,
      'any',
    )
    expect(result.state.tier).toBe(10)
    expect(result.log.at(-1)?.outcome).toBe('ineligible')
  })

  test('a CRIT-band cast punches through the cooldown and re-arms it', () => {
    // User ruling: back-to-back crits land. Success/partial bank instead.
    const state = { ...defaultBodyState(10), cooldown: 2 }
    const result = reduceCharacterBody(
      state,
      [growthEvent({ guaranteed: true, critPierce: true })],
      NO_TICK,
      'any',
    )
    expect(result.state.tier).toBe(11)
    expect(result.log.at(-1)).toMatchObject({ outcome: 'success', delta: 1 })
    expect(result.state.cooldown).toBe(NO_TICK.growthCooldownBeats)
  })

  test('crit punch-through still obeys the lock and the size cap', () => {
    const pierce = growthEvent({ intensity: 3, guaranteed: true, critPierce: true })

    const locked = reduceCharacterBody(
      { ...defaultBodyState(10), locked: true, cooldown: 2 },
      [pierce],
      NO_TICK,
      'any',
    )
    expect(locked.state.tier).toBe(10)
    expect(locked.log.at(-1)?.outcome).toBe('muzzled')

    const capped = reduceCharacterBody(
      { ...defaultBodyState(10), cooldown: 2 },
      [pierce],
      { ...NO_TICK, sizeCapTier: 10 },
      'any',
    )
    expect(capped.state.tier).toBe(10)
    expect(capped.log.at(-1)?.delta).toBe(0)
  })

  test('slow_burn still stages a cast, and the bank drains at the metered rate', () => {
    const state = { ...defaultBodyState(10), quirks: ['slow_burn'] }
    const turn1 = reduceCharacterBody(
      state,
      [growthEvent({ intensity: 3, guaranteed: true })],
      NO_TICK,
      failSeed,
    )
    // Nothing lands the turn of the cast — her growth is delayed, not denied.
    expect(turn1.state.tier).toBe(10)
    expect(turn1.state.pendingGrowth).toEqual({ delta: 2, source: 'catalyst' })
    // M-2: the bank releases at MAX_GROWTH_LAND_PER_TURN, re-staging the rest.
    const turn2 = reduceCharacterBody(turn1.state, [], NO_TICK, `${failSeed}:t2`)
    expect(turn2.state.tier).toBe(11)
    expect(turn2.state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
  })
})

/**
 * Earned growth BANKS on cooldown (the last narration-vs-engine seam).
 *
 * The live failure: the player crit a growth check, the guaranteed catalyst hit
 * the cooldown gate (she grew the previous turn), the reducer scored delta 0 and
 * dropped it — while the narrator, seeing only "Critical Success", wrote a
 * room-filling eruption. The engine now keeps what the player earned instead of
 * throwing it away; the pre-flight verdict (preview.ts) keeps the prose honest
 * about WHEN it shows up.
 */
describe('earned growth banks on cooldown', () => {
  const onCooldown = (overrides: Partial<BodyState> = {}): BodyState => ({
    ...defaultBodyState(10),
    cooldown: 2,
    ...overrides,
  })

  test('the banked delta lands through the existing meter on a later turn', () => {
    const turn1 = reduceCharacterBody(
      onCooldown(),
      [growthEvent({ guaranteed: true })],
      NO_TICK,
      'bank',
    )
    expect(turn1.state.tier).toBe(10)
    expect(turn1.state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
    expect(turn1.state.cooldown).toBe(1) // ticked, not re-armed: nothing landed

    // Next turn the cooldown clears and step 3 releases the bank — no new event.
    const turn2 = reduceCharacterBody(turn1.state, [], NO_TICK, 'bank:t2')
    expect(turn2.state.tier).toBe(11)
    expect(turn2.state.pendingGrowth).toBeUndefined()
    expect(turn2.log.find((e) => e.kind === 'pending')?.note).toContain('anticipation lands +1')
  })

  test('the turn log says the growth banked, and by how much', () => {
    const { log } = reduceCharacterBody(
      onCooldown(),
      [growthEvent({ intensity: 3, guaranteed: true })],
      NO_TICK,
      'bank',
    )
    expect(log.at(-1)).toMatchObject({ outcome: 'banked', delta: 0 })
    expect(log.at(-1)?.note).toContain('banked (+2 staged')
  })

  test('a bank is not a dry beat — it must not also buy pity pressure', () => {
    const banked = reduceCharacterBody(
      onCooldown(),
      [growthEvent({ guaranteed: true })],
      NO_TICK,
      'bank',
    )
    const ambient = reduceCharacterBody(onCooldown(), [growthEvent()], NO_TICK, 'bank')
    expect(banked.state.growthPressure).toBe(0)
    expect(ambient.state.growthPressure).toBeGreaterThan(0)
  })

  test('an AMBIENT cooldown-blocked event still drops, byte-identical', () => {
    const { state, log } = reduceCharacterBody(onCooldown(), [growthEvent()], NO_TICK, 'ambient')
    expect(log.at(-1)).toEqual({
      character: 'Lucy',
      kind: 'catalyst',
      outcome: 'cooldown',
      delta: 0,
      tierAfter: 10,
    })
    expect(state.pendingGrowth).toBeUndefined()
  })

  test('the size cap wins over the bank — never stage growth she could not land', () => {
    const capped: BeStoryConfig = { ...NO_TICK, sizeCapTier: 10 }
    const { state, log } = reduceCharacterBody(
      onCooldown(),
      [growthEvent({ intensity: 3, guaranteed: true })],
      capped,
      'bank',
    )
    expect(state.pendingGrowth).toBeUndefined()
    expect(log.at(-1)).toMatchObject({ outcome: 'cooldown', delta: 0 })

    // One tier of headroom banks exactly one tier, not the crit's two.
    const room: BeStoryConfig = { ...NO_TICK, sizeCapTier: 11 }
    const partial = reduceCharacterBody(
      onCooldown(),
      [growthEvent({ intensity: 3, guaranteed: true })],
      room,
      'bank',
    )
    expect(partial.state.pendingGrowth).toEqual({ delta: 1, source: 'catalyst' })
  })

  test('the lock still muzzles before the bank is ever reached', () => {
    const { state, log } = reduceCharacterBody(
      onCooldown({ locked: true }),
      [growthEvent({ guaranteed: true })],
      NO_TICK,
      'bank',
    )
    expect(state.pendingGrowth).toBeUndefined()
    expect(log.at(-1)?.outcome).toBe('muzzled')
  })

  test('an ineligible kind still refuses before the bank is ever reached', () => {
    const contactOnly: BeStoryConfig = { ...NO_TICK, growthEligibleKinds: ['contact'] }
    const { state, log } = reduceCharacterBody(
      onCooldown(),
      [growthEvent({ guaranteed: true })],
      contactOnly,
      'bank',
    )
    expect(state.pendingGrowth).toBeUndefined()
    expect(log.at(-1)?.outcome).toBe('ineligible')
  })
})
