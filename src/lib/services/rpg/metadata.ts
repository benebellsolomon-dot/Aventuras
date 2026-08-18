/**
 * RPG layer — typed access to `character.metadata.rpgSheet` (research/47 Step 2).
 * Mirrors be/metadata.ts: piggyback on the metadata column for automatic
 * checkpoint/snapshot/branch coverage; `.passthrough()` at every object level
 * so a newer build's fields survive an older reader (31a lesson 3).
 */

import { z } from 'zod'
import { defaultRpgSheet } from './derive'
import type { RpgSheet } from './types'

export const RPG_SHEET_KEY = 'rpgSheet'

const attributesSchema = z
  .object({
    str: z.number().int(),
    dex: z.number().int(),
    con: z.number().int(),
    int: z.number().int(),
    wis: z.number().int(),
    cha: z.number().int(),
  })
  .passthrough()

export const rpgSheetSchema = z
  .object({
    level: z.number().int().positive(),
    unspentPoints: z
      .object({ attribute: z.number().int().nonnegative(), skill: z.number().int().nonnegative() })
      .passthrough(),
    attributes: attributesSchema,
    skills: z.record(z.string(), z.number().int().nonnegative()).default({}),
    essence: z
      .object({ current: z.number().nonnegative(), max: z.number().positive() })
      .passthrough(),
    knownSpells: z.array(z.string()).default([]),
    awardedMilestones: z.array(z.string()).default([]),
    driftNote: z.object({ note: z.string() }).passthrough().optional(),
  })
  .passthrough()

/**
 * The sheet every reader resolves against: the stored sheet, or the
 * deterministic default before the first persisted write. Single definition so
 * the check pipeline, prompt builder, and UI can never diverge on baseline.
 */
export function sheetOrDefault(metadata: Record<string, unknown> | null): RpgSheet {
  return readRpgSheet(metadata) ?? defaultRpgSheet()
}

/** Read the sheet out of a character's metadata; null when absent/unparseable. */
export function readRpgSheet(metadata: Record<string, unknown> | null): RpgSheet | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = metadata[RPG_SHEET_KEY]
  if (raw === undefined || raw === null) return null
  const parsed = rpgSheetSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data as RpgSheet
}

/**
 * Return a NEW metadata object with the sheet written, preserving every sibling
 * key (bodyState, runtimeVars, …). Deep copy — later mutation of the caller's
 * sheet cannot reach into the stored metadata.
 */
export function writeRpgSheet(
  metadata: Record<string, unknown> | null,
  sheet: RpgSheet,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [RPG_SHEET_KEY]: structuredClone(sheet) }
}
