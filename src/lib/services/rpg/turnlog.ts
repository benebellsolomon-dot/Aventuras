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
