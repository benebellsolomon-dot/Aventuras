// ---- Phase 2 (research/48 Step 6): [HAREM STATE] ----
import { describe, expect, it } from 'vitest'

import { buildBeStateBlock, buildHaremStateBlock, HAREM_STATE_HEADER } from './context'
import { defaultBodyState as freshState } from './metadata'

describe('buildHaremStateBlock', () => {
  it('empty string when no entry carries a track field (Phase-1 saves)', () => {
    expect(buildHaremStateBlock([{ name: 'Mira', state: freshState(6) }])).toBe('')
  })

  it('header is the exact stable string; stances and quirk blurbs render', () => {
    const block = buildHaremStateBlock([
      {
        name: 'Mira',
        state: { ...freshState(9), bond: 75, dependence: 62, quirks: ['proud'] },
      },
    ])
    expect(block.startsWith(`${HAREM_STATE_HEADER}\n`)).toBe(true)
    expect(HAREM_STATE_HEADER).toBe('[HAREM STATE — canonical and authoritative]')
    expect(block).toContain('bond: deeply bonded')
    expect(block).toContain('dependence: craving')
    expect(block).toContain('proud (reason will not move her; desire might)')
    expect(block).toContain('does not become devoted because the scene wants her to')
  })

  it('[BODY STATE] header text is untouched (cache-prefix guard)', () => {
    const body = buildBeStateBlock([{ name: 'Mira', state: freshState(6) }])
    expect(body.startsWith('[BODY STATE — canonical and authoritative]')).toBe(true)
  })
})
