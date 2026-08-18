/**
 * Tests for the agnostic BE genre-rules pack (research/37 Spec 3 Task 5, pulled
 * forward by the research/41 precedence finding: always-on lore was outranking
 * the [BODY STATE] growth directive, so the narrator contract must state the
 * precedence rule explicitly).
 */
import { describe, expect, test } from 'vitest'
import { buildBeGenreRules } from './genre-rules'

describe('buildBeGenreRules', () => {
  test('emits the rules block with the four-phase render scaffold', () => {
    const rules = buildBeGenreRules({})
    expect(rules).toContain('[BE GENRE RULES]')
    for (const phase of ['Anticipation', 'Onset', 'Peak', 'Aftermath']) {
      expect(rules).toContain(phase)
    }
  })

  test('states the [BODY STATE] precedence rule (the research/41 fix)', () => {
    const rules = buildBeGenreRules({})
    expect(rules).toContain('[BODY STATE]')
    expect(rules).toContain('lore')
  })

  test('demands metric and bans US band sizing', () => {
    const rules = buildBeGenreRules({})
    expect(rules).toContain('metric')
    expect(rules).toContain('34DD')
  })

  test('interpolates the story cosmology when present, omits the section otherwise', () => {
    const withCosmology = buildBeGenreRules({
      growthCosmology: 'mana overflow from channelling spells',
    })
    expect(withCosmology).toContain('mana overflow from channelling spells')
    expect(buildBeGenreRules({})).not.toContain('growth cosmology')
  })

  test('interpolates the pacing flavor when present', () => {
    const rules = buildBeGenreRules({ pacingFlavor: 'slow-burn, tectonic, savoring each stage' })
    expect(rules).toContain('slow-burn, tectonic, savoring each stage')
    expect(buildBeGenreRules({})).not.toContain('Pacing flavor')
  })
})
