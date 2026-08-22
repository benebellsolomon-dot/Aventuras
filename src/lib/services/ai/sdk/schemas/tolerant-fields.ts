/**
 * Tolerant field schemas shared by the structured outputs (D5 round 1b,
 * research/63).
 *
 * Aggregator providers (NanoGPT) forward `response_format` but the upstream
 * models do not reliably honour json-schema constraints, so a model that never
 * saw the enum writes `"Perception"`, `"athletics (STR)"`, `"dc": "12"` or
 * `"growthIntent": "true"`. The round-1 `.catch(undefined)` coercions stopped
 * that from voiding the whole response — but they also dropped the field
 * SILENTLY, and the DC chips simply vanished from every choice. These fields
 * first normalise the obvious shapes (case, label/parenthetical decoration,
 * numeric strings, non-integers, boolean words), then fall back to "unset" with
 * a `console.warn` (release builds too — `createLogger` is dev-only) naming the
 * field and the raw input.
 *
 * The response_format JSON schema is unchanged by the wrappers (test-pinned):
 * enums, integer bounds and descriptions all survive.
 */

import { z } from 'zod'

import { SKILL_IDS, type SkillId } from '$lib/services/rpg'

const SKILL_ID_SET: ReadonlySet<string> = new Set(SKILL_IDS)

const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && ['', 'none', 'null', 'n/a'].includes(value.trim().toLowerCase()))

/** Visible in dev AND release consoles (the debug logger is dev-only); blank inputs aren't worth a line. */
const warnDropped = (field: string, input: unknown, note: string): void => {
  if (!isBlank(input)) console.warn(`[TolerantFields] \`${field}\` ${note}`, { input })
}

const dropped =
  (field: string) =>
  (ctx: { input: unknown }): undefined => {
    warnDropped(field, ctx.input, 'dropped (unusable value)')
    return undefined
  }

/**
 * "Perception" → "perception", "athletics (STR)" → "athletics", "Stealth check"
 * → "stealth" (the unique skill id appearing as a whole word wins when the
 * exact fold misses; two candidates is ambiguous and stays a miss).
 */
export const normalizeSkillInput = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const key = value
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z_\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  if (key === '') return undefined
  if (SKILL_ID_SET.has(key)) return key
  const hits = key.split('_').filter((word) => SKILL_ID_SET.has(word))
  return new Set(hits).size === 1 ? hits[0] : key
}

/** "12" → 12, 11.6 → 12, "" → undefined; anything else passes through to fail the inner schema. */
export const looseInt = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Math.round(parsed) : value
  }
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : value
  return value
}

/** "true"/"yes"/1 → true, "false"/"no"/0 → false; anything else passes through to fail. */
export const looseBoolean = (value: unknown): unknown => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : value
  if (typeof value !== 'string') return value
  const key = value.trim().toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(key)) return true
  if (['false', 'no', 'n', '0', ''].includes(key)) return false
  return value
}

const lowercaseTrim = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value

/** Optional skill id; decorated/cased forms normalise, anything else drops with a warning. */
export const skillIdField = (
  description: string,
): z.ZodType<SkillId | undefined, z.ZodTypeDef, unknown> =>
  z
    .preprocess(normalizeSkillInput, z.enum(SKILL_IDS))
    .optional()
    .catch(dropped('skill'))
    .describe(description)

/** Optional bounded integer; numeric strings and floats normalise, out-of-range drops with a warning. */
export const boundedIntField = (
  field: string,
  min: number,
  max: number,
  description: string,
): z.ZodType<number | undefined, z.ZodTypeDef, unknown> =>
  z
    .preprocess(looseInt, z.number().int().min(min).max(max))
    .optional()
    .catch(dropped(field))
    .describe(description)

/** Optional boolean; boolean words normalise, anything else drops with a warning. */
export const looseBooleanField = (
  field: string,
  description: string,
): z.ZodType<boolean | undefined, z.ZodTypeDef, unknown> =>
  z.preprocess(looseBoolean, z.boolean()).optional().catch(dropped(field)).describe(description)

/** Optional free string; a non-string drops with a warning instead of voiding the parse. */
export const looseStringField = (
  field: string,
  description: string,
): z.ZodType<string | undefined, z.ZodTypeDef, unknown> =>
  z.string().optional().catch(dropped(field)).describe(description)

/** Required enum with case tolerance; an off-list value falls back with a warning instead of voiding the parse. */
export const looseEnumField = <const T extends readonly [string, ...string[]]>(
  field: string,
  values: T,
  fallback: T[number],
  description: string,
): z.ZodType<T[number], z.ZodTypeDef, unknown> =>
  z
    .preprocess(lowercaseTrim, z.enum(values))
    .catch((ctx) => {
      warnDropped(field, ctx.input, `off-list, using "${fallback}"`)
      return fallback
    })
    .describe(description)

/** Optional enum with case tolerance; an off-list value drops with a warning instead of voiding the parse. */
export const looseOptionalEnumField = <const T extends readonly [string, ...string[]]>(
  field: string,
  values: T,
  description: string,
): z.ZodType<T[number] | undefined, z.ZodTypeDef, unknown> =>
  z.preprocess(lowercaseTrim, z.enum(values)).optional().catch(dropped(field)).describe(description)
