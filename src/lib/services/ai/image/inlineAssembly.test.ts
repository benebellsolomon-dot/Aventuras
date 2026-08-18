import { describe, it, expect } from 'vitest'
import { assembleInlineImage } from './inlineAssembly'
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
})
