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
})
