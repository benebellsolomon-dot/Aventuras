/**
 * BE engine — output-side drift detection (Spec 1 Task 6). Pure regex/string
 * work, no store deps. Ports the three Era-1 detectors (research/36 §3,
 * ambrosia-st narration.js) plus the research/41 omission detector.
 *
 * All comparisons run against the PRE-reduce state — the state the narrator was
 * shown when it wrote this prose — never against nextState. Findings feed the
 * reducer's step-9 driftNote and render as a [CONTINUITY] correction next turn.
 */

import { cupLetter, imageSizeAnchorRung, tierForCupLetter } from './ladder'
import { apparentTier, lactationOf, supplyLabel } from './lactation'
import type { BodyState, DriftFinding } from './types'

/** Era-1 attribution window: a mention within this many chars after the name. */
const ATTRIBUTION_WINDOW = 240

/** Simile registry: minimum tier at which the comparison is honest (12-tier margin applies). */
const SIMILE_REGISTRY: ReadonlyArray<{ pattern: RegExp; minTier: number; label: string }> = [
  { pattern: /\b(?:beach|exercise)[- ]?balls?\b/i, minTier: 120, label: 'beach/exercise balls' },
  { pattern: /\bbasketballs?\b/i, minTier: 95, label: 'basketballs' },
  { pattern: /\bpumpkins?\b/i, minTier: 75, label: 'pumpkins' },
  { pattern: /\bwatermelons?\b/i, minTier: 60, label: 'watermelons' },
]
const SIMILE_MARGIN = 12

const CUP_MENTION = /\b([A-Z]{1,3})[- ]cups?\b/g

/**
 * Magnitude registry: prose that claims a SCALE, with the tier at which that
 * claim is honest. The image layer already sanitizes invented magnitude out of
 * booru prompts; this is the same idea pointed at prose, and it exists because
 * the narrator, told only "Critical Success", wrote a room-filling eruption for
 * a turn the engine scored at delta 0 — leaving the next scene stranded between
 * a girl who "is the room" and a tracked tier in the twenties.
 *
 * Every entry is scale-specific, never a mood word: "enormous" and "she could
 * barely see past them" are genre-normal at any rung and are deliberately absent.
 */
const MAGNITUDE_REGISTRY: ReadonlyArray<{ pattern: RegExp; minTier: number; label: string }> = [
  {
    pattern:
      /\b(?:fill(?:s|ed|ing)?|took up|takes?\s+up|taking up|consum(?:ed|es|ing))\b[^.!?]{0,30}\b(?:the\s+)?(?:entire\s+|whole\s+)?(?:room|chamber|hall|building)\b/i,
    minTier: 120,
    label: 'room-filling',
  },
  {
    pattern:
      /\b(?:press(?:ed|es|ing)?|push(?:ed|es|ing)?|reach(?:ed|es|ing)?|shov(?:ed|es|ing))\b[^.!?]{0,40}\b(?:against|into|to)\b[^.!?]{0,25}\b(?:both\s+|opposite\s+|far\s+)?walls?\b/i,
    minTier: 120,
    label: 'wall-to-wall',
  },
  {
    pattern: /\b(?:she|they)\s+(?:was|were|is|are)\s+the\s+(?:room|chamber|building|house)\b/i,
    minTier: 120,
    label: '"she is the room"',
  },
  {
    pattern:
      /\b(?:crush(?:ed|es|ing)?|shatter(?:ed|s|ing)?|splinter(?:ed|s|ing)?|flatten(?:ed|s|ing)?)\b[^.!?]{0,40}\b(?:the\s+|her\s+)?(?:couch|sofa|bed|table|desk|chair|cart|wagon)\b/i,
    minTier: 80,
    label: 'furniture-crushing mass',
  },
  {
    pattern:
      /\b(?:breasts?|bust|they|them)\b[^.!?]{0,40}\b(?:immobiliz(?:ed|ing)|pinn(?:ed|ing)\s+her\s+(?:in place|down|to the (?:floor|ground|bed)))\b/i,
    minTier: 80,
    label: 'immobilized by size',
  },
  {
    pattern:
      /\bher\s+head\b[^.!?]{0,30}\b(?:barely|no longer|hardly|scarcely)\s+(?:visible|showed|shows)\b/i,
    minTier: 80,
    label: 'head barely visible',
  },
]

/**
 * How far above her apparent band a claim must sit before it is drift, counted
 * in the image layer's body-relative anchor rungs. Hyperbole within a rung —
 * and one rung of it — is genre-normal; two is the prose describing a different
 * character. Conservative on purpose: this note steers the NEXT scene's scale,
 * and over-firing would flatten legitimate awe.
 */
const MAGNITUDE_RUNG_MARGIN = 2

// "grew/growing" only counts with a size adjective — bare "grew" false-positives
// on ambient prose ("her shoulders grew tense", "legs grew tired"); the
// unambiguous size verbs (swell/expand/widen/thicken) stand alone.
const NON_BREAST_GROWTH =
  /\b(hips?|waist|rear|butt|backside|thighs?|shoulders?|arms?|legs?|frame|stature)\b[^.!?]{0,60}?\b(?:(?:grew|grow(?:ing|s)?)\s+(?:bigger|larger|fuller|heavier|wider|rounder|thicker)|swell(?:ing|ed|s)?|expand(?:ing|ed|s)?|widen(?:ing|ed|s)?|thicken(?:ing|ed|s)?)\b/i

/** Change-language lexicon: state words like "swollen" don't count — the
 * research/41 miss was exactly ambient state description with no change beat. */
const GROWTH_LANGUAGE =
  /\b(grew|grow(?:ing|s|th)?|swell(?:ing|ed|s)?|expand(?:ing|ed|s)?|bigger|larger|fuller|heavier|stretch(?:ing|ed)\b[^.!?]{0,40}\b(?:skin|mark))\b/i

/**
 * Milk ACTS (research/49 Step 7, direction 1). Every pattern is verb-adjacent:
 * the bare noun "milk" is groceries, an ingredient, a colour — flagging it would
 * fire on half the kitchen scenes in the game. "nurse" likewise only counts with
 * breast/milk context, or every ward scene trips it.
 */
const MILK_ACT: ReadonlyArray<RegExp> = [
  /\bnurs(?:e|es|ing|ed)\b[^.!?]{0,40}\b(?:milk|breasts?|nipples?)\b/i,
  /\b(?:milk|breasts?|nipples?)\b[^.!?]{0,40}\bnurs(?:e|es|ing|ed)\b/i,
  /\bleak(?:s|ing|ed)?\b[^.!?]{0,40}\bmilk\b/i,
  /\bmilk\b[^.!?]{0,40}\bleak(?:s|ing|ed)?\b/i,
  /\bmilk\s+(?:beads?|beaded|drips?|dripped|dripping|sprays?|sprayed|spurts?|spurted|flows?|flowed|flowing|wells?|welled)\b/i,
  /\bexpress(?:es|ing|ed)?\b[^.!?]{0,40}\bmilk\b/i,
  /\bmilk\b[^.!?]{0,40}\bexpress(?:es|ing|ed)\b/i,
  /\bmilk\b[^.!?]{0,20}\blet(?:s|ting)?\s+down\b/i,
  /\blet(?:s|ting)?\s+down\b[^.!?]{0,20}\bmilk\b/i,
  /\bletdown\b/i,
]

/**
 * Written-dry assertions (direction 2). Bare "dry" is a shirt, a mouth, a laugh —
 * so it only counts adjacent to breasts/nipples, and "nothing came" only counts
 * when something came OUT OF or FROM her.
 */
const WRITTEN_DRY: ReadonlyArray<RegExp> = [
  /\b(?:breasts?|nipples?|she|they)\b[^.!?]{0,30}\b(?:were|was|are|is|ran|run|stayed|remained|came up|come up|went)\s+dry\b/i,
  /\bdry\b[^.!?]{0,20}\b(?:breasts?|nipples?)\b/i,
  /\bno milk\b/i,
  /\bmilkless\b/i,
  /\bnothing\s+(?:came|come|comes)\s+(?:out|from)\b/i,
  /\b(?:not|isn'?t|wasn'?t|aren'?t|doesn'?t|does not|never)\s+(?:lactating|lactated|producing)\b/i,
]

/**
 * The dry rule sleeps below this tier: at `light` supply a beat that comes up
 * empty is honest fiction. research/49 Step 7 sketches `>= 2`; steady (1) is the
 * shipped floor — once the engine tracks steady supply, "she is dry" is a
 * contradiction of tracked state, which is exactly what this detector is for.
 */
const DRY_DRIFT_MIN_TIER = 1

/**
 * The milk-act direction sleeps when her tracked fluid IS milk and she is
 * visibly full of it: the [BODY STATE] block itself instructs the narrator to
 * render that fullness, so milk prose is legitimate fill narration, not drift.
 * Without this, every pre-Phase-3 save (fluidType 'milk', no lactation block)
 * gets corrected for following the game's own body block. The rung is the
 * visible-swelling one the image cues use.
 */
const MILK_FILL_LEGITIMATE_PERCENT = 40

function isMilkFullnessLegitimate(state: BodyState): boolean {
  const fluidType = state.fluids.fluidType
  return (
    typeof fluidType === 'string' &&
    fluidType.trim().toLowerCase() === 'milk' &&
    state.fluids.fillPercent >= MILK_FILL_LEGITIMATE_PERCENT
  )
}

const stripHtml = (text: string): string => text.replace(/<[^>]+>/g, ' ')

/** Character positions of every name occurrence (case-insensitive). */
function nameOffsets(text: string, name: string): number[] {
  const offsets: number[] = []
  const needle = name.toLowerCase()
  if (!needle) return offsets
  const haystack = text.toLowerCase()
  let from = 0
  for (;;) {
    const index = haystack.indexOf(needle, from)
    if (index === -1) break
    offsets.push(index)
    from = index + needle.length
  }
  return offsets
}

const isAttributed = (offsets: ReadonlyArray<number>, index: number): boolean =>
  offsets.some((offset) => index >= offset && index - offset <= ATTRIBUTION_WINDOW)

/** True when the pattern matches somewhere inside her attribution window. */
function matchAttributed(pattern: RegExp, text: string, offsets: ReadonlyArray<number>): boolean {
  const scan = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  )
  for (const match of text.matchAll(scan)) {
    if (match.index !== undefined && isAttributed(offsets, match.index)) return true
  }
  return false
}

/**
 * Run every detector over one character's finalized narrative. `state` is the
 * pre-reduce body state (what the [BODY STATE] block showed the narrator).
 */
export function detectDrift(narrative: string, name: string, state: BodyState): DriftFinding[] {
  const findings: DriftFinding[] = []
  const text = stripHtml(narrative)
  const offsets = nameOffsets(text, name)
  const trackedLetter = cupLetter(state.tier)

  // Note wording rules (prompt-coherence review): each note carries its OWN
  // imperative tail (the [CONTINUITY] wrapper adds none — "correct silently"
  // would contradict growth_omitted's "render it"), and never bakes absolute
  // letters/tiers that can go stale before the note renders next turn.

  // 1. Monotonic cup-rank contradiction: prose ranking her BELOW tracked size.
  for (const match of text.matchAll(CUP_MENTION)) {
    if (match.index === undefined || !isAttributed(offsets, match.index)) continue
    const proseTier = tierForCupLetter(match[1])
    if (proseTier === null) continue
    if (proseTier < state.tier && match[1] !== trackedLetter) {
      findings.push({
        kind: 'cup_contradiction',
        note: `${name} was written as ${match[1]}-cup, below her tracked size — silently use her current tracked size from this block`,
      })
      break // one note per character per turn is enough
    }
  }

  // 2. Tier-gated simile overshoot.
  for (const entry of SIMILE_REGISTRY) {
    const match = entry.pattern.exec(text)
    if (!match || match.index === undefined) continue
    if (!isAttributed(offsets, match.index)) continue
    if (entry.minTier > state.tier + SIMILE_MARGIN) {
      findings.push({
        kind: 'size_overshoot',
        note: `"${entry.label}" overshoots ${name}'s tracked size — silently keep comparisons within her real band`,
      })
      break
    }
  }

  // 3. Non-breast growth invariant: only her breasts change size.
  const nonBreast = NON_BREAST_GROWTH.exec(text)
  if (nonBreast && nonBreast.index !== undefined && isAttributed(offsets, nonBreast.index)) {
    findings.push({
      kind: 'non_breast_growth',
      note: `the prose grew ${name}'s ${nonBreast[1]} — only her breasts change size; silently drop other-part growth`,
    })
  }

  // 3b. Magnitude overshoot: the prose claims a scale rungs above her band.
  // Measured against her APPARENT tier (engorged/pressure-prone swell included,
  // the same number the image layer renders), so a genuinely swollen girl gets
  // the benefit of that swell before anything fires.
  const herRung = imageSizeAnchorRung(apparentTier(state))
  for (const entry of MAGNITUDE_REGISTRY) {
    if (imageSizeAnchorRung(entry.minTier) - herRung < MAGNITUDE_RUNG_MARGIN) continue
    if (!matchAttributed(entry.pattern, text, offsets)) continue
    findings.push({
      kind: 'growth_magnitude',
      note: `the last scene wrote ${name} at ${entry.label} scale, far past her tracked band — silently narrate her at the size THIS block gives her and keep the scene's scale there`,
    })
    break // one magnitude note per character per turn
  }

  // 4. Omission (research/41): a staged growth directive that the prose ignored.
  if (state.lastGrowth && !GROWTH_LANGUAGE.test(text)) {
    findings.push({
      kind: 'growth_omitted',
      note: `${name}'s recent growth landed but was never rendered — render the visible change now, at her current tracked size`,
    })
  }

  // 5. Lactation contradiction, both directions (research/49 Step 7). Exactly one
  // of the two can apply — the guard is `active`, so they are mutually exclusive.
  const lactation = lactationOf(state)
  if (!lactation?.active) {
    if (
      !isMilkFullnessLegitimate(state) &&
      MILK_ACT.some((pattern) => matchAttributed(pattern, text, offsets))
    ) {
      findings.push({
        kind: 'lactation_drift',
        note: `${name} is not lactating — render fullness or arousal, not milk, until induction actually happens`,
      })
    }
  } else if (lactation.supplyTier >= DRY_DRIFT_MIN_TIER) {
    if (WRITTEN_DRY.some((pattern) => matchAttributed(pattern, text, offsets))) {
      findings.push({
        kind: 'lactation_drift',
        note: `${name}'s supply is engine-tracked at ${supplyLabel(lactation.supplyTier)} — do not write her dry`,
      })
    }
  }

  return findings
}
