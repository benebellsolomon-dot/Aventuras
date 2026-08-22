import { describe, expect, it } from 'vitest'

import { stripLeadingFenceIfComplete, stripMarkdownFence } from './narrativeCleanup'

describe('stripMarkdownFence', () => {
  it('removes a fence that wraps the whole response (the live 21:52Z turn)', () => {
    const raw = '```html\n<p>You step between her knees.</p>\n<pic prompt="x"></pic>\n```'
    expect(stripMarkdownFence(raw)).toBe(
      '<p>You step between her knees.</p>\n<pic prompt="x"></pic>',
    )
    expect(stripMarkdownFence('```\n<p>a</p>\n```   \n')).toBe('<p>a</p>')
  })

  it('leaves inner code fences and fence-free content untouched', () => {
    const prose = '<p>She reads:</p>\n```\nrunes\n```\n<p>and laughs.</p>'
    expect(stripMarkdownFence(prose)).toBe(prose)
    expect(stripMarkdownFence('')).toBe('')
  })

  it('a cut-off stream loses only the opener', () => {
    expect(stripMarkdownFence('```html\n<p>half')).toBe('<p>half')
  })
})

describe('stripLeadingFenceIfComplete (streaming)', () => {
  it('waits while the first line could still be a fence, then strips it', () => {
    expect(stripLeadingFenceIfComplete('``').settled).toBe(false)
    expect(stripLeadingFenceIfComplete('```ht').settled).toBe(false)
    expect(stripLeadingFenceIfComplete('```html\n<p>')).toEqual({ content: '<p>', settled: true })
    expect(stripLeadingFenceIfComplete('<p>Hi')).toEqual({ content: '<p>Hi', settled: true })
    expect(stripLeadingFenceIfComplete('`inline` code and prose that goes on')).toMatchObject({
      settled: true,
    })
  })
})
