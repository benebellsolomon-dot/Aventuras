/**
 * Tests for the si-bridge clothing precedence fix (research/55 component E):
 * `buildStructuredImageSpec` must prefer a character's current outfit over
 * the baseline `visualDescriptors.clothing` when both are present, and fall
 * back to baseline when there is no current override.
 */
import { describe, it, expect } from 'vitest'
import { buildStructuredImageSpec, type BridgeSpecSubject } from './bridgeSpec'
import { defaultBodyState, writeBodyState } from '$lib/services/be'

function subject(
  name: string,
  opts: { clothing?: string; currentClothing?: string } = {},
): BridgeSpecSubject {
  return {
    name,
    metadata: writeBodyState(null, defaultBodyState(24)),
    visualDescriptors: opts.clothing !== undefined ? { clothing: opts.clothing } : {},
    currentVisualDescriptors:
      opts.currentClothing !== undefined ? { clothing: opts.currentClothing } : null,
  }
}

const BASE = {
  sceneText: 'a quiet garden',
  narrativeText: '',
}

describe('buildStructuredImageSpec clothing precedence', () => {
  it('uses the baseline outfit when there is no current override', () => {
    const spec = buildStructuredImageSpec({
      ...BASE,
      presentCharacters: [subject('Lucy', { clothing: 'blue sundress' })],
      tagCharacterNames: ['Lucy'],
    })
    expect(spec?.scene_tags).toContain('Lucy wearing blue sundress')
  })

  it('prefers the current outfit over the baseline outfit', () => {
    const spec = buildStructuredImageSpec({
      ...BASE,
      presentCharacters: [
        subject('Lucy', { clothing: 'blue sundress', currentClothing: 'torn work dress' }),
      ],
      tagCharacterNames: ['Lucy'],
    })
    expect(spec?.scene_tags).toContain('Lucy wearing torn work dress')
    expect(spec?.scene_tags).not.toContain('Lucy wearing blue sundress')
  })

  it('emits no clothing scene tag when neither current nor baseline clothing is set', () => {
    const spec = buildStructuredImageSpec({
      ...BASE,
      presentCharacters: [subject('Lucy')],
      tagCharacterNames: ['Lucy'],
    })
    expect((spec?.scene_tags ?? []).some((t) => t.startsWith('Lucy wearing'))).toBe(false)
  })
})
