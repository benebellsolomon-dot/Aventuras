/**
 * Classifier schema-extension arrays carry no hard maxItems/maxLength
 * (truncate-not-reject: a hard cap would fail the WHOLE parse on providers
 * that don't enforce them, silently voiding the turn's entity updates), so the
 * raw result is bounded HERE, at the extension seam, before it flows to the
 * extractors and is persisted verbatim on the entry
 * (worldStateDelta.classificationResult — copied into every snapshot and
 * branch). Arrays keep headroom above the engine cap so the extractors can
 * still skip malformed leading entries; entry strings cap above every
 * extractor's own sanitize cap, so downstream extraction is unaffected.
 */

import { MAX_BE_CONDITIONS, MAX_BE_EVENTS_PER_TURN } from '$lib/services/be'
import {
  CHEKHOV_MAX_LOADS_PER_TURN,
  CHEKHOV_MAX_RESOLVED_PER_TURN,
  GM_NOTES_MAX_ADDS_PER_TURN,
  GM_NOTES_MAX_DROPS_PER_TURN,
  MAX_AGENDA_PROPOSALS,
} from '$lib/services/worldsim'
import { RPG_TITLES_MAX_PER_TURN } from '$lib/services/rpg'

const EXTENSION_ARRAY_ENGINE_CAPS: ReadonlyArray<readonly [string, number]> = [
  ['beEvents', MAX_BE_EVENTS_PER_TURN],
  ['beStates', MAX_BE_EVENTS_PER_TURN],
  ['beConditions', MAX_BE_CONDITIONS],
  ['bondEvents', MAX_BE_EVENTS_PER_TURN],
  ['exposureEvents', MAX_BE_EVENTS_PER_TURN],
  ['growthTriggers', MAX_BE_EVENTS_PER_TURN],
  ['agendaProposals', MAX_AGENDA_PROPOSALS],
  ['narrativeDebt', CHEKHOV_MAX_LOADS_PER_TURN],
  ['resolvedDebts', CHEKHOV_MAX_RESOLVED_PER_TURN],
  ['gmNotesAdd', GM_NOTES_MAX_ADDS_PER_TURN],
  ['gmNotesDrop', GM_NOTES_MAX_DROPS_PER_TURN],
  ['titlesEarned', RPG_TITLES_MAX_PER_TURN],
]
const EXTENSION_FLOW_HEADROOM = 4
const EXTENSION_STRING_MAX = 256
const EXTENSION_NESTED_ARRAY_MAX = 16

const boundExtensionString = (value: unknown): unknown =>
  typeof value === 'string' && value.length > EXTENSION_STRING_MAX
    ? value.slice(0, EXTENSION_STRING_MAX)
    : value

const boundExtensionEntry = (entry: unknown): unknown => {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return boundExtensionString(entry)
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entry)) {
    out[key] = Array.isArray(value)
      ? value.slice(0, EXTENSION_NESTED_ARRAY_MAX).map(boundExtensionString)
      : boundExtensionString(value)
  }
  return out
}

/**
 * Returns a copy of the result with the known extension arrays bounded, plus a
 * per-field report of raw counts over the ENGINE cap — the extractors truncate
 * that overflow silently, and pre-conversion it surfaced loudly as a parse
 * failure, so the log line this feeds is the only remaining signal.
 */
export function boundClassifierExtensionArrays(result: Record<string, unknown>): {
  result: Record<string, unknown>
  overflow: Record<string, string>
} {
  const overflow: Record<string, string> = {}
  let bounded: Record<string, unknown> | null = null
  for (const [field, engineCap] of EXTENSION_ARRAY_ENGINE_CAPS) {
    const raw = result[field]
    if (!Array.isArray(raw)) continue
    if (raw.length > engineCap) overflow[field] = `${raw.length}>${engineCap}`
    bounded ??= { ...result }
    bounded[field] = raw.slice(0, engineCap * EXTENSION_FLOW_HEADROOM).map(boundExtensionEntry)
  }
  return { result: bounded ?? result, overflow }
}
