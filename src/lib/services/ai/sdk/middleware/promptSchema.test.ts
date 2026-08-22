import { describe, expect, it } from 'vitest'

import type { LanguageModelV3CallOptions } from '@ai-sdk/provider'

import { promptSchemaMiddleware } from './promptSchema'

const params = (): LanguageModelV3CallOptions =>
  ({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Pick one.' }] }],
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: { skill: { type: 'string', enum: ['stealth', 'arcana'] } },
        required: [],
      },
    },
  }) as unknown as LanguageModelV3CallOptions

describe('promptSchemaMiddleware', () => {
  it('by default renders the schema into the prompt and strips response_format', async () => {
    const out = await promptSchemaMiddleware().transformParams!({
      params: params(),
      type: 'generate',
      model: {} as never,
    })
    expect(out.responseFormat).toBeUndefined()
    const text = (out.prompt[0].content[0] as { text: string }).text
    expect(text).toContain('Pick one.')
    expect(text).toContain('"stealth" | "arcana"')
  })

  it('keepResponseFormat renders the schema AND keeps response_format (unenforced aggregators)', async () => {
    const out = await promptSchemaMiddleware({ keepResponseFormat: true }).transformParams!({
      params: params(),
      type: 'generate',
      model: {} as never,
    })
    expect(out.responseFormat?.type).toBe('json')
    expect((out.prompt[0].content[0] as { text: string }).text).toContain('"stealth" | "arcana"')
  })
})
