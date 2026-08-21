/**
 * Tests for the LLM-fed image-instruction reinforcement blocks (research/55
 * component E): current clothing (current-over-baseline precedence) and
 * current location, both appended to the <pic> instructions so the
 * prompt-writing LLM states each present character's actual outfit and the
 * actual scene instead of guessing or omitting them.
 */
import { describe, it, expect, vi } from 'vitest'

// NarrativeService pulls in reactive Svelte stores transitively (the settings
// store directly, and the SDK's fetch provider via debug.svelte); the
// standalone vitest config runs pure TS with no Svelte compiler, so both must
// be mocked to import the module under test at all. Neither mock is exercised
// by the tests below — they only cover the new pure reinforcement-block
// builders and buildInlineImageInstructions.
vi.mock('$lib/stores/settings.svelte', () => ({
  settings: {
    systemServicesSettings: { imageGeneration: { profileId: '' } },
    getImageProfile: () => undefined,
  },
}))
vi.mock('../sdk/generate', () => ({
  streamNarrative: vi.fn(),
  generateNarrative: vi.fn(),
}))

import {
  NarrativeService,
  buildCurrentClothingReinforcementBlock,
  buildCurrentLocationReinforcementBlock,
  buildInlineImageInstructions,
} from './NarrativeService'
import type { Character, Location, StoryEntry } from '$lib/types'

function char(name: string, opts: { clothing?: string; currentClothing?: string } = {}): Character {
  return {
    name,
    metadata: null,
    visualDescriptors: opts.clothing !== undefined ? { clothing: opts.clothing } : {},
    currentVisualDescriptors:
      opts.currentClothing !== undefined ? { clothing: opts.currentClothing } : null,
  } as unknown as Character
}

function location(name: string, description?: string | null): Location {
  return {
    name,
    description: description ?? null,
  } as unknown as Location
}

describe('buildCurrentClothingReinforcementBlock', () => {
  it('states the baseline outfit when no current override exists', () => {
    const block = buildCurrentClothingReinforcementBlock([
      char('Lucy', { clothing: 'blue sundress' }),
    ])
    expect(block).toContain('CURRENT CLOTHING')
    expect(block).toContain('Lucy: blue sundress')
  })

  it('prefers current clothing over the baseline outfit', () => {
    const block = buildCurrentClothingReinforcementBlock([
      char('Lucy', {
        clothing: 'blue sundress',
        currentClothing: 'torn work dress, popped buttons',
      }),
    ])
    expect(block).toContain('Lucy: torn work dress, popped buttons')
    expect(block).not.toContain('blue sundress')
  })

  it('is empty when a character has neither current nor baseline clothing', () => {
    const block = buildCurrentClothingReinforcementBlock([char('Lucy')])
    expect(block).toBe('')
  })

  it('is empty for an empty character list', () => {
    expect(buildCurrentClothingReinforcementBlock([])).toBe('')
  })

  it('skips characters with no clothing data while including the rest', () => {
    const block = buildCurrentClothingReinforcementBlock([
      char('Lucy', { clothing: 'blue sundress' }),
      char('Zaria'),
    ])
    expect(block).toContain('Lucy: blue sundress')
    expect(block).not.toContain('Zaria')
  })
})

describe('buildCurrentLocationReinforcementBlock', () => {
  it('renders name and description when both are present', () => {
    const block = buildCurrentLocationReinforcementBlock(
      location('The Whispering Woods', 'A dense, fog-shrouded forest.'),
    )
    expect(block).toContain('CURRENT LOCATION')
    expect(block).toContain('The Whispering Woods — A dense, fog-shrouded forest.')
  })

  it('renders just the name when there is no description', () => {
    const block = buildCurrentLocationReinforcementBlock(location('The Tavern'))
    const lines = block.trim().split('\n')
    expect(lines.at(-1)).toBe('The Tavern')
  })

  it('is empty when no location is given', () => {
    expect(buildCurrentLocationReinforcementBlock(undefined)).toBe('')
    expect(buildCurrentLocationReinforcementBlock(null)).toBe('')
  })
})

describe('buildInlineImageInstructions', () => {
  it('appends clothing and location blocks to the booru instructions', () => {
    const result = buildInlineImageInstructions(
      'booru',
      [char('Lucy', { currentClothing: 'naked' })],
      location('Bathhouse', 'Steam curls off the water.'),
    )
    expect(result).toContain('CURRENT CLOTHING')
    expect(result).toContain('Lucy: naked')
    expect(result).toContain('CURRENT LOCATION')
    expect(result).toContain('Bathhouse — Steam curls off the water.')
    // Reinforcement blocks land before the closing tag.
    expect(result.indexOf('CURRENT LOCATION')).toBeLessThan(result.indexOf('</InlineImages>'))
  })

  it('omits the location parameter without error (backward-safe)', () => {
    const result = buildInlineImageInstructions('prose', [char('Lucy', { clothing: 'robe' })])
    expect(result).toContain('CURRENT CLOTHING')
    expect(result).not.toContain('CURRENT LOCATION')
  })

  it('does not duplicate the existing body-state block', () => {
    const result = buildInlineImageInstructions('booru', [char('Lucy', { clothing: 'robe' })])
    const occurrences = result.split('CURRENT BODY STATE').length - 1
    expect(occurrences).toBeLessThanOrEqual(1)
  })
})

describe('buildUserPrompt — turn-directive placement (research/61 + 62)', () => {
  const service = new NarrativeService()
  type Directives = { offScreenBlock: string; worldEventBlock: string; callbackBlock: string }
  // TS-private, runtime-accessible: the placement contract is exactly what the
  // review demanded a pin for, and the method is pure string assembly.
  const build = (postHistoryBlock: string, turnDirectives: Directives | null): string =>
    (
      service as unknown as {
        buildUserPrompt: (
          entries: StoryEntry[],
          mode: 'adventure' | 'creative-writing',
          inlineImageMode: boolean,
          postHistoryBlock: string,
          pendingCheck: null,
          turnDirectives: Directives | null,
        ) => string
      }
    ).buildUserPrompt(
      [{ id: 'e1', type: 'user_action', content: 'look around' } as unknown as StoryEntry],
      'adventure',
      false,
      postHistoryBlock,
      null,
      turnDirectives,
    )

  it('no directives → byte-identical to the pre-Phase-3 prompt (cache guard)', () => {
    const before = build('house rules', null)
    const withEmpty = build('house rules', {
      offScreenBlock: '',
      worldEventBlock: '',
      callbackBlock: '',
    })
    expect(withEmpty).toBe(before)
    expect(before).not.toContain('[OFF-SCREEN')
    expect(before).not.toContain('[CALLBACK')
  })

  it('renders [OFF-SCREEN], [WORLD EVENT], then [CALLBACK] after [Narrative Directives], before the tail', () => {
    const prompt = build('house rules', {
      offScreenBlock: '[OFF-SCREEN — the world keeps moving]\n- Mira — away: resting.',
      worldEventBlock: '[WORLD EVENT — background texture, advisory]\nA knock at the door.',
      callbackBlock: '[CALLBACK — an earlier thread resurfaces]\nEarlier: the locked drawer.',
    })
    const directives = prompt.indexOf('[Narrative Directives]')
    const offScreen = prompt.indexOf('[OFF-SCREEN')
    const worldEvent = prompt.indexOf('[WORLD EVENT')
    const callback = prompt.indexOf('[CALLBACK')
    const tail = prompt.indexOf('Continue the narrative:')
    expect(directives).toBeGreaterThanOrEqual(0)
    expect(offScreen).toBeGreaterThan(directives)
    expect(worldEvent).toBeGreaterThan(offScreen)
    expect(callback).toBeGreaterThan(worldEvent)
    expect(tail).toBeGreaterThan(callback)
  })
})
