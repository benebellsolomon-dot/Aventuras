/** Absolute growth rule (research/66): trigger evidence verification. */
import { describe, expect, it } from 'vitest'

import {
  GROWTH_TRIGGER_MIN_EVIDENCE_WORDS,
  growthGateRequired,
  normalizeEvidenceText,
  normalizeTriggerName,
  projectForMatch,
  verifyGrowthTriggers,
} from './trigger'

const NARRATION = `<p><span style="color: #e8b64c;">"Now,"</span> she says — and he spends himself <em>inside her</em>, every pulse of it <em>pressed</em> into her body.</p>
<p>She shudders.&nbsp;Later&hellip; she sleeps. <span style="color: #e8b64c;">"When he finishes inside her, she always grows," she tells the dark.</span></p>
<thought who="Amelia">I hope it took.</thought>
<pic prompt="he finishes inside her, seed spilling > her thighs" characters="Amelia" rating="explicit"></pic>`

const names = (v: ReturnType<typeof verifyGrowthTriggers>) => [...v.verified]
const reasons = (v: ReturnType<typeof verifyGrowthTriggers>) => v.rejected.map((r) => r.reason)

describe('growthGateRequired', () => {
  it('is on exactly when the story states a cosmology', () => {
    expect(growthGateRequired({ beGrowthCosmology: "Player's semen when ejaculated" })).toBe(true)
    expect(growthGateRequired({ beGrowthCosmology: '   ' })).toBe(false)
    expect(growthGateRequired({})).toBe(false)
    expect(growthGateRequired(null)).toBe(false)
    expect(growthGateRequired({ beGrowthCosmology: 42 })).toBe(false)
  })
})

describe('normalizeEvidenceText / projectForMatch', () => {
  it('strips tags, decodes named + numeric entities, flattens typographic punctuation, lowercases', () => {
    expect(
      normalizeEvidenceText('<p>“Now,” she says &#8212; and&nbsp;<em>he</em> spends&#8230;</p>'),
    ).toBe('"now," she says - and he spends...')
    expect(normalizeEvidenceText('a &amp;lt; b')).toBe('a &lt; b')
  })

  it('removes <pic> tags (even with > inside an attribute), <thought> voices, and style blocks', () => {
    const out = normalizeEvidenceText(NARRATION + '<style>.x{color:red}</style>')
    expect(out).not.toContain('seed spilling')
    expect(out).not.toContain('her thighs')
    expect(out).not.toContain('i hope it took')
    expect(out).not.toContain('color:red')
    expect(out).toContain('he spends himself inside her')
  })

  it('a <pic> open tag followed by prose and a later </pic> does not swallow the prose (review F2)', () => {
    const out = normalizeEvidenceText(
      '<pic prompt="a"><p>He spends himself inside her and she shakes.</p><pic prompt="b"></pic>',
    )
    expect(out).toContain('he spends himself inside her and she shakes')
  })

  it('projection is punctuation/markup-insensitive: an <em> abutting a comma cannot fail a quote (review F1/A1)', () => {
    const page = projectForMatch(
      normalizeEvidenceText('<p>He spent himself <em>inside</em>, and she felt it take.</p>'),
    )
    const quote = projectForMatch(
      normalizeEvidenceText('He spent himself inside, and she felt it take.'),
    )
    expect(page.includes(quote)).toBe(true)
  })
})

describe('verifyGrowthTriggers', () => {
  it('accepts a verbatim narration quote about her (HTML, curly quotes, zero-width chars on the page)', () => {
    const v = verifyGrowthTriggers(
      [
        {
          character: ' Amelia ',
          evidence: 'he spends himself inside her, every pulse of it pressed into her body',
        },
      ],
      NARRATION.replace('pulse', 'pul​se'),
    )
    expect(names(v)).toEqual(['amelia'])
    expect(v.rejected).toEqual([])
  })

  it('rejects a paraphrase, a quote only in the <pic> description, a too-short quote, an empty name', () => {
    const v = verifyGrowthTriggers(
      [
        { character: 'Amelia', evidence: 'he finished inside her and she grew bigger' },
        { character: 'Brielle', evidence: 'he finishes inside her, seed spilling > her thighs' },
        { character: 'Cora', evidence: 'she sleeps now' },
        { character: '  ', evidence: 'he spends himself inside her, every pulse of it' },
      ],
      NARRATION,
    )
    expect(v.verified.size).toBe(0)
    expect(reasons(v)).toEqual(['not_on_page', 'not_on_page', 'too_short', 'empty_name'])
    expect('she sleeps now'.split(' ').length).toBeLessThan(GROWTH_TRIGGER_MIN_EVIDENCE_WORDS)
  })

  it('rejects a true sentence that is not about her (review #1: the talk-only bypass)', () => {
    const talk = '<p>She laughs, strips, and talks about his seed for a long while by the fire.</p>'
    const v = verifyGrowthTriggers(
      [{ character: 'Amelia', evidence: 'talks about his seed for a long while by the fire' }],
      talk,
    )
    expect(reasons(v)).toEqual(['not_about_her'])
    // Naming her counts as being about her; so does she/her.
    const named = verifyGrowthTriggers(
      [
        {
          character: 'Amelia',
          evidence: 'Amelia laughs, strips, and talks about his seed for a long while',
        },
      ],
      talk.replace('She laughs', 'Amelia laughs'),
    )
    expect(names(named)).toEqual(['amelia'])
  })

  it('rejects a quote that lives entirely inside a line of dialogue (talking about the act is not the act)', () => {
    const v = verifyGrowthTriggers(
      [{ character: 'Amelia', evidence: 'When he finishes inside her, she always grows' }],
      NARRATION,
    )
    expect(reasons(v)).toEqual(['dialogue_only'])
  })

  it('an empty narration verifies nothing', () => {
    const v = verifyGrowthTriggers(
      [
        {
          character: 'Amelia',
          evidence: 'he spends himself inside her, every pulse of it pressed',
        },
      ],
      '',
    )
    expect(v.verified.size).toBe(0)
    expect(reasons(v)).toEqual(['not_on_page'])
  })

  it('normalizeTriggerName matches the apply site (trim + lowercase)', () => {
    expect(normalizeTriggerName('  Amelia Vey ')).toBe('amelia vey')
  })
})
