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
  ALCHEMY_MILK_BONUS_INTENSITY,
  ALCHEMY_MILK_COST_REDUCTION,
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
  SPELL_SCHOOLS,
  type SkillDef,
} from './constants'
export {
  attributeMod,
  BAND_LABELS,
  checkBonus,
  checkOutcomeLabel,
  checkRecordTargets,
  defaultRpgSheet,
  formatCheckMath,
  formatCheckMathCompact,
  essenceMax,
  oddsBand,
  periodIndex,
  skillRanks,
  successOdds,
  unknownSpellNote,
  type OddsBand,
} from './derive'
export {
  RPG_SHEET_KEY,
  hasStoredRpgSheet,
  isStoredRpgSheetInvalid,
  readRpgSheet,
  rpgSheetSchema,
  sheetOrDefault,
  writeRpgSheet,
} from './metadata'
export {
  applyLevelGrants,
  crossingKey,
  spendPoint,
  withStartingGrant,
  type SpendTarget,
} from './leveling'
export { detectRpgDrift } from './drift'
export { buildTargetCheckModifiers } from './modifiers'
export { beLogStyle, buildTurnLog, type BeLogStyle, type TurnLogRow } from './turnlog'
export {
  availableInteractions,
  buildGatedActionsInstruction,
  GATED_INTERACTIONS,
  type GateInput,
  type InteractionAvailability,
} from './gating'
export { resolveCheck, type ResolveCheckInput } from './CheckService'
export {
  buildCheckResultBlock,
  buildCheckTaggingInstruction,
  buildPlayerSheetBlock,
  buildPlayerSheetSummary,
  CHECK_RESULT_HEADER,
  PLAYER_SHEET_HEADER,
} from './context'
