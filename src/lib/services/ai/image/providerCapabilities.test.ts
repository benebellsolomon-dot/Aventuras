import { describe, it, expect } from 'vitest'
import { parsesPromptWeighting } from './providerCapabilities'
import type { ImageProviderType } from '$lib/types'

describe('parsesPromptWeighting', () => {
  const weightingCapable: ImageProviderType[] = ['si-bridge', 'a1111', 'comfyui']
  const nonParsing: ImageProviderType[] = [
    'nanogpt',
    'openai',
    'openrouter',
    'chutes',
    'pollinations',
    'google',
    'zhipu',
  ]

  it.each(weightingCapable)('returns true for %s', (providerType) => {
    expect(parsesPromptWeighting(providerType)).toBe(true)
  })

  it.each(nonParsing)('returns false for %s', (providerType) => {
    expect(parsesPromptWeighting(providerType)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(parsesPromptWeighting(undefined)).toBe(false)
  })
})
