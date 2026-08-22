/** Absolute growth rule (research/66): trigger evidence verification. */
import { describe, expect, it } from 'vitest'

import {
  GROWTH_TRIGGER_MIN_EVIDENCE_WORDS,
  growthGateRequired,
  nameTokensOf,
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

describe('verifyGrowthTriggers — fix-diff round (research/66 review)', () => {
  it('an unpaired inch mark cannot flip dialogue detection (F1): dialogue still rejected, narration still accepted', () => {
    const page = `<p>He measured 34" of rope and set it down beside her.</p><p>"He poured his seed into her and she swelled," Mira said, laughing.</p><p>Then he poured himself into her for real and she swelled against him.</p>`
    const v = verifyGrowthTriggers(
      [
        { character: 'Mira', evidence: 'He poured his seed into her and she swelled' },
        {
          character: 'Mira',
          evidence: 'he poured himself into her for real and she swelled against him',
        },
      ],
      page,
    )
    expect(reasons(v)).toEqual(['dialogue_only'])
    expect(names(v)).toEqual(['mira'])
  })

  it('the multi-paragraph dialogue convention (open quote per paragraph) does not swallow a narration paragraph (F2)', () => {
    const page = `<p>"I have wanted this for so long.</p><p>He spilled himself inside her at last, and she shuddered.</p><p>Tell me you wanted it too."</p>`
    const v = verifyGrowthTriggers(
      [
        {
          character: 'Amelia',
          evidence: 'He spilled himself inside her at last, and she shuddered',
        },
      ],
      page,
    )
    expect(names(v)).toEqual(['amelia'])
  })

  it("single-quoted dialogue is dialogue too (F3), and contractions don't count as quotes", () => {
    const page = `<p>'He poured his seed into her and she swelled,' Mira said. It wasn't true; but later he did pour himself into her and she swelled.</p>`
    const v = verifyGrowthTriggers(
      [
        { character: 'Mira', evidence: 'He poured his seed into her and she swelled' },
        { character: 'Mira', evidence: 'he did pour himself into her and she swelled' },
      ],
      page,
    )
    expect(reasons(v)).toEqual(['dialogue_only'])
    expect(names(v)).toEqual(['mira'])
  })

  it('a quote assembled across two paragraphs is not on the page (F4), and a word-truncated fragment is not a quote (F10)', () => {
    const page = `<p>Sara knelt by the fire.</p><p>He finished inside her before dawn broke over the ridge.</p>`
    const v = verifyGrowthTriggers(
      [
        {
          character: 'Sara',
          evidence: 'Sara knelt by the fire. He finished inside her before dawn',
        },
        { character: 'Sara', evidence: 'e finished inside her before dawn broke over the ridg' },
        { character: 'Sara', evidence: 'He finished inside her before dawn broke' },
      ],
      page,
    )
    expect(reasons(v)).toEqual(['not_on_page', 'not_on_page'])
    expect(names(v)).toEqual(['sara'])
  })

  it('a quote that names ANOTHER girl and not her is rejected (F5); naming her explicitly wins', () => {
    const page = '<p>He emptied himself into Sara, and she moaned against him until dawn.</p>'
    const wrong = verifyGrowthTriggers(
      [{ character: 'Mira', evidence: 'He emptied himself into Sara, and she moaned against him' }],
      page,
      { cast: ['Mira', 'Sara'] },
    )
    expect(reasons(wrong)).toEqual(['names_another'])
    const right = verifyGrowthTriggers(
      [{ character: 'Sara', evidence: 'He emptied himself into Sara, and she moaned against him' }],
      page,
      { cast: ['Mira', 'Sara'] },
    )
    expect(names(right)).toEqual(['sara'])
  })

  it('name tokens: a two-letter single-token name counts (F7); honorifics never identify her (F8)', () => {
    expect(nameTokensOf('Io')).toEqual(['io'])
    expect(nameTokensOf('Lady Mira')).toEqual(['mira'])
    expect(nameTokensOf('Mira de la Vey')).toEqual(['mira', 'vey'])
    const io = verifyGrowthTriggers(
      [
        {
          character: 'Io',
          evidence: 'The catalyst took hold in Io and the change began in earnest',
        },
      ],
      '<p>The catalyst took hold in Io and the change began in earnest.</p>',
    )
    expect(names(io)).toEqual(['io'])
    const lady = verifyGrowthTriggers(
      [
        {
          character: 'Lady Mira',
          evidence: 'The lady of the house poured tea for the guests tonight',
        },
      ],
      '<p>The lady of the house poured tea for the guests tonight.</p>',
    )
    expect(reasons(lady)).toEqual(['not_about_her'])
  })

  it('NFC-normalizes both sides (F6) and decodes entities in one pass (F9)', () => {
    const decomposed = 'Zoé took him inside her and she swelled with it.'
    const v = verifyGrowthTriggers(
      [{ character: 'Zoé', evidence: 'Zoé took him inside her and she swelled with it' }],
      `<p>${decomposed}</p>`,
    )
    expect(names(v)).toEqual(['zoé'])
    expect(normalizeEvidenceText('a &#38;lt; b')).toBe('a &lt; b')
  })
})
