import { describe, expect, it } from 'vitest'

import { hasDressStateTag, inferImpliedDressState } from './dressState'

describe('inferImpliedDressState', () => {
  it('reads the two live intents as nude', () => {
    expect(
      inferImpliedDressState(
        'one woman: a young adult with long straight blonde hair, standing bare and pressed against a man, her hand resting on his belt buckle',
      ),
    ).toBe('nude')
    expect(
      inferImpliedDressState(
        'sitting bare on a wooden crate in a dusty attic, legs open in invitation, hands braced on either side of her',
      ),
    ).toBe('nude')
  })

  it('reads whole-body exposure words and phrasings', () => {
    for (const text of [
      'she is naked on the bed',
      'a nude woman by the window',
      'she lies bare on the furs',
      'completely bare, she steps into the water',
      'without a stitch on',
      'her clothes on the floor, she kneels',
    ]) {
      expect(inferImpliedDressState(text), text).toBe('nude')
    }
  })

  it('reads torso-only and lower-only exposure as topless / bottomless', () => {
    expect(
      inferImpliedDressState('her halter top pulled down, breasts exposed to the lamplight'),
    ).toBe('topless')
    expect(inferImpliedDressState('bare-chested, he grips the rail')).toBe('topless')
    expect(inferImpliedDressState('her skirt around her ankles, bare bottom on the desk')).toBe(
      'bottomless',
    )
  })

  it('ignores ambiguous or idiomatic bare/naked uses', () => {
    for (const text of [
      'bare shoulders under a wool shawl',
      'bare feet on cold stone, wrapped in a cloak',
      'her bare thighs below a hiked skirt',
      'the naked truth of it hangs between them',
      'bare-handed, he lifts the crate',
      'half-undressed, her blouse still buttoned',
      'a clothed conversation over tea',
    ]) {
      expect(inferImpliedDressState(text), text).toBeNull()
    }
  })

  it('lets a whole-body phrase win over a torso one', () => {
    expect(inferImpliedDressState('naked, breasts exposed, she waits')).toBe('nude')
  })
})

describe('hasDressStateTag', () => {
  it('accepts nudity and clothes-displaced tags, case-insensitively', () => {
    expect(hasDressStateTag(['long hair', 'Completely Nude', 'medium breasts'])).toBe(true)
    expect(hasDressStateTag(['long hair', 'halter top', 'clothes pull'])).toBe(true)
    expect(hasDressStateTag(['long hair', 'open shirt'])).toBe(true)
  })
  it('rejects a run with only clothing or a clothed assertion', () => {
    expect(hasDressStateTag(['long hair', 'damp halter top', 'clothed'])).toBe(false)
    expect(hasDressStateTag([])).toBe(false)
  })
})
