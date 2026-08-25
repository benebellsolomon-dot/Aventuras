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
    expect(out).toMatch(/current clothing \(.*\): rain-soaked halter top/)
    expect(out).not.toContain('Nobody')
  })
  it('leads with the locked identity bank as anchors when the character has one', () => {
    const banked = {
      ...amelia,
      imageTags: 'long hair, straight hair, blonde hair, yellow eyes, fair skin',
    } as Character
    const out = buildProseSubjectDossier([banked], ['Amelia'], false)
    expect(out).toContain('identity anchors (locked')
    expect(out.indexOf('identity anchors')).toBeLessThan(out.indexOf('appearance:'))
    expect(out).toContain('current clothing (what she wore as the beat began')
    expect(buildProseSubjectDossier([amelia], ['Amelia'], false)).not.toContain('identity anchors')
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

// ============================================================================
// Chroma family (research/64 §3h–§3l)
// ============================================================================

import { defaultBodyState, BODY_STATE_KEY } from '$lib/services/be'
import { buildEncoderNotes, chromaSizeClause } from './prosePromptWriter'

function withTier(tier: number): Character['metadata'] {
  return { [BODY_STATE_KEY]: defaultBodyState(tier) } as Character['metadata']
}

describe('chromaSizeClause', () => {
  it('maps the BE band words onto the validated prose ladder', () => {
    expect(chromaSizeClause(withTier(6))).toContain('natural handful')
    expect(chromaSizeClause(withTier(50))).toContain('filling her lap')
  })

  it('NEVER emits the word "hyper" (rare tag, weaker than gigantic on Chroma)', () => {
    for (const tier of [1, 6, 15, 25, 35, 45, 50, 51]) {
      expect(chromaSizeClause(withTier(tier)) ?? '').not.toMatch(/hyper/i)
    }
  })

  it('null without body state', () => {
    expect(chromaSizeClause({} as Character['metadata'])).toBeNull()
  })
})

describe('buildEncoderNotes', () => {
  it('chroma gets the measured encoder rules', () => {
    const notes = buildEncoderNotes('chroma')
    expect(notes).toContain('ONE subject per sentence')
    expect(notes).toContain('AFFIRMATIVELY')
    expect(notes).toContain('occupation and contact')
  })

  it('empty for every other prose family (krea path byte-identical)', () => {
    expect(buildEncoderNotes('krea')).toBe('')
    expect(buildEncoderNotes('prose')).toBe('')
  })
})

describe('buildProseSubjectDossier — chroma size line', () => {
  const withState = {
    ...amelia,
    metadata: withTier(6),
  } as unknown as Character

  it('adds the plain-words size clause only for the chroma family in BE mode', () => {
    const chroma = buildProseSubjectDossier([withState], ['Amelia'], true, 'chroma')
    expect(chroma).toContain('size in plain words')
    const krea = buildProseSubjectDossier([withState], ['Amelia'], true, 'krea')
    expect(krea).not.toContain('size in plain words')
    const dflt = buildProseSubjectDossier([withState], ['Amelia'], true)
    expect(dflt).not.toContain('size in plain words')
  })
})
