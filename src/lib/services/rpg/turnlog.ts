/**
 * RPG layer — the Harem tab's interleaved turn log (research/48 Step 9).
 *
 * ORDERING RULING (pinned — neither log carries a timestamp, so this is a
 * ruling, not a derivation): entries render newest-first by story order;
 * WITHIN one entry, checkLog rows precede beLog rows, because the check
 * resolved before narration and the BE events were extracted from it.
 */

import type { BeLogRecord } from '$lib/services/be'
import type { StoryEntry } from '$lib/types'
import type { CheckRecord } from './types'

export type TurnLogRow =
  | { kind: 'check'; entryId: string; record: CheckRecord }
  | { kind: 'be'; entryId: string; record: BeLogRecord }

export interface BeLogStyle {
  /** Display word for the log kind. */
  label: string
  /** Left-border tint class for the row. */
  tint: string
}

/** Every pre-Phase-3 kind keeps the row look the log has always had. */
const DEFAULT_BE_TINT = 'border-l-pink-400/70'

/** The Phase 3 lactation kinds (research/49 Step 8) — the only kinds that restyle. */
const BE_LOG_STYLES: Readonly<Record<string, BeLogStyle>> = {
  induction: { label: 'induction', tint: 'border-l-sky-400/70' },
  supply: { label: 'supply', tint: 'border-l-fuchsia-400/70' },
  yield: { label: 'milk yield', tint: 'border-l-amber-400/80' },
}

/**
 * Row presentation for one beLog kind. An unknown kind (an older save read by a
 * newer build, or the reverse) falls back to the raw kind word and the default
 * tint — the log degrades to what it rendered before, never to `undefined`.
 */
export function beLogStyle(kind: string): BeLogStyle {
  // Object.hasOwn, not `?? fallback`: plain-object indexing resolves inherited
  // keys, so a kind named 'constructor' or 'toString' would return a function
  // as the style (precedent: be/constants.ts fluidProfile).
  return Object.hasOwn(BE_LOG_STYLES, kind)
    ? BE_LOG_STYLES[kind]
    : { label: kind, tint: DEFAULT_BE_TINT }
}

export function buildTurnLog(entries: ReadonlyArray<StoryEntry>, limit = 30): TurnLogRow[] {
  const rows: TurnLogRow[] = []
  for (let i = entries.length - 1; i >= 0 && rows.length < limit; i--) {
    const entry = entries[i]
    const delta = entry.worldStateDelta
    if (!delta?.checkLog?.length && !delta?.beLog?.length) continue
    for (const record of delta.checkLog ?? []) {
      rows.push({ kind: 'check', entryId: entry.id, record })
    }
    for (const record of delta.beLog ?? []) {
      rows.push({ kind: 'be', entryId: entry.id, record })
    }
  }
  return rows.slice(0, limit)
}
