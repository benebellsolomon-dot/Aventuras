/**
 * Size-band → bridge tier marker.
 *
 * The si-animator-bridge's A1111 shim recognizes a `__betier_<N>__` prompt prefix
 * and maps it to its size-noun ladder; at tier >= 30 it additionally routes to the
 * rebalanced Krea workflow with a 4x adherence amplifier — the single biggest
 * accuracy lever for large-size renders (ambrosia-st research/32). Prompts without
 * the marker get no size handling from the bridge at all.
 *
 * This helper derives the marker from the size-band vocabulary already present in
 * a prompt (largest band wins). Prompts with no band words return '' — scenery and
 * non-character images stay unmarked.
 *
 * Tier anchors mirror the bridge's `_KREA_TIER_NOUNS` table; keep in sync with it.
 */

const BAND_TIERS: ReadonlyArray<readonly [RegExp, number]> = [
  [/hyper breasts/i, 45],
  [/gigantic breasts/i, 39],
  [/huge breasts/i, 29],
  [/large breasts/i, 21],
  [/medium breasts/i, 13],
  [/small breasts/i, 3],
  [/flat chest/i, 0],
]

/**
 * Returns a `__betier_<N>__ ` prefix (trailing space included) for the largest
 * size band found in the prompt, or '' when no band vocabulary is present.
 */
export function sizeBandMarker(prompt: string): string {
  for (const [pattern, tier] of BAND_TIERS) {
    if (pattern.test(prompt)) return `__betier_${tier}__ `
  }
  return ''
}

/**
 * Marker straight from the ENGINE tier — always preferred over sizeBandMarker
 * when the caller knows the actual tier: the text-derived path can only guess
 * the top of the band (tier 22 and 29 both read "huge breasts" → 29), while
 * this carries the exact tier the bridge should render.
 */
export function tierMarker(tier: number | null | undefined): string {
  if (tier === null || tier === undefined || !Number.isFinite(tier)) return ''
  return `__betier_${Math.max(0, Math.round(tier))}__ `
}
