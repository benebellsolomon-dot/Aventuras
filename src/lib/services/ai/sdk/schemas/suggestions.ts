/**
 * Suggestions Schema
 *
 * Zod schema for validating story suggestions output from the LLM.
 * This replaces the manual JSON parsing and validation in SuggestionsService.
 */

import { z } from 'zod'

import { looseEnumField } from './tolerant-fields'

/**
 * Schema for a single story suggestion.
 */
export const suggestionSchema = z.object({
  /** The suggestion text - a narrative direction or plot beat */
  text: z.string().describe('The suggestion text'),
  /** Type of suggestion: action, dialogue, revelation, or twist */
  type: looseEnumField(
    'type',
    ['action', 'dialogue', 'revelation', 'twist'],
    'action',
    'Type of suggestion',
  ),
})

/**
 * Schema for the suggestions result.
 * Contains an array of up to 3 suggestions.
 */
export const suggestionsResultSchema = z.object({
  // No hard .max(): overflow must not void the parse (the service slices).
  suggestions: z.array(suggestionSchema).describe('Up to 3 story suggestions'),
})

// Type exports inferred from schemas
// Hand-declared (NOT z.infer): the tolerant `.catch()` on `type` makes Zod
// infer `unknown`, but runtime output always matches this shape.
export interface Suggestion {
  text: string
  type: 'action' | 'dialogue' | 'revelation' | 'twist'
}
export interface SuggestionsResult {
  suggestions: Suggestion[]
}
