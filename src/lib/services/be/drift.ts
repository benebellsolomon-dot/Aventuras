/**
 * BE engine — output-side drift detection (Spec 1 Task 6). Pure regex/string
 * work, no store deps. Ports the three Era-1 detectors (research/36 §3,
 * ambrosia-st narration.js) plus the research/41 omission detector.
 *
 * All comparisons run against the PRE-reduce state — the state the narrator was
 * shown when it wrote this prose — never against nextState. Findings feed the
 * reducer's step-9 driftNote and render as a [CONTINUITY] correction next turn.
 */

import { cupLetter, tierForCupLetter } from './ladder'
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

// "grew/growing" only counts with a size adjective — bare "grew" false-positives
// on ambient prose ("her shoulders grew tense", "legs grew tired"); the
// unambiguous size verbs (swell/expand/widen/thicken) stand alone.
const NON_BREAST_GROWTH =
  /\b(hips?|waist|rear|butt|backside|thighs?|shoulders?|arms?|legs?|frame|stature)\b[^.!?]{0,60}?\b(?:(?:grew|grow(?:ing|s)?)\s+(?:bigger|larger|fuller|heavier|wider|rounder|thicker)|swell(?:ing|ed|s)?|expand(?:ing|ed|s)?|widen(?:ing|ed|s)?|thicken(?:ing|ed|s)?)\b/i

/** Change-language lexicon: state words like "swollen" don't count — the
 * research/41 miss was exactly ambient state description with no change beat. */
const GROWTH_LANGUAGE =
  /\b(grew|grow(?:ing|s|th)?|swell(?:ing|ed|s)?|expand(?:ing|ed|s)?|bigger|larger|fuller|heavier|stretch(?:ing|ed)\b[^.!?]{0,40}\b(?:skin|mark))\b/i

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

  // 4. Omission (research/41): a staged growth directive that the prose ignored.
  if (state.lastGrowth && !GROWTH_LANGUAGE.test(text)) {
    findings.push({
      kind: 'growth_omitted',
      note: `${name}'s recent growth landed but was never rendered — render the visible change now, at her current tracked size`,
    })
  }

  return findings
}
