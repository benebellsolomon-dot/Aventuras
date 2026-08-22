/**
 * RPG Sheet — "how far until the next level" (Ben, 2026-08-22 playtest).
 *
 * Levels are earned one per interaction milestone a tracked girl's carried
 * mass crosses (be/milestones.ts via applyLevelGrants), so the honest progress
 * bar is per girl: her mass between the last milestone she passed and the
 * next one ahead. Pure — the panel is markup only.
 */
import { INTERACTION_MILESTONES, measurements, type BodyState } from '$lib/services/be'

export interface LevelProgressRow {
  name: string
  /** Carried mass now (kg, both sides, incl. fill) — the same number the crossing check uses. */
  massKg: number
  /** The milestone ahead, or null when she is past the top of the ladder. */
  next: { label: string; massKg: number; remainingKg: number; pct: number } | null
}

/** Per-girl progress toward her next milestone (= the player's next level), nearest first. */
export function levelProgress(
  girls: ReadonlyArray<{ name: string; state: BodyState }>,
): LevelProgressRow[] {
  const rows = girls.map(({ name, state }) => {
    const massKg = measurements(state).nowTotalKg
    const index = INTERACTION_MILESTONES.findIndex((m) => massKg < m.massKg)
    if (index === -1) return { name, massKg, next: null }
    const next = INTERACTION_MILESTONES[index]
    const floor = index === 0 ? 0 : INTERACTION_MILESTONES[index - 1].massKg
    const span = Math.max(1e-6, next.massKg - floor)
    const pct = Math.max(0, Math.min(100, Math.round(((massKg - floor) / span) * 100)))
    return {
      name,
      massKg,
      next: { label: next.label, massKg: next.massKg, remainingKg: next.massKg - massKg, pct },
    }
  })
  return rows.sort((a, b) => {
    if (!a.next) return 1
    if (!b.next) return -1
    return a.next.remainingKg - b.next.remainingKg
  })
}
