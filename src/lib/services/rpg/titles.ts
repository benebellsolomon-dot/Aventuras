/**
 * E7 — earned titles (research/65; FF5.2 "Titles/feats as check modifiers").
 *
 * A clear, completed accomplishment the classifier observes ("talked the
 * warden down", "slew the bog wyrm") becomes a title on the sheet ("Charmer",
 * "Slayer") that grants a flat +1 on the skills it covers. Engine-owned:
 * idempotent on the normalized name, at most one award per turn, eight in all;
 * the classifier only PROPOSES. Penalties are never awarded — an accomplishment
 * detector has no business handing out curses (FF's ±1..2 collapses to +1).
 *
 * Pure; `applyRpgTurn` in the story store is the single writer.
 */

import { SKILL_BY_ID, SKILL_IDS } from './constants'
import type { CheckModifier, RpgSheet, RpgTitle, SkillId } from './types'

export const RPG_TITLES_MAX = 8
export const RPG_TITLES_MAX_PER_TURN = 1
export const RPG_TITLE_BONUS = 1
export const RPG_TITLE_NAME_MAX = 24
export const RPG_TITLE_REASON_MAX = 120
export const RPG_TITLE_MAX_SKILLS = 3

export type { RpgTitle }

/** A validated proposal (classifier extraction output). */
export interface RpgTitleLoad {
  name: string
  skills: SkillId[]
  reason: string
}

/**
 * Prompt-surface sanitizer (the worldsim debt-text rules, local to avoid a
 * cross-service import): control/format codepoints out, []/#/` neutralized,
 * whitespace collapsed, capped.
 */
export function sanitizeTitleText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g, '')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/[`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/** Idempotency key: case/whitespace-insensitive name. */
export const normalizeTitleName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const isSkillId = (value: unknown): value is SkillId =>
  typeof value === 'string' && (SKILL_IDS as ReadonlyArray<string>).includes(value)

/** Normalize one stored/proposed title; null when unusable. */
export function normalizeTitle(raw: unknown): RpgTitle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const name = sanitizeTitleText(record.name, RPG_TITLE_NAME_MAX)
  if (name === '') return null
  const skills = Array.isArray(record.skills)
    ? (Array.from(new Set(record.skills.filter(isSkillId))) as SkillId[]).slice(
        0,
        RPG_TITLE_MAX_SKILLS,
      )
    : []
  if (skills.length === 0) return null
  return { name, skills, reason: sanitizeTitleText(record.reason, RPG_TITLE_REASON_MAX) }
}

/** The sheet's titles, normalized and deduped (a missing field reads as none). */
export function sheetTitles(sheet: RpgSheet): RpgTitle[] {
  const out: RpgTitle[] = []
  const seen = new Set<string>()
  for (const raw of sheet.titles ?? []) {
    const title = normalizeTitle(raw)
    if (!title) continue
    const key = normalizeTitleName(title.name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(title)
    if (out.length >= RPG_TITLES_MAX) break
  }
  return out
}

export interface AwardTitlesResult {
  sheet: RpgSheet
  awarded: RpgTitle[]
}

/**
 * Award this turn's proposals: idempotent on the normalized name, at most
 * RPG_TITLES_MAX_PER_TURN per call, never beyond RPG_TITLES_MAX in all. Returns
 * the SAME sheet object when nothing was awarded (value-identity skip upstream).
 */
export function awardTitles(
  sheet: RpgSheet,
  loads: ReadonlyArray<RpgTitleLoad>,
): AwardTitlesResult {
  const existing = sheetTitles(sheet)
  const seen = new Set(existing.map((t) => normalizeTitleName(t.name)))
  const awarded: RpgTitle[] = []
  for (const load of loads) {
    if (awarded.length >= RPG_TITLES_MAX_PER_TURN) break
    if (existing.length + awarded.length >= RPG_TITLES_MAX) break
    const title = normalizeTitle(load)
    if (!title) continue
    const key = normalizeTitleName(title.name)
    if (seen.has(key)) continue
    seen.add(key)
    awarded.push(title)
  }
  if (awarded.length === 0) return { sheet, awarded }
  return { sheet: { ...sheet, titles: [...existing, ...awarded] }, awarded }
}

/** +1 per title whose skills cover the check skill. */
export function buildTitleCheckModifiers(sheet: RpgSheet, skill: SkillId): CheckModifier[] {
  return sheetTitles(sheet)
    .filter((t) => t.skills.includes(skill))
    .map((t) => ({ label: `title: ${t.name}`, value: RPG_TITLE_BONUS }))
}

/** "Charmer (Persuasion, Seduction); Slayer (Athletics)" — for the sheet block / panel. */
export function formatTitles(sheet: RpgSheet): string {
  return sheetTitles(sheet)
    .map((t) => `${t.name} (${t.skills.map((id) => SKILL_BY_ID.get(id)?.label ?? id).join(', ')})`)
    .join('; ')
}
