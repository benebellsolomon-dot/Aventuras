/**
 * Scene presence for the [BODY STATE] block.
 *
 * Every character carrying bodyState used to get a full body-state block in
 * EVERY narrative prompt, including characters standing off-screen three towns
 * away — pure token bloat. This module reuses the presence signal the engine
 * already persists: the classifier writes `scene.presentCharacterNames` into
 * each narration entry's `worldStateDelta.classificationResult` (the same read
 * VnView uses to pick standees). No new tracking.
 *
 * Bias: when in doubt, INCLUDE. Narration correctness beats token savings, so
 * an unreadable/absent/unmatched presence signal falls back to the full cast.
 */

/** Narration entries are checked back this far; the classifier intermittently returns []. */
export const PRESENCE_LOOKBACK = 10

export interface PresenceEntrySource {
  type: string
  worldStateDelta?: { classificationResult?: Record<string, unknown> | null } | null
}

interface ClassificationScene {
  scene?: { presentCharacterNames?: unknown }
}

const normalize = (name: string): string => name.trim().toLowerCase()

/** The module's matching key for a character name — trimmed and lowercased. */
export const normalizePresenceName = normalize

/**
 * The most recent non-empty classifier presence list, normalized for matching.
 * `null` means presence is UNKNOWN (no narration entry in the lookback window
 * carried one) — callers must treat that as "include everyone".
 */
export function readScenePresence(
  entries: PresenceEntrySource[],
  lookback: number = PRESENCE_LOOKBACK,
): Set<string> | null {
  let checked = 0
  for (let i = entries.length - 1; i >= 0 && checked < lookback; i--) {
    const entry = entries[i]
    if (entry.type !== 'narration' || !entry.worldStateDelta) continue
    checked += 1
    const result = entry.worldStateDelta.classificationResult as ClassificationScene | null
    const names = result?.scene?.presentCharacterNames
    if (!Array.isArray(names) || names.length === 0) continue
    const present = new Set(names.filter((n): n is string => typeof n === 'string').map(normalize))
    if (present.size > 0) return present
  }
  return null
}

/**
 * Narrow a list of named characters to those present in the current scene.
 * Returns the input unchanged when presence is unknown or when the signal
 * matches none of them (a classifier naming only untracked extras must not
 * blank the block).
 */
export function selectScenePresent<T extends { name: string }>(
  candidates: T[],
  entries: PresenceEntrySource[],
  options?: { alwaysInclude?: string[] },
): T[] {
  if (candidates.length === 0) return candidates
  const present = readScenePresence(entries)
  if (!present) return candidates

  const pinned = new Set((options?.alwaysInclude ?? []).map(normalize))
  const matched = candidates.filter((c) => present.has(normalize(c.name)))
  if (matched.length === 0) return candidates

  return candidates.filter((c) => {
    const name = normalize(c.name)
    return pinned.has(name) || present.has(name)
  })
}

/**
 * The ACTIVE CAST bound (research/61): the union of every presence list across
 * the lookback window's narration entries — everyone the classifier placed in
 * a scene recently. Unlike readScenePresence (most recent list only), this
 * accumulates across entries; it bounds which characters the agenda engine
 * ticks and renders, so a character who drifted out of the story's orbit
 * freezes instead of accruing writes forever. Empty set when no entry in the
 * window carried a list — callers treat that as "no active cast", never as
 * "everyone".
 */
export function recentPresenceUnion(
  entries: PresenceEntrySource[],
  lookback: number = PRESENCE_LOOKBACK,
): Set<string> {
  const union = new Set<string>()
  let checked = 0
  for (let i = entries.length - 1; i >= 0 && checked < lookback; i--) {
    const entry = entries[i]
    if (entry.type !== 'narration' || !entry.worldStateDelta) continue
    checked += 1
    const result = entry.worldStateDelta.classificationResult as ClassificationScene | null
    const names = result?.scene?.presentCharacterNames
    if (!Array.isArray(names)) continue
    for (const name of names) {
      if (typeof name === 'string' && name.trim().length > 0) union.add(normalize(name))
    }
  }
  return union
}

/**
 * Classifier arrays whose entries carry a `character` name. Every one of them
 * describes something that HAPPENED to her in this response (a growth event, an
 * observed attitude/arousal read, a condition the scene established, a bond
 * beat, a catalyst dose) — none of which is possible off-screen. They are
 * therefore presence evidence exactly as strong as the presence list itself.
 */
const PRESENCE_IMPLYING_ARRAYS = [
  'beEvents',
  'beStates',
  'beConditions',
  'bondEvents',
  'exposureEvents',
] as const

/**
 * Every character name this turn's classifier output referenced through a
 * character-scoped array. Raw (un-normalized) names, duplicates included;
 * malformed entries are skipped, matching the tolerant *FromResult coercions.
 */
export function referencedCharacterNames(
  classification: Record<string, unknown> | null | undefined,
): string[] {
  if (!classification) return []
  const names: string[] = []
  for (const field of PRESENCE_IMPLYING_ARRAYS) {
    const raw = classification[field]
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue
      const name = (item as { character?: unknown }).character
      if (typeof name === 'string' && name.trim().length > 0) names.push(name)
    }
  }
  return names
}

export interface EffectivePresenceInput {
  /** The classifier's explicit `scene.presentCharacterNames` (any shape — tolerated). */
  presentCharacterNames?: unknown
  /** The whole classification result, for its character-scoped event arrays. */
  classification?: Record<string, unknown> | null
  /** This turn's resolved check target (tagged or engine-inferred), when there is one. */
  checkTargetName?: string | null
  /** Every tracked body-state girl — the include-when-in-doubt fallback. */
  trackedNames?: readonly string[]
}

/**
 * The set of characters this turn's engine treats as on-scene, normalized for
 * matching. ONE derivation, shared by every in-turn presence consumer, because
 * the classifier's presence field is flaky and each consumer degrading on its
 * own produced a turn where the engine silently sat out entirely.
 *
 * Precedence (union, then fallback):
 *   1. the explicit presence list (trimmed, non-empty entries),
 *   2. UNION every name referenced by this turn's character-scoped classifier
 *      arrays (beEvents/beStates/beConditions/bondEvents/exposureEvents) plus the
 *      resolved check target — a turn that acted on her by name places her in the
 *      scene even when the presence field forgot her,
 *   3. still empty → every tracked girl. Per this module's include-when-in-doubt
 *      bias (see the header): one classifier hiccup must not switch the engine
 *      off, and a passive fill/mood tick for a briefly-mislabeled scene is a far
 *      smaller error than a turn where nobody is processed at all.
 *
 * Pure: no store, no I/O.
 */
export function effectivePresence(input: EffectivePresenceInput): Set<string> {
  const present = new Set<string>()
  const add = (name: unknown): void => {
    if (typeof name === 'string' && name.trim().length > 0) present.add(normalize(name))
  }

  if (Array.isArray(input.presentCharacterNames)) input.presentCharacterNames.forEach(add)
  referencedCharacterNames(input.classification).forEach(add)
  add(input.checkTargetName)
  if (present.size > 0) return present

  for (const name of input.trackedNames ?? []) add(name)
  return present
}
