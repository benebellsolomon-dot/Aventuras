import { describe, expect, it } from 'vitest'

import { defaultBodyState, writeBodyState } from '$lib/services/be'
import { defaultRpgSheet } from './derive'
import {
  RPG_SHEET_KEY,
  hasStoredRpgSheet,
  isStoredRpgSheetInvalid,
  readRpgSheet,
  sheetOrDefault,
  writeRpgSheet,
} from './metadata'

describe('rpgSheet metadata round-trip', () => {
  it('write → read identity', () => {
    const sheet = { ...defaultRpgSheet(), level: 3, skills: { alchemy: 2 } }
    const metadata = writeRpgSheet(null, sheet)
    expect(readRpgSheet(metadata)).toEqual(sheet)
  })

  it('sheetOrDefault grants creation points to a stored sheet that predates them', () => {
    // A legacy sheet: no startingGrant marker, all-baseline, zero points.
    const legacy = {
      ...defaultRpgSheet(),
      startingGrant: undefined,
      unspentPoints: { attribute: 0, skill: 0 },
    }
    const metadata = writeRpgSheet(null, legacy)
    // Raw read is untouched (round-trip fidelity); the grant only rides sheetOrDefault.
    expect(readRpgSheet(metadata)?.unspentPoints).toEqual({ attribute: 0, skill: 0 })
    const resolved = sheetOrDefault(metadata)
    expect(resolved.unspentPoints).toEqual({ attribute: 8, skill: 6 })
    expect(resolved.startingGrant).toBe(true)
  })

  it('sheetOrDefault does not re-grant a sheet that already has the marker', () => {
    const already = { ...defaultRpgSheet(), unspentPoints: { attribute: 2, skill: 1 } }
    const resolved = sheetOrDefault(writeRpgSheet(null, already))
    expect(resolved.unspentPoints).toEqual({ attribute: 2, skill: 1 })
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

describe('D-11: absent vs invalid vs valid stored sheet', () => {
  const valid = writeRpgSheet(null, { ...defaultRpgSheet(), level: 4 })
  const invalid = { [RPG_SHEET_KEY]: { level: 'three' } }

  it('absent: no key at all — nothing stored, nothing to protect', () => {
    for (const metadata of [null, {}, { bodyState: { tier: 5 } }, { [RPG_SHEET_KEY]: null }]) {
      expect(hasStoredRpgSheet(metadata)).toBe(false)
      expect(isStoredRpgSheetInvalid(metadata)).toBe(false)
      expect(readRpgSheet(metadata)).toBeNull()
    }
  })

  it('invalid: a sheet IS stored but does not parse — writers must refuse', () => {
    for (const metadata of [invalid, { [RPG_SHEET_KEY]: 7 }, { [RPG_SHEET_KEY]: { level: -1 } }]) {
      expect(hasStoredRpgSheet(metadata)).toBe(true)
      expect(isStoredRpgSheetInvalid(metadata)).toBe(true)
      // readRpgSheet's contract is unchanged: still null, still safe for readers.
      expect(readRpgSheet(metadata)).toBeNull()
    }
  })

  it('valid: stored and parseable — writers proceed as before', () => {
    expect(hasStoredRpgSheet(valid)).toBe(true)
    expect(isStoredRpgSheetInvalid(valid)).toBe(false)
    expect(readRpgSheet(valid)?.level).toBe(4)
  })

  it('readers still resolve an invalid sheet to displayable defaults', () => {
    // Rendering defaults is harmless — only persisting them would destroy data.
    expect(sheetOrDefault(invalid).level).toBe(1)
  })
})
