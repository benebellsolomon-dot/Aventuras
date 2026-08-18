import { describe, it, expect } from 'vitest'
import { curatedIdentityTags, resolveIdentityTags, identityTagsFromDescriptors } from './bridgeSpec'

describe('curatedIdentityTags', () => {
  it('returns undefined for empty/whitespace banks', () => {
    expect(curatedIdentityTags(undefined)).toBeUndefined()
    expect(curatedIdentityTags(null)).toBeUndefined()
    expect(curatedIdentityTags('   ')).toBeUndefined()
  })

  it('splits on comma, semicolon, and newline into trimmed atomic tags', () => {
    expect(curatedIdentityTags('long silver hair, violet eyes; elf ears\nfreckles')).toEqual([
      'long silver hair',
      'violet eyes',
      'elf ears',
      'freckles',
    ])
  })

  it('drops fragments shorter than the min tag length', () => {
    // 'ab' is below MIN_TAG_LENGTH (3) and is filtered out
    expect(curatedIdentityTags('ab, green eyes')).toEqual(['green eyes'])
  })

  it('strips size vocabulary so the bank cannot fight the engine tier', () => {
    // band words (e.g. "huge breasts") are removed; the residual identity survives
    const tags = curatedIdentityTags('huge breasts, long black hair')
    expect(tags).toEqual(['long black hair'])
  })

  it('preserves author-supplied (tag:weight) emphasis verbatim', () => {
    expect(curatedIdentityTags('(elf ears:1.3), blue eyes')).toEqual([
      '(elf ears:1.3)',
      'blue eyes',
    ])
  })
})

describe('resolveIdentityTags', () => {
  const descriptors = { face: 'freckled face', hair: 'red hair', eyes: 'green eyes' }

  it('prefers the curated bank when present', () => {
    expect(resolveIdentityTags('elf ears, silver hair', descriptors)).toEqual([
      'elf ears',
      'silver hair',
    ])
  })

  it('falls back to descriptor-derived tags when the bank is empty', () => {
    expect(resolveIdentityTags('', descriptors)).toEqual(identityTagsFromDescriptors(descriptors))
  })

  it('falls back when a bank contains only size vocabulary that gets stripped away', () => {
    expect(resolveIdentityTags('huge breasts', descriptors)).toEqual(
      identityTagsFromDescriptors(descriptors),
    )
  })
})
