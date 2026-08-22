import { describe, expect, it } from 'vitest'

import { parseImageSize } from './image'

describe('parseImageSize', () => {
  it('parses WxH with either x or the typographic ×, falling back to 1024² otherwise', () => {
    expect(parseImageSize('832x1216')).toEqual({ width: 832, height: 1216 })
    // The live settings held '832×1216' (typed/pasted) — it used to fall through to 1024².
    expect(parseImageSize('832×1216')).toEqual({ width: 832, height: 1216 })
    expect(parseImageSize('1536X1536')).toEqual({ width: 1536, height: 1536 })
    expect(parseImageSize('nonsense')).toEqual({ width: 1024, height: 1024 })
  })
})
