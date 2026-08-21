// ---- Content guidelines: rating × nsfwFlavor matrix (research/59 step 3) ----
import { describe, expect, it } from 'vitest'

import { getContentGuidelines } from './contentGuidelines'

describe('getContentGuidelines', () => {
  it('returns empty string for standard and unset ratings, regardless of flavor', () => {
    expect(getContentGuidelines('standard')).toBe('')
    expect(getContentGuidelines(undefined)).toBe('')
    expect(getContentGuidelines('standard', 'always')).toBe('')
    expect(getContentGuidelines(undefined, 'always')).toBe('')
  })

  it('mature block carries the structural framing without explicit delivery rules', () => {
    const block = getContentGuidelines('mature')
    expect(block).toContain('mature content')
    expect(block).toContain('full agency')
    expect(block).not.toContain('Vocabulary')
  })

  it('explicit block carries the FF delivery layer', () => {
    const block = getContentGuidelines('explicit')
    expect(block).toContain('never fade to black')
    expect(block).toContain('Vocabulary')
    expect(block).toContain('sensory channel')
    expect(block).toContain('vocalize')
  })

  it('scene flavor (and unset) omits the always-on addendum', () => {
    expect(getContentGuidelines('explicit')).not.toContain('Sensual lens')
    expect(getContentGuidelines('explicit', 'scene')).not.toContain('Sensual lens')
  })

  it('always flavor appends the always-on addendum to mature and explicit', () => {
    expect(getContentGuidelines('explicit', 'always')).toContain('Sensual lens, always on')
    expect(getContentGuidelines('mature', 'always')).toContain('Sensual lens, always on')
  })
})
