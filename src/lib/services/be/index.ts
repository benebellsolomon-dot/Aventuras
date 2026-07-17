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
  groundImagePromptSize,
  imageSizePhrase,
  sniffTierFromText,
  tierForCupLetter,
} from './ladder'
export { groundingFacts } from './derive'
export {
  bodyRow,
  bustCm,
  bwhCmString,
  capacityMlPerSide,
  dryKgPerSide,
  estimatedBodyWeightKg,
  fluidPressureLabel,
  imageStateCues,
  measurements,
  nowKgPerSide,
  proportionNote,
  sizingString,
  weightFeel,
} from './measurements'
export { reduceCharacterBody, seededRoll } from './reducer'
export {
  beEventSchema,
  beEventsFromResult,
  beSoftStateSchema,
  beSoftStatesFromResult,
  buildBeEventInstructions,
  extendClassificationSchemaWithBeEvents,
} from './schema'
export { buildBeStateBlock, type BeStateEntry } from './context'
export {
  BODY_STATE_KEY,
  DEFAULT_FLUID_TYPE,
  bodyStateSchema,
  defaultBodyState,
  maxBodyStateTier,
  readBodyState,
  seedBodyStateFromCup,
  soloBodyState,
  uniformBodyStateTier,
  writeBodyState,
} from './metadata'
