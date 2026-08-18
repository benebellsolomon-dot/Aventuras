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
