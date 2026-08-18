import { describe, expect, it } from 'vitest'

import { defaultBodyState, writeBodyState } from '$lib/services/be'
import { defaultRpgSheet } from './derive'
import { RPG_SHEET_KEY, readRpgSheet, writeRpgSheet } from './metadata'

describe('rpgSheet metadata round-trip', () => {
  it('write → read identity', () => {
    const sheet = { ...defaultRpgSheet(), level: 3, skills: { alchemy: 2 } }
    const metadata = writeRpgSheet(null, sheet)
    expect(readRpgSheet(metadata)).toEqual(sheet)
  })

  it('deep-copy isolation: mutating the source sheet after write cannot reach storage', () => {
    const sheet = defaultRpgSheet()
    const metadata = writeRpgSheet(null, sheet)
    sheet.essence.current = 0
    sheet.knownSpells.push('verdant-swell')
    const stored = readRpgSheet(metadata)
    expect(stored?.essence.current).toBe(8)
    expect(stored?.knownSpells).toEqual([])
  })

  it('preserves sibling keys: bodyState and runtimeVars survive a sheet write', () => {
    const withBody = writeBodyState(
      { runtimeVars: { v1: { variableName: 'mood', v: 'calm' } } },
      defaultBodyState(9),
    )
    const metadata = writeRpgSheet(withBody, defaultRpgSheet())
    expect(metadata.runtimeVars).toEqual({ v1: { variableName: 'mood', v: 'calm' } })
    expect((metadata.bodyState as { tier: number }).tier).toBe(9)
    expect(metadata[RPG_SHEET_KEY]).toBeDefined()
  })

  it('sheet survives a subsequent bodyState write (both keys intact)', () => {
    const metadata = writeBodyState(writeRpgSheet(null, defaultRpgSheet()), defaultBodyState(4))
    expect(readRpgSheet(metadata)?.level).toBe(1)
    expect((metadata.bodyState as { tier: number }).tier).toBe(4)
  })

  it('unknown future fields pass through a round-trip', () => {
    const future = {
      ...defaultRpgSheet(),
      corruption: 42, // a field this build does not know
      essence: { current: 5, max: 8, overdrive: true },
    }
    const stored = readRpgSheet(writeRpgSheet(null, future)) as unknown as Record<string, unknown>
    expect(stored.corruption).toBe(42)
    expect((stored.essence as Record<string, unknown>).overdrive).toBe(true)
  })

  it('legacy metadata without a sheet reads null', () => {
    expect(readRpgSheet(null)).toBeNull()
    expect(readRpgSheet({})).toBeNull()
    expect(readRpgSheet({ bodyState: { tier: 5 } })).toBeNull()
  })

  it('unparseable sheet reads null rather than throwing', () => {
    expect(readRpgSheet({ [RPG_SHEET_KEY]: { level: 'three' } })).toBeNull()
    expect(readRpgSheet({ [RPG_SHEET_KEY]: 7 })).toBeNull()
  })
})
