import { describe, it, expect } from 'vitest'
import { assembleInlineImage } from './inlineAssembly'
import { defaultBodyState, writeBodyState } from '$lib/services/be'
import type { Character, CharacterLoraConfig } from '$lib/types'

function char(name: string, loraConfig?: CharacterLoraConfig): Character {
  // Minimal shape for the assembly path (beMode off → no bodyState needed).
  return {
    name,
    loraConfig: loraConfig ?? null,
    metadata: null,
    visualDescriptors: {},
  } as unknown as Character
}

const BASE = {
  beMode: false,
  stylePrompt: 'STYLE',
  narrativeText: '',
  providerType: 'comfyui' as const,
}

describe('assembleInlineImage', () => {
  it('prepends trigger words for all tagged characters and appends the style', () => {
    const result = assembleInlineImage({
      ...BASE,
      presentCharacters: [char('Lucy', { triggerWords: 'glowmilk' }), char('Zaria')],
      tagPrompt: 'a cozy kitchen',
      tagCharacters: ['Lucy', 'Zaria'],
    })
    expect(result.fullPrompt.startsWith('glowmilk, ')).toBe(true)
    expect(result.fullPrompt.endsWith('. STYLE')).toBe(true)
  })

  it('applies a LoRA file only for a single unambiguous subject', () => {
    const single = assembleInlineImage({
      ...BASE,
      presentCharacters: [char('Lucy', { name: 'lucy.safetensors', baseWeight: 0.9 })],
      tagPrompt: 'portrait',
      tagCharacters: ['Lucy'],
    })
    expect(single.loraOverride).toEqual({
      name: 'lucy.safetensors',
      strengthModel: 0.9,
      strengthClip: 0.9,
    })
  })

  it('applies no LoRA file when two subjects are present (one slot cannot stack)', () => {
    const multi = assembleInlineImage({
      ...BASE,
      presentCharacters: [
        char('Lucy', { name: 'lucy.safetensors' }),
        char('Zaria', { name: 'zaria.safetensors' }),
      ],
      tagPrompt: 'two women talking',
      tagCharacters: ['Lucy', 'Zaria'],
    })
    expect(multi.loraOverride).toBeUndefined()
  })

  it('matches tag names to characters case-insensitively', () => {
    const result = assembleInlineImage({
      ...BASE,
      presentCharacters: [char('Lucy', { name: 'lucy.safetensors' })],
      tagPrompt: 'scene',
      tagCharacters: ['lucy'],
    })
    expect(result.loraOverride?.name).toBe('lucy.safetensors')
  })

  it('uses the booru quality prefix and drops the prose style for booru models', () => {
    const result = assembleInlineImage({
      ...BASE,
      presentCharacters: [],
      tagPrompt: '1girl, solo, red hair',
      tagCharacters: [],
      model: 'wai-illustrious-sdxl',
    })
    expect(result.fullPrompt).toBe(
      'masterpiece, best quality, highly detailed, 1girl, solo, red hair',
    )
  })

  it('keeps the prose style for non-booru models', () => {
    const result = assembleInlineImage({
      ...BASE,
      presentCharacters: [],
      tagPrompt: 'a cozy kitchen',
      tagCharacters: [],
      model: 'z-image-turbo',
    })
    expect(result.fullPrompt).toBe('a cozy kitchen. STYLE')
  })

  it('prefers the exact engine tier for the marker over the text-derived top-of-band guess', () => {
    const lucy = {
      name: 'Lucy',
      loraConfig: null,
      metadata: writeBodyState(null, defaultBodyState(24)),
      visualDescriptors: {},
    } as unknown as Character
    const result = assembleInlineImage({
      beMode: true,
      stylePrompt: 'STYLE',
      narrativeText: '',
      providerType: 'si-bridge' as const,
      presentCharacters: [lucy],
      tagPrompt: 'a woman with huge breasts in a garden',
      tagCharacters: ['Lucy'],
    })
    // Text-derived would say __betier_29__ (top of "huge"); the engine tier is 24.
    expect(result.fullPrompt.startsWith('__betier_24__ ')).toBe(true)
  })

  it('applies within-band emphasis on the band word for booru models', () => {
    const lucy = {
      name: 'Lucy',
      loraConfig: null,
      metadata: writeBodyState(null, defaultBodyState(28)),
      visualDescriptors: {},
    } as unknown as Character
    const result = assembleInlineImage({
      beMode: true,
      stylePrompt: 'STYLE',
      narrativeText: '',
      providerType: 'nanogpt' as const,
      model: 'wai-illustrious-sdxl',
      presentCharacters: [lucy],
      tagPrompt: '1girl, huge breasts, garden',
      tagCharacters: ['Lucy'],
    })
    // Tier 28 sits 6/8 through the huge band (22–29) → weight 1.15.
    expect(result.fullPrompt).toContain('(huge breasts:1.15)')
  })

  it('emits the size-band marker only for providers that parse it', () => {
    const input = {
      ...BASE,
      presentCharacters: [],
      tagPrompt: 'a woman with huge breasts in a garden',
      tagCharacters: [],
    }
    const bridge = assembleInlineImage({ ...input, providerType: 'si-bridge' as const })
    const nano = assembleInlineImage({ ...input, providerType: 'nanogpt' as const })
    expect(bridge.fullPrompt).toMatch(/^__betier_\d+__ /)
    expect(nano.fullPrompt).not.toContain('__betier_')
  })

  // research/49 R6: the prompt writer's reinforcement block advertises the
  // APPARENT band word + anchor for an engorged girl. Grounding at the real
  // tier used to rewrite that word smaller while the apparent anchor stayed —
  // one prompt, two sizes.
  it('grounds an engorged subject at her apparent tier, matching the reinforcement block', () => {
    const engorged = {
      name: 'Lucy',
      loraConfig: null,
      metadata: writeBodyState(null, {
        ...defaultBodyState(21),
        fluids: { fillPercent: 90, fluidType: 'milk' },
      }),
      visualDescriptors: {},
    } as unknown as Character
    const result = assembleInlineImage({
      beMode: true,
      stylePrompt: 'STYLE',
      narrativeText: '',
      providerType: 'comfyui' as const,
      presentCharacters: [engorged],
      tagPrompt: 'a woman with large breasts in a garden',
      tagCharacters: ['Lucy'],
    })
    // Tier 21 is the top of "large"; engorged reads one tier larger → "huge".
    expect(result.fullPrompt).toContain('huge breasts')
    expect(result.fullPrompt).not.toContain('large breasts')
  })

  it('leaves a non-engorged subject grounded at her real tier', () => {
    const settled = {
      name: 'Lucy',
      loraConfig: null,
      metadata: writeBodyState(null, defaultBodyState(21)),
      visualDescriptors: {},
    } as unknown as Character
    const result = assembleInlineImage({
      beMode: true,
      stylePrompt: 'STYLE',
      narrativeText: '',
      providerType: 'comfyui' as const,
      presentCharacters: [settled],
      tagPrompt: 'a woman with huge breasts in a garden',
      tagCharacters: ['Lucy'],
    })
    expect(result.fullPrompt).toContain('large breasts')
    expect(result.fullPrompt).not.toContain('huge breasts')
  })

  // The apparent bump keeps beTier's uniformity contract: one engorged girl
  // crossing the band boundary must not inflate her non-engorged co-subject —
  // a mixed pair falls back to the shared real band word.
  it('falls back to the real band when one of two co-subjects engorges across the boundary', () => {
    const engorged = {
      name: 'Lucy',
      loraConfig: null,
      metadata: writeBodyState(null, {
        ...defaultBodyState(21),
        fluids: { fillPercent: 90, fluidType: 'milk' },
      }),
      visualDescriptors: {},
    } as unknown as Character
    const settled = {
      name: 'Mira',
      loraConfig: null,
      metadata: writeBodyState(null, defaultBodyState(21)),
      visualDescriptors: {},
    } as unknown as Character
    const result = assembleInlineImage({
      beMode: true,
      stylePrompt: 'STYLE',
      narrativeText: '',
      providerType: 'si-bridge' as const,
      presentCharacters: [engorged, settled],
      tagPrompt: 'two women with large breasts in a garden',
      tagCharacters: ['Lucy', 'Mira'],
    })
    expect(result.fullPrompt).toContain('large breasts')
    expect(result.fullPrompt).not.toContain('huge breasts')
    // The marker agrees with the grounded word (real tier 21, not apparent 22+).
    expect(result.fullPrompt).toContain('__betier_21__')
  })
})
