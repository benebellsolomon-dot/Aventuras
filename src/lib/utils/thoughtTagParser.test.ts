// E6 NPC inner voices (research/65): extraction, caps, malformed tags, and the
// streaming-safety probe that keeps a half-written tag out of the reader.
import { describe, expect, it } from 'vitest'

import {
  THOUGHT_MAX_PER_TURN,
  THOUGHT_TEXT_MAX,
  THOUGHT_WHO_MAX,
  extractThoughtTags,
  hasIncompleteThoughtTag,
  hasThoughtTags,
  stripThoughtTags,
} from './thoughtTagParser'

describe('extractThoughtTags', () => {
  it('extracts who and text from a well-formed tag', () => {
    const out = extractThoughtTags(
      'She smiles.\n<thought who="Mira">He has no idea I read the letter.</thought>',
    )
    expect(out).toEqual([{ who: 'Mira', text: 'He has no idea I read the letter.' }])
  })

  it('accepts single-quoted attributes and mixed-case tags', () => {
    const out = extractThoughtTags(`<THOUGHT WHO='Mira'>Not tonight.</Thought>`)
    expect(out).toEqual([{ who: 'Mira', text: 'Not tonight.' }])
  })

  it('trims surrounding whitespace on who and text', () => {
    const out = extractThoughtTags('<thought who="  Mira  ">\n  Run.\n</thought>')
    expect(out).toEqual([{ who: 'Mira', text: 'Run.' }])
  })

  it('returns plain text without decoding or escaping entities', () => {
    const out = extractThoughtTags('<thought who="Mira">5 &lt; 6 &amp; I know it.</thought>')
    expect(out[0].text).toBe('5 &lt; 6 &amp; I know it.')
  })

  it('caps the number of thoughts per entry', () => {
    const content = Array.from(
      { length: THOUGHT_MAX_PER_TURN + 2 },
      (_, i) => `<thought who="N${i}">line ${i}</thought>`,
    ).join('\n')
    const out = extractThoughtTags(content)
    expect(out).toHaveLength(THOUGHT_MAX_PER_TURN)
    expect(out[0].who).toBe('N0')
  })

  it('truncates who and text to their caps', () => {
    const out = extractThoughtTags(
      `<thought who="${'W'.repeat(THOUGHT_WHO_MAX + 40)}">${'t'.repeat(THOUGHT_TEXT_MAX + 200)}</thought>`,
    )
    expect(out[0].who).toHaveLength(THOUGHT_WHO_MAX)
    expect(out[0].text).toHaveLength(THOUGHT_TEXT_MAX)
  })

  it('drops tags with no who attribute, an empty who, or empty text', () => {
    expect(extractThoughtTags('<thought>orphan</thought>')).toEqual([])
    expect(extractThoughtTags('<thought who="">orphan</thought>')).toEqual([])
    expect(extractThoughtTags('<thought who="Mira">   </thought>')).toEqual([])
  })

  it('keeps the valid tags around a malformed one', () => {
    const out = extractThoughtTags(
      '<thought>nobody</thought><thought who="Mira">mine</thought><thought who="Kell">his</thought>',
    )
    expect(out).toEqual([
      { who: 'Mira', text: 'mine' },
      { who: 'Kell', text: 'his' },
    ])
  })

  it('finds nothing in plain prose', () => {
    expect(extractThoughtTags('She thought about it.')).toEqual([])
  })
})

describe('stripThoughtTags', () => {
  it('removes a well-formed tag and leaves the prose', () => {
    const out = stripThoughtTags('She smiles.\n<thought who="Mira">Not tonight.</thought>')
    expect(out.trim()).toBe('She smiles.')
  })

  it('removes malformed who-less tags too', () => {
    expect(stripThoughtTags('Prose.<thought>nobody</thought>').trim()).toBe('Prose.')
  })

  it('removes a dangling opening tag from a truncated stream', () => {
    expect(stripThoughtTags('Prose.\n<thought who="Mira">half a th').trim()).toBe('Prose.')
    expect(stripThoughtTags('Prose.\n<thought who="Mi').trim()).toBe('Prose.')
  })

  it('leaves content without thought tags untouched', () => {
    const content = 'She smiles.\n<pic prompt="a long enough prompt" characters=""></pic>'
    expect(stripThoughtTags(content)).toBe(content)
  })
})

describe('hasThoughtTags', () => {
  it('is true only for a complete tag', () => {
    expect(hasThoughtTags('<thought who="Mira">x</thought>')).toBe(true)
    expect(hasThoughtTags('<thought who="Mira">x')).toBe(false)
    expect(hasThoughtTags('nothing here')).toBe(false)
  })
})

describe('hasIncompleteThoughtTag', () => {
  it('reports complete content as safe to the end', () => {
    const content = 'Prose.<thought who="Mira">done</thought>'
    expect(hasIncompleteThoughtTag(content)).toEqual({
      incomplete: false,
      safeEnd: content.length,
    })
  })

  it('reports no tags as safe to the end', () => {
    expect(hasIncompleteThoughtTag('just prose')).toEqual({ incomplete: false, safeEnd: 10 })
  })

  it('holds back at the opening tag while a tag is mid-stream', () => {
    const content = 'Prose.\n<thought who="Mira">half a th'
    const result = hasIncompleteThoughtTag(content)
    expect(result.incomplete).toBe(true)
    expect(content.slice(0, result.safeEnd)).toBe('Prose.\n')
  })

  it('only holds back the LAST tag when earlier ones closed', () => {
    const content = '<thought who="A">one</thought>\n<thought who="B">two'
    const result = hasIncompleteThoughtTag(content)
    expect(result.incomplete).toBe(true)
    expect(content.slice(0, result.safeEnd)).toBe('<thought who="A">one</thought>\n')
  })
})

describe('review follow-ups (research/65)', () => {
  it('leaves an unclosed tag mid-content alone instead of eating the prose after it', () => {
    const text = 'Prose one. <thought who="X">oops unclosed. ' + 'Prose two continues. '.repeat(60)
    expect(stripThoughtTags(text)).toBe(text)
    expect(stripThoughtTags('The sign read: <thought for later> and more')).toBe(
      'The sign read: <thought for later> and more',
    )
  })
  it('tolerates a spaced close tag and an unquoted who', () => {
    expect(stripThoughtTags('A <thought who="X">hm</Thought > B')).toBe('A  B')
    expect(extractThoughtTags('<thought who=Mira>quiet</thought>')).toEqual([
      { who: 'Mira', text: 'quiet' },
    ])
  })
  it('holds back a trailing partial prefix during streaming', () => {
    expect(hasIncompleteThoughtTag('she smiled.\n\n<thoug')).toEqual({
      incomplete: true,
      safeEnd: 13,
    })
    expect(stripThoughtTags('she smiled. <th')).toBe('she smiled. ')
  })
})
