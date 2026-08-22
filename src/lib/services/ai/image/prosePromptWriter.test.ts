import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/stores/settings.svelte', () => ({
  settings: { systemServicesSettings: { imageGeneration: {} }, getServicePresetId: () => null },
}))
vi.mock('$lib/services/database', () => ({ database: {} }))
vi.mock('../sdk/generate', () => ({ generateStructured: vi.fn() }))

import type { Character } from '$lib/types'
import {
  buildProseSubjectDossier,
  capProsePrompt,
  resolveProseScenePrompt,
} from './prosePromptWriter'

const amelia = {
  name: 'Amelia',
  visualDescriptors: {
    face: 'fair skin, flour on one cheek',
    hair: 'long straight blonde hair with bangs',
    eyes: 'yellow eyes',
    build: 'slim, wide hips',
    clothing: 'rain-soaked halter top',
  },
  metadata: {},
} as unknown as Character

describe('buildProseSubjectDossier', () => {
  it('renders appearance + clothing per tagged subject, in tag order, skipping unknown names', () => {
    const out = buildProseSubjectDossier([amelia], ['Amelia', 'Nobody'], false)
    expect(out).toContain('- Amelia:')
    expect(out).toContain('appearance:')
    expect(out).toContain('yellow eyes')
    expect(out).toContain('current clothing: rain-soaked halter top')
    expect(out).not.toContain('Nobody')
  })
  it('falls back to a no-subjects line', () => {
    expect(buildProseSubjectDossier([amelia], [], false)).toMatch(/no named subjects/)
  })
})

describe('capProsePrompt', () => {
  it('collapses whitespace and cuts at a sentence boundary past the ceiling', () => {
    const sentence = 'A young woman stands in the rain by the window. '
    const long = sentence.repeat(60)
    const capped = capProsePrompt(long, 400)
    expect(capped.length).toBeLessThanOrEqual(400)
    expect(capped.endsWith('.')).toBe(true)
    expect(capProsePrompt('  short   prompt  ')).toBe('short prompt')
  })
})

describe('resolveProseScenePrompt gate', () => {
  it('returns the input unchanged for booru models and when no preset is assigned', async () => {
    const input = {
      presentCharacters: [amelia],
      tagCharacterNames: ['Amelia'],
      scenePrompt: 'sensitive, 1girl, solo, long hair',
      narrativeText: 'She stood there.',
      beMode: false,
      model: 'wai-illustrious-sdxl',
    }
    expect(await resolveProseScenePrompt(input)).toBe(input.scenePrompt)
    // Prose model but no preset → writer returns null → unchanged
    expect(await resolveProseScenePrompt({ ...input, model: 'wavespeed-ai/krea-v2/turbo' })).toBe(
      input.scenePrompt,
    )
  })
})
