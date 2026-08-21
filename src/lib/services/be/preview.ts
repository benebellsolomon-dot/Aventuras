/**
 * BE engine — the pre-flight growth verdict (the narration-vs-engine seam).
 *
 * The live failure this closes: the player crit a growth check, the guaranteed
 * catalyst hit the reducer's cooldown gate, and the narrator — which under
 * resolve-then-narrate sees only `[CHECK RESULT] Critical Success` — wrote an
 * apocalyptic room-filling eruption for a turn the engine scored at delta 0.
 * Engine right, prose wrong, player experiences "crit → no stats again".
 *
 * The check resolves BEFORE narration and reduceCharacterBody is pure, so the
 * outcome is computable at check time. This module answers one question:
 *
 *   for a GUARANTEED growth event, what would the reducer do to HER, right now?
 *
 * Fidelity contract: the gates below are the reducer's gates, in the reducer's
 * order (step 2 cooldown tick → step 3 pending land → eligibility → lock →
 * cooldown → size cap). preview.test.ts drives BOTH this helper and
 * reduceCharacterBody from the same states and asserts they agree — that test,
 * not this comment, is what keeps the two from drifting apart.
 */

import { MAX_GROWTH_LAND_PER_TURN } from './constants'
import { measurements } from './measurements'
import { INTERACTION_MILESTONES } from './milestones'
import { hasQuirk } from './quirks'
import type { BeEventKind, BeStoryConfig, BodyState, GrowthVerdict } from './types'

/**
 * Tiers still available to BANK at `tier` with `staged` already in the bank —
 * the cap-wins rule, in one place. The reducer's cooldown gate clamps its bank
 * with this and the preview reads it for the at_cap/blocked_recovery split, so
 * "never bank past the size cap" cannot be true in one of them and not the other.
 */
export function growthBankHeadroom(
  tier: number,
  staged: number,
  sizeCapTier: number | null,
): number {
  if (sizeCapTier === null) return Number.POSITIVE_INFINITY
  return Math.max(0, sizeCapTier - tier - staged)
}

export interface GuaranteedGrowthPreviewInput {
  /** The event kind the guaranteed growth will arrive as. Both guaranteed
   * channels (translateSpellEffects and promoteGrowthIntent) emit `catalyst`. */
  kind?: BeEventKind
  /** Crit band: the event punches through an armed cooldown (user ruling). */
  critPierce?: boolean
}

/**
 * What a guaranteed growth event would do to `state` this turn.
 *
 * - `lands` — growth happens (including a slow_burn girl, whose delta stages
 *   and releases next beat; that is existing, narrated-as-growth behavior).
 * - `blocked_recovery` — her body is still on cooldown, so the earned delta
 *   BANKS (reducer step 6) and lands as the cooldown clears. No visible change.
 * - `at_cap` — the story's size ceiling leaves no headroom, banked or landed.
 * - `blocked` — the size lock, or a story cosmology that does not allow this
 *   kind to grow anyone.
 *
 * Assumes the turn's ticks are enabled, which holds by construction: the girl
 * this runs for is the check's target, and effectivePresence always includes
 * the check target. Also assumes this is the turn's FIRST growth event — a
 * second ambient growth event landing ahead of it in the same array could arm
 * the cooldown in between, which no check-time preview can see.
 */
export function previewGuaranteedGrowth(
  state: BodyState,
  config: BeStoryConfig,
  input: GuaranteedGrowthPreviewInput = {},
): GrowthVerdict {
  const kind = input.kind ?? 'catalyst'

  // Reducer step 6, gate 1: story cosmology. Precedes lock/cooldown there too.
  if (config.growthEligibleKinds && !config.growthEligibleKinds.includes(kind)) return 'blocked'
  // Gate 2: the lock wins over everything, including guaranteed triggers.
  if (state.locked) return 'blocked'

  // Steps 2+3, replayed: the cooldown ticks once, then a staged pendingGrowth
  // lands (metered) and RE-ARMS the cooldown — which is exactly how a girl who
  // grew last turn is still recovering when this turn's catalyst arrives.
  const { tier, cooldown, pending } = openTurn(state, config)

  const cap = config.sizeCapTier
  if (cooldown > 0 && input.critPierce !== true) {
    // Banking is cap-clamped (already-staged delta counts), so no headroom
    // means no bank — she is simply at her limit, which is the truer line.
    return growthBankHeadroom(tier, pending, cap) > 0 ? 'blocked_recovery' : 'at_cap'
  }
  return cap === null || cap - tier > 0 ? 'lands' : 'at_cap'
}

/**
 * Replay of reducer steps 2 (cooldown tick) and 3 (pending land, slow_burn
 * milestone bonus included) — the state the events loop actually sees.
 */
function openTurn(
  state: BodyState,
  config: BeStoryConfig,
): { tier: number; cooldown: number; pending: number } {
  let tier = Number.isFinite(state.tier) ? Math.max(0, state.tier) : 0
  let cooldown = Math.max(0, Math.floor(state.cooldown ?? 0)) // step 2
  let pending = 0

  const armCooldown = (): number =>
    Math.max(0, Math.floor(config.growthCooldownBeats) - (hasQuirk(state, 'greedy_flesh') ? 1 : 0))
  const land = (want: number): number => {
    const delta = config.sizeCapTier === null ? want : Math.min(want, config.sizeCapTier - tier)
    if (delta <= 0) return 0
    tier += delta
    cooldown = armCooldown()
    return delta
  }

  if (cooldown > 0) cooldown -= 1

  if (state.pendingGrowth && !state.locked) {
    const tierBeforeLand = tier
    const wantLand = Math.min(state.pendingGrowth.delta, MAX_GROWTH_LAND_PER_TURN)
    const landed = land(wantLand)
    if (landed > 0 && hasQuirk(state, 'slow_burn')) {
      const massBefore = measurements({ ...state, tier: tierBeforeLand }).nowTotalKg
      const massAfter = measurements({ ...state, tier }).nowTotalKg
      if (INTERACTION_MILESTONES.some((m) => massBefore < m.massKg && massAfter >= m.massKg)) {
        land(1)
      }
    }
    // Same re-stage rule as step 3: the remainder survives only if something
    // actually landed (otherwise it would re-stage forever against the cap).
    const remainder = state.pendingGrowth.delta - wantLand
    pending = landed > 0 && remainder > 0 ? remainder : 0
  }

  return { tier, cooldown, pending }
}
