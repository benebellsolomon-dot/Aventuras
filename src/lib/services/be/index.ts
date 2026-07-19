/**
 * BE engine (Phase A computational core) — public surface.
 *
 * Wiring contract (the follow-up session): the ONLY production writer is
 * StoryStore.applyClassificationResult() calling reduceCharacterBody(); templates,
 * image prompts, and UI read via the derivations. See ambrosia-st research/31 §2.
 */

export * from './types'
export {
  ANTICIPATION_THRESHOLD,
  DEFAULT_BE_STORY_CONFIG,
  DEFAULT_FLUID_PROFILE,
  DEFAULT_GROWTH_COOLDOWN_BEATS,
  ENGORGED_FILL_THRESHOLD,
  ENGORGED_TTL,
  FLUID_REGISTRY,
  GROWTH_DELTA_BY_OUTCOME,
  GROWTH_EVENT_KINDS,
  MAX_BE_CONDITIONS,
  OVERFILL_ADD_BASE,
  OVERFILL_FILL_THRESHOLD,
  PRESSURE_ACCRUAL,
  PRESSURE_FIRE,
  PRESSURE_RELEASE,
  fluidProfile,
  parseGrowthEligibleKinds,
  type FluidProfile,
} from './constants'
export { buildBeGenreRules, type BeGenreRuleOptions } from './genre-rules'
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
  bandCm,
  bodyRow,
  bustCm,
  bustDiffCm,
  bwhCmString,
  capacityMlPerSide,
  droopCm,
  dryKgPerSide,
  effectiveSupport,
  estimatedBodyWeightKg,
  fluidPressureLabel,
  imageStateCues,
  measurements,
  nowKgPerSide,
  proportionNote,
  resolveBuild,
  sizingString,
  weightFeel,
} from './measurements'
export { reduceCharacterBody, seededRoll } from './reducer'
export {
  beConditionSchema,
  beConditionsFromResult,
  beEventSchema,
  beEventsFromResult,
  beSoftStateSchema,
  beSoftStatesFromResult,
  buildBeEventInstructions,
  extendClassificationSchemaWithBeEvents,
  type BeCharacterCondition,
} from './schema'
export { buildBeStateBlock, type BeStateEntry } from './context'
export { detectDrift } from './drift'
export { INTERACTION_MILESTONES, nextMilestone, type InteractionMilestone } from './milestones'
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
