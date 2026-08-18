import { describe, expect, test } from 'vitest'
import { parseBuildLabel, parseHeightCm, seedBaselineFromText } from './baseline'

describe('parseHeightCm', () => {
  test('parses metric, meters, and feet-inches forms', () => {
    expect(parseHeightCm('She stands 165 cm tall')).toBe(165)
    expect(parseHeightCm('height: 1.72m')).toBe(172)
    expect(parseHeightCm(`5'6" and slim`)).toBe(168)
    expect(parseHeightCm('5 ft 10')).toBe(178)
  })

  test('rejects insane or absent values', () => {
    expect(parseHeightCm('a 90 cm bust')).toBeUndefined()
    expect(parseHeightCm('no height here')).toBeUndefined()
  })
})

describe('parseBuildLabel', () => {
  test('maps synonyms onto engine build labels', () => {
    expect(parseBuildLabel('a petite frame')).toBe('petite')
    expect(parseBuildLabel('slender and willowy')).toBe('slim')
    expect(parseBuildLabel('toned, athletic body')).toBe('athletic')
    expect(parseBuildLabel('voluptuous hourglass figure')).toBe('curvy')
    expect(parseBuildLabel('full-figured')).toBe('full')
    expect(parseBuildLabel('nothing physical')).toBeUndefined()
  })
})

describe('seedBaselineFromText', () => {
  test('combines height and build; undefined when nothing parses', () => {
    expect(seedBaselineFromText('a tall athletic woman, 178 cm')).toEqual({
      heightCm: 178,
      build: 'athletic',
    })
    expect(seedBaselineFromText('165 cm')).toEqual({ heightCm: 165 })
    expect(seedBaselineFromText('kind eyes and a warm smile')).toBeUndefined()
  })
})
