// ---- Story templates: FF5.2 prose package branches (research/59 steps 4-6) ----
// Renders the real adventure/creative-writing templates through the real
// LiquidJS engine and asserts the proseStyle / hybrid-POV / responseLength
// branches produce the expected content with no Liquid errors.
import { describe, expect, it } from 'vitest'

import { templateEngine } from '$lib/services/templates/engine'
import { storyTemplates } from './narrative'

const adventure = storyTemplates.find((t) => t.id === 'adventure')!
const creativeWriting = storyTemplates.find((t) => t.id === 'creative-writing')!

/** Minimal render context; optional blocks default to empty strings. */
const baseContext = {
  pov: 'second',
  tense: 'present',
  protagonistName: 'Mira',
  genre: '',
  tone: '',
  settingDescription: '',
  themes: '',
  contentGuidelines: '',
  proseStyle: 'cinematic',
  responseLengthGuidance: 'Around 250 words per response',
  visualProseMode: false,
  inlineImageMode: false,
  beStateBlock: '',
  beGenreRules: '',
  playerSheetBlock: '',
  storyTime: '',
  tieredContextBlock: '',
  chapterSummaries: '',
  styleGuidance: '',
}

const render = (content: string, overrides: Record<string, unknown> = {}): string => {
  const result = templateEngine.render(content, { ...baseContext, ...overrides })
  expect(result).not.toBeNull()
  return result as string
}

describe('adventure template — prose style', () => {
  it('defaults to the cinematic arm', () => {
    const out = render(adventure.content)
    expect(out).toContain('observable details')
    expect(out).not.toContain('high pathos')
  })

  it('renders the cinematic arm when proseStyle is missing entirely (legacy stories)', () => {
    const context: Partial<typeof baseContext> = { ...baseContext }
    delete context.proseStyle
    const out = templateEngine.render(adventure.content, context)
    expect(out).not.toBeNull()
    expect(out).toContain('observable details')
  })

  it('renders the literary arm on proseStyle=literary', () => {
    const out = render(adventure.content, { proseStyle: 'literary' })
    expect(out).toContain('high pathos')
    expect(out).not.toContain('observable details, not interpretation')
  })
})

describe('adventure template — FF behavior sections', () => {
  it('carries anti-echo, bold-NPC, knowledge, inner-life, and genesis rules', () => {
    const out = render(adventure.content)
    expect(out).toContain('Never quote, paraphrase, or echo')
    expect(out).toContain('no plot armor')
    expect(out).toContain('120 degrees')
    expect(out).toContain('# NPC Inner Life')
    expect(out).toContain('# Introducing New Characters')
    expect(out).toContain('Diction friction')
    expect(out).toContain('Apophasis')
  })

  it('keeps the legacy style rules in both prose arms', () => {
    for (const proseStyle of ['cinematic', 'literary']) {
      const out = render(adventure.content, { proseStyle })
      expect(out).toContain('One metaphor or simile per paragraph maximum')
      expect(out).toContain('Favor strong, specific verbs')
      expect(out).toContain('Ground all description in what Mira perceives')
    }
  })

  it('injects the response length guidance', () => {
    const out = render(adventure.content, {
      responseLengthGuidance: '400-600 words per response, across 4-8 paragraphs',
    })
    expect(out).toContain('Length: 400-600 words per response')
  })
})

describe('adventure template — POV branches', () => {
  it('hybrid renders both style and response instructions', () => {
    const out = render(adventure.content, { pov: 'hybrid' })
    expect(out).toContain('HYBRID POV')
    expect(out).toContain('SECOND PERSON ("you"): texture, pressure, temperature')
    expect(out).toContain('the sensations belong to the player')
  })

  it('hybrid past tense renders the past-tense arm', () => {
    const out = render(adventure.content, { pov: 'hybrid', tense: 'past' })
    expect(out).toContain('PAST TENSE, HYBRID POV')
  })

  it('second and third person arms still render', () => {
    expect(render(adventure.content, { pov: 'second' })).toContain('SECOND PERSON')
    expect(render(adventure.content, { pov: 'third' })).toContain('THIRD PERSON')
  })
})

describe('creative-writing template', () => {
  it('defaults to the cinematic arm and renders length guidance', () => {
    const out = render(creativeWriting.content, {
      pov: 'third',
      responseLengthGuidance: 'Up to 500 words per response',
    })
    expect(out).toContain('Ground the narration in the observable')
    expect(out).toContain('Length: Up to 500 words per response')
    expect(out).toContain('Diction friction')
  })

  it('renders the literary arm on proseStyle=literary', () => {
    const out = render(creativeWriting.content, { pov: 'first', proseStyle: 'literary' })
    expect(out).toContain('high pathos')
  })

  it('hybrid pov falls back to the third-person response arm without error', () => {
    const out = render(creativeWriting.content, { pov: 'hybrid' })
    expect(out).toContain('Use THIRD PERSON for all characters')
  })
})
