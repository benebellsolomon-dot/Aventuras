import { describe, it, expect } from 'vitest'

import { spellSchema, buildSpellEntryData } from './spell'

const valid = {
  name: 'Swell of the Vale',
  description: 'A transmutation working that coaxes the flesh fuller.',
  school: 'transmutation',
  essenceCost: 2,
  dc: 14,
  effects: [{ kind: 'growth', intensity: 2 }],
  aliases: ['Swell'],
}

describe('spellSchema (Phase 4 Step 6)', () => {
  it('accepts a well-formed generated spell', () => {
    expect(spellSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an out-of-vocabulary effect', () => {
    const bad = { ...valid, effects: [{ kind: 'teleport' }] }
    expect(spellSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a school that is not a SkillId', () => {
    expect(spellSchema.safeParse({ ...valid, school: 'necromancy' }).success).toBe(false)
  })

  it('rejects an out-of-range dc or essenceCost', () => {
    expect(spellSchema.safeParse({ ...valid, dc: 999 }).success).toBe(false)
    expect(spellSchema.safeParse({ ...valid, essenceCost: 99 }).success).toBe(false)
  })

  it('requires at least one effect', () => {
    expect(spellSchema.safeParse({ ...valid, effects: [] }).success).toBe(false)
  })

  it('treats aliases as optional (buildSpellEntryData fills the fallback)', () => {
    const { aliases: _drop, ...noAliases } = valid
    const parsed = spellSchema.safeParse(noAliases)
    expect(parsed.success).toBe(true)
    const data = buildSpellEntryData(spellSchema.parse(noAliases))
    expect(data.aliases).toEqual([])
    expect(data.injection.keywords).toEqual(['Swell of the Vale'])
  })
})

describe('buildSpellEntryData (Phase 4 Step 6)', () => {
  it('builds a type:spell Entry with the mechanical block and keyword injection', () => {
    const data = buildSpellEntryData(spellSchema.parse(valid))
    expect(data.type).toBe('spell')
    expect(data.state).toEqual({
      type: 'spell',
      school: 'transmutation',
      essenceCost: 2,
      dc: 14,
      effects: [{ kind: 'growth', intensity: 2 }],
      revealed: true,
    })
    expect(data.injection).toEqual({
      mode: 'keyword',
      keywords: ['Swell of the Vale', 'Swell'],
      priority: 0,
    })
    // Engine-owned mechanics must not be rewritten by AI lore management.
    expect(data.loreManagementBlacklisted).toBe(true)
    expect(data.createdBy).toBe('ai')
  })
})
