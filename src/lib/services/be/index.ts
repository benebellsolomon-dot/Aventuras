/**
 * BE engine (Phase A computational core) — public surface.
 *
 * Wiring contract (the follow-up session): the ONLY production writer is
 * StoryStore.applyClassificationResult() calling reduceCharacterBody(); templates,
 * image prompts, and UI read via the derivations. See ambrosia-st research/31 §2.
 */

export * from './types'
export {
  DEFAULT_BE_STORY_CONFIG,
  DEFAULT_GROWTH_COOLDOWN_BEATS,
  GROWTH_DELTA_BY_OUTCOME,
} from './constants'
export {
  bandIndex,
  bandWord,
  comparative,
  cupLetter,
  imageSizePhrase,
  tierForCupLetter,
} from './ladder'
export { groundingFacts } from './derive'
export { reduceCharacterBody, seededRoll } from './reducer'
export {
  BODY_STATE_KEY,
  bodyStateSchema,
  defaultBodyState,
  readBodyState,
  seedBodyStateFromCup,
  writeBodyState,
} from './metadata'
