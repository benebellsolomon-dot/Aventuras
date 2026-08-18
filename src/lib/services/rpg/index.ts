/** RPG layer — public surface. Import ONLY from here outside src/lib/services/rpg. */

export type {
  AttributeId,
  CheckBand,
  CheckModifier,
  CheckRecord,
  RpgDriftFinding,
  RpgDriftKind,
  RpgSheet,
  SkillId,
} from './types'
export {
  ATTRIBUTE_CAP,
  ATTRIBUTE_IDS,
  ATTRIBUTE_LABELS,
  DC_MAX,
  DC_MIN,
  ESSENCE_COST_MAX,
  ESSENCE_REGEN_PER_PERIOD,
  HOURS_PER_PERIOD,
  POINTS_PER_LEVEL,
  SKILL_BY_ID,
  SKILL_IDS,
  SKILL_RANK_CAP,
  SKILLS,
  type SkillDef,
} from './constants'
export {
  attributeMod,
  BAND_LABELS,
  checkBonus,
  defaultRpgSheet,
  formatCheckMath,
  essenceMax,
  oddsBand,
  periodIndex,
  skillRanks,
  successOdds,
  type OddsBand,
} from './derive'
export { RPG_SHEET_KEY, readRpgSheet, rpgSheetSchema, writeRpgSheet } from './metadata'
export { applyLevelGrants, crossingKey, spendPoint, type SpendTarget } from './leveling'
export { detectRpgDrift } from './drift'
export { resolveCheck, type ResolveCheckInput } from './CheckService'
export {
  buildCheckResultBlock,
  buildCheckTaggingInstruction,
  buildPlayerSheetBlock,
  buildPlayerSheetSummary,
  CHECK_RESULT_HEADER,
  PLAYER_SHEET_HEADER,
} from './context'
