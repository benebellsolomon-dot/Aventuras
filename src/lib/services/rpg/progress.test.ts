import { describe, expect, it } from 'vitest'

import { INTERACTION_MILESTONES, defaultBodyState, measurements } from '$lib/services/be'
import { levelProgress } from './progress'

describe('levelProgress', () => {
  it("reports each girl's next milestone with remaining kg and a 0-100 pct, nearest first", () => {
    const small = defaultBodyState(2)
    const big = defaultBodyState(30)
    const rows = levelProgress([
      { name: 'Big', state: big },
      { name: 'Small', state: small },
    ])
    expect(rows.map((r) => r.name)).toEqual(
      [...rows]
        .sort((a, b) => (a.next?.remainingKg ?? 1e9) - (b.next?.remainingKg ?? 1e9))
        .map((r) => r.name),
    )
    for (const row of rows) {
      expect(row.next).not.toBeNull()
      const mass = measurements(row.name === 'Big' ? big : small).nowTotalKg
      expect(row.massKg).toBe(mass)
      expect(row.next!.massKg).toBeGreaterThan(mass)
      expect(row.next!.remainingKg).toBeCloseTo(row.next!.massKg - mass)
      expect(row.next!.pct).toBeGreaterThanOrEqual(0)
      expect(row.next!.pct).toBeLessThanOrEqual(100)
      expect(INTERACTION_MILESTONES.some((m) => m.label === row.next!.label)).toBe(true)
    }
  })

  it('a girl past the top of the ladder has no next milestone and sorts last', () => {
    const huge = { ...defaultBodyState(30), tier: 4000 }
    const rows = levelProgress([
      { name: 'Huge', state: huge },
      { name: 'Small', state: defaultBodyState(2) },
    ])
    expect(rows.at(-1)?.name).toBe('Huge')
    expect(rows.at(-1)?.next).toBeNull()
  })
})
