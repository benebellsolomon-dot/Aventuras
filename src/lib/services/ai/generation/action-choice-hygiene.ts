/**
 * Action-choice hygiene (pure, test-light): the choice generator is an LLM and
 * the tolerant schema keeps shape-valid junk — a one-word stub ("Say") rendered
 * as a real option live (2026-08-22 21:52Z). Drop stubs deterministically, and
 * strip growthIntent in act-driven (cosmology) stories where growth is never an
 * action (research/66).
 */
import type { ActionChoice } from '../sdk/schemas/actionchoices'

/** Fewer words than this and a choice is a stub ("Say"), not a choice. */
export const ACTION_CHOICE_MIN_WORDS = 2
const TYPE_WORDS = new Set(['say', 'do', 'action', 'dialogue', 'examine', 'move', 'talk', 'speak'])

/** Drop stub choices (empty, one bare word, or just type words) — model variance, not player options. */
export function sanitizeActionChoices(choices: ReadonlyArray<ActionChoice>): ActionChoice[] {
  return choices.filter((choice) => {
    const text = (choice.text ?? '').trim()
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length < ACTION_CHOICE_MIN_WORDS) return false
    if (
      words.length <= 2 &&
      words.every((w) => TYPE_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, '')))
    ) {
      return false
    }
    return true
  })
}

/** The same choice without its growthIntent flag (it resolves as an ordinary check). */
export function stripGrowthIntent(choice: ActionChoice): ActionChoice {
  const { growthIntent: _dropped, ...rest } = choice
  void _dropped
  return rest as ActionChoice
}
