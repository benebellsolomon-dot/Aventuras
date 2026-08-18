/**
 * RPG layer — target-girl check modifiers (research/48 Step 7).
 *
 * SIGN CONTRACT (R4): CheckService adds modifiers to the BONUS and never
 * touches the DC, so every "DC +N" quirk effect is expressed here with the
 * sign INVERTED — skittish "social DCs +2" is `value: -2`. Getting this wrong
 * silently turns every penalty quirk into a buff; the sign is test-pinned per
 * quirk in modifiers.test.ts.
 */

import {
  bondCheckModifier,
  bondOf,
  bondStance,
  EARLY_BLOOMER_INDUCTION_BONUS,
  hasQuirk,
  lactationOf,
  type BodyState,
} from '$lib/services/be'
import { INTIMATE_SKILLS, SOCIAL_SKILLS } from './constants'
import type { CheckModifier, SkillId } from './types'

const isSocialOrIntimate = (skill: SkillId): boolean =>
  (SOCIAL_SKILLS as ReadonlyArray<SkillId>).includes(skill) ||
  (INTIMATE_SKILLS as ReadonlyArray<SkillId>).includes(skill)

/**
 * Modifiers a check against one girl carries. Null state (no target, no
 * bodyState) → no modifiers: Phase-1 behavior exactly.
 */
export function buildTargetCheckModifiers(
  state: BodyState | null,
  skill: SkillId,
): CheckModifier[] {
  if (!state) return []
  const modifiers: CheckModifier[] = []

  if (isSocialOrIntimate(skill)) {
    const bond = bondOf(state)
    const bondValue = bondCheckModifier(bond)
    if (bondValue !== 0) {
      modifiers.push({ label: `bond: ${bondStance(bond)}`, value: bondValue })
    }
    // skittish: social DCs +2 until bond >= 50 → bonus −2 (sign inverted).
    if (hasQuirk(state, 'skittish') && bond < 50) {
      modifiers.push({ label: 'skittish (harder to approach)', value: -2 })
    }
  }

  // needy_nipples: Handling/Milking DCs −2 → bonus +2.
  if (hasQuirk(state, 'needy_nipples') && (skill === 'handling' || skill === 'milking')) {
    modifiers.push({ label: 'needy nipples (responsive)', value: 2 })
  }

  // early_bloomer (research/49 R10): her body takes to induction easily —
  // Milking DCs −4 → bonus +4, but ONLY while she is not yet lactating. Once
  // supply is established the induction attempt is done; expression checks are
  // unmodified.
  if (
    hasQuirk(state, 'early_bloomer') &&
    skill === 'milking' &&
    lactationOf(state)?.active !== true
  ) {
    modifiers.push({ label: 'early bloomer (DC −4)', value: EARLY_BLOOMER_INDUCTION_BONUS })
  }

  // proud: Persuasion +2 harder → bonus −2; Seduction explicitly untouched.
  if (hasQuirk(state, 'proud') && skill === 'persuasion') {
    modifiers.push({ label: 'proud (reason will not move her)', value: -2 })
  }

  return modifiers
}
