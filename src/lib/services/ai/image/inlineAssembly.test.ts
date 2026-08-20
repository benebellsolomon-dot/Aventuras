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

  it('weights the band word for booru models on a weighting-capable provider', () => {
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
      providerType: 'comfyui' as const,
      model: 'wai-illustrious-sdxl',
      presentCharacters: [lucy],
      tagPrompt: '1girl, huge breasts, garden',
      tagCharacters: ['Lucy'],
    })
    // Base 1.20 holds the band against SD's pull toward its default size; tier
    // 28 sits 6/8 through the huge band (22–29), adding 0.08 of the 0.10 span.
    expect(result.fullPrompt).toContain('(huge breasts:1.28)')
  })

  it('weights the band word at the base weight even at a band floor', () => {
    const lucy = {
      name: 'Lucy',
      loraConfig: null,
      metadata: writeBodyState(null, defaultBodyState(22)),
      visualDescriptors: {},
    } as unknown as Character
    const result = assembleInlineImage({
      beMode: true,
      stylePrompt: 'STYLE',
      narrativeText: '',
      providerType: 'comfyui' as const,
      model: 'wai-illustrious-sdxl',
      presentCharacters: [lucy],
      tagPrompt: '1girl, huge breasts, garden',
      tagCharacters: ['Lucy'],
    })
    // The old formula emitted a bare "huge breasts" here (weight 1.00) and the
    // size never landed — the whole point of a constant base.
    expect(result.fullPrompt).toContain('(huge breasts:1.20)')
  })

  it('leaves the plain band word for a provider that does not parse A1111 weighting', () => {
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
    expect(result.fullPrompt).toContain('huge breasts')
    expect(result.fullPrompt).not.toContain('(huge breasts:1.15)')
    expect(result.fullPrompt).not.toMatch(/\(huge breasts:[\d.]+\)/)
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

  // research/56: the live failure was a two-character bed paizuri scene that
  // rendered as a standing hallway shirt-lift — the action and setting tags sat
  // behind two long parenthesized identity clauses, past CLIP's ~75-token
  // attention window. This is the same scene assembled under the new contract.
  describe('two-character booru scene (research/56 reference)', () => {
    /** What `composeBooruScenePrompt` hands assembly for the reference scene. */
    const COMPOSED =
      'explicit, uncensored, detailed anatomy, cowboy shot, 1boy, 1girl, ' +
      'hetero, paizuri, breast squeezing, penis between breasts, lying on back, ' +
      'on the right, muscular, completely nude, ' +
      'on the left, blonde hair, golden eyes, fair skin, slim, wide hips, young adult, huge breasts, open mouth, ' +
      'dark silk bedsheets, ornate manor bedroom, king-sized bed, moonlight through window, night, depth of field'

    const amelia = {
      name: 'Amelia',
      loraConfig: null,
      metadata: writeBodyState(null, {
        ...defaultBodyState(24),
        fluids: { fillPercent: 50, fluidType: 'Milk' },
        arousal: 80,
      }),
      visualDescriptors: {},
    } as unknown as Character
    const rowan = {
      name: 'Rowan',
      loraConfig: null,
      metadata: null,
      visualDescriptors: {},
    } as unknown as Character

    const result = assembleInlineImage({
      beMode: true,
      stylePrompt: 'STYLE',
      narrativeText: 'She pulled him down onto the bed.',
      providerType: 'comfyui' as const,
      model: 'wai-illustrious-sdxl',
      presentCharacters: [amelia, rowan],
      tagPrompt: COMPOSED,
      tagCharacters: ['Amelia', 'Rowan'],
    })

    it('assembles the full prompt with the scene inside the attention window', () => {
      expect(result.fullPrompt).toBe(
        'masterpiece, best quality, highly detailed, ' +
          'explicit, uncensored, detailed anatomy, cowboy shot, 1boy, 1girl, ' +
          'hetero, paizuri, breast squeezing, penis between breasts, lying on back, ' +
          'on the right, muscular, completely nude, ' +
          'on the left, blonde hair, golden eyes, fair skin, slim, wide hips, young adult, ' +
          '(huge breasts:1.23), open mouth, ' +
          'dark silk bedsheets, ornate manor bedroom, king-sized bed, moonlight through window, night, depth of field, ' +
          'lactation, blush, heavy breathing',
      )
    })

    it('keeps the action tags ahead of both identity runs', () => {
      const prompt = result.fullPrompt
      expect(prompt.indexOf('paizuri')).toBeLessThan(prompt.indexOf('muscular'))
      expect(prompt.indexOf('lying on back')).toBeLessThan(prompt.indexOf('blonde hair'))
    })

    it('renders the character runs in count-tag order', () => {
      const prompt = result.fullPrompt
      expect(prompt.indexOf('1boy')).toBeLessThan(prompt.indexOf('1girl'))
      expect(prompt.indexOf('muscular')).toBeLessThan(prompt.indexOf('blonde hair'))
    })

    it('carries no parentheses other than the size weighting', () => {
      expect(result.fullPrompt.match(/\(/g)).toHaveLength(1)
      expect(result.fullPrompt).toContain('(huge breasts:1.23)')
    })

    it('compresses the engine state cues to booru tags', () => {
      expect(result.fullPrompt).toContain('lactation, blush, heavy breathing')
      expect(result.fullPrompt).not.toMatch(/swollen with/i)
      expect(result.fullPrompt).not.toContain('Milk')
    })
  })

  it('flattens a pseudo-regional clause written by the story model itself', () => {
    const result = assembleInlineImage({
      ...BASE,
      presentCharacters: [],
      tagCharacters: [],
      model: 'wai-illustrious-sdxl',
      tagPrompt: '1girl, 1boy, (on the left, 1girl, blonde hair), (on the right, 1boy), bedroom',
    })
    expect(result.fullPrompt).toBe(
      'masterpiece, best quality, highly detailed, ' +
        '1girl, 1boy, on the left, 1girl, blonde hair, on the right, 1boy, bedroom',
    )
  })

  it('keeps a prose model’s parentheses untouched', () => {
    const result = assembleInlineImage({
      ...BASE,
      presentCharacters: [],
      tagCharacters: [],
      model: 'z-image-turbo',
      tagPrompt: 'a woman (on the left, smiling) in a kitchen',
    })
    expect(result.fullPrompt).toBe('a woman (on the left, smiling) in a kitchen. STYLE')
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
