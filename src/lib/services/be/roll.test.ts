import { describe, expect, it } from 'vitest'

import { resolveCheckBand, resolveGrowthOutcome, seededRoll } from './roll'

/**
 * GOLDEN VALUES — harvested from the pre-extraction seededRoll in reducer.ts
 * (research/47 Step 1). If any of these change, replay safety is broken for
 * every existing story: undo/branch replays would land different growth.
 * Do NOT update these numbers to make a refactor pass.
 */
const GOLDEN: ReadonlyArray<[seed: string, roll: number]> = [
  ['s1:e1:Mira', 5],
  ['s1:e1:Sable', 17],
  ['s1:e2:Mira', 12],
  ['s1:e1:Mira:pressure', 2],
  ['story-abc:entry-123:check', 15],
  ['story-abc:entry-124:check', 20],
  ['story-abc:entry-123:0', 3],
  ['a', 1],
  ['b', 18],
  ['', 2],
  ['x:y:z', 3],
  ['long-story-id-0000:entry-ffff:check', 10],
  ['s:e:check', 6],
  ['s:e:0', 10],
  ['s:e:pressure', 13],
  ['αβγ:δ:check', 16],
  ['story1:entry1:check', 5],
  ['story1:entry2:check', 18],
  ['story2:entry1:check', 8],
  ['S1:E1:MIRA', 13],
  ['seed', 5],
  ['seed2', 3],
  ['The Meadowrun Dairy', 6],
  ['0123456789', 3],
]

describe('seededRoll (golden identity)', () => {
  it.each(GOLDEN)('seed %j → %i', (seed, expected) => {
    expect(seededRoll(seed)).toBe(expected)
  })

  it('is deterministic and bounded 1-20', () => {
    for (let i = 0; i < 500; i++) {
      const roll = seededRoll(`fuzz:${i}`)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
      expect(seededRoll(`fuzz:${i}`)).toBe(roll)
    }
  })

  it('suffix segments produce independent rolls off a shared prefix', () => {
    // The `:check` / `:0` / `:pressure` suffixes must not collide.
    const rolls = [seededRoll('s:e:check'), seededRoll('s:e:0'), seededRoll('s:e:pressure')]
    expect(new Set(rolls).size).toBe(rolls.length)
  })
})

describe('resolveGrowthOutcome (golden bands, ROLL_BANDS 18/11/6, +2/intensity step)', () => {
  // [roll, intensity, outcome] across every band edge at each intensity.
  const CASES: ReadonlyArray<[number, number, string]> = [
    [5, 1, 'fail'],
    [6, 1, 'partial'],
    [10, 1, 'partial'],
    [11, 1, 'success'],
    [17, 1, 'success'],
    [18, 1, 'critical'],
    [5, 2, 'partial'], // 5+2=7
    [6, 2, 'partial'], // 8
    [10, 2, 'success'], // 12
    [11, 2, 'success'], // 13
    [17, 2, 'critical'], // 19
    [18, 2, 'critical'], // 20
    [5, 3, 'partial'], // 5+4=9
    [6, 3, 'partial'], // 10
    [10, 3, 'success'], // 14
    [11, 3, 'success'], // 15
    [17, 3, 'critical'], // 21
    [18, 3, 'critical'], // 22
    [1, 3, 'fail'], // 5
    [2, 3, 'partial'], // 6
  ]
  it.each(CASES)('roll %i @i%i → %s', (roll, intensity, outcome) => {
    expect(resolveGrowthOutcome(roll, intensity)).toBe(outcome)
  })

  it('clamps out-of-range intensity', () => {
    expect(resolveGrowthOutcome(10, 99)).toBe(resolveGrowthOutcome(10, 3))
    expect(resolveGrowthOutcome(10, -5)).toBe(resolveGrowthOutcome(10, 1))
    expect(resolveGrowthOutcome(10, Number.NaN)).toBe(resolveGrowthOutcome(10, 1))
  })
})

describe('resolveCheckBand (DC-relative, research/47 ruling 1)', () => {
  it('crit by margin: beat DC by 8+', () => {
    expect(resolveCheckBand(10, 22, 14)).toBe('crit') // margin 8
    expect(resolveCheckBand(10, 21, 14)).toBe('success') // margin 7
  })

  it('crit by nat: 18+ only when the check also succeeds', () => {
    expect(resolveCheckBand(18, 19, 15)).toBe('crit')
    expect(resolveCheckBand(20, 20, 20)).toBe('crit') // exactly meets DC
    // Nat 18 that still misses the DC is NOT a crit — high DCs give no free crits.
    expect(resolveCheckBand(18, 18, 30)).toBe('fail')
    expect(resolveCheckBand(20, 22, 26)).toBe('partial') // nat 20, miss by 4
  })

  it('partial: miss by 4 or less', () => {
    expect(resolveCheckBand(9, 13, 14)).toBe('partial') // miss 1
    expect(resolveCheckBand(6, 10, 14)).toBe('partial') // miss 4
    expect(resolveCheckBand(5, 9, 14)).toBe('fail') // miss 5
  })

  it('plain success between DC and crit margin', () => {
    expect(resolveCheckBand(12, 15, 15)).toBe('success')
    expect(resolveCheckBand(17, 22, 15)).toBe('success') // margin 7, nat 17
  })
})
