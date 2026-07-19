/**
 * BE engine — interaction milestones (Spec 1 Task 8): the "what her size means
 * physically" ladder, keyed on carried breast mass (kg, both sides, current —
 * fluid load included; a full bust interacts at its full weight).
 *
 * Rows ported verbatim from the NAI-era engine's INTERACTION_MILESTONES
 * (be-story-engine ambrosia-v0.4.7, in-house). The source split drivers
 * (projection/width/volume/load); the app keys every row on its mass threshold
 * — the derived measurement surfaces already carry the geometric detail.
 */

export interface InteractionMilestone {
  massKg: number
  label: string
}

export const INTERACTION_MILESTONES: ReadonlyArray<InteractionMilestone> = [
  { massKg: 1.5, label: 'can no longer go braless comfortably' },
  { massKg: 2.7, label: 'cleavage visible in any neckline' },
  { massKg: 4.0, label: 'cannot see her own feet when standing' },
  { massKg: 6.0, label: 'cannot reach past them to touch her toes' },
  { massKg: 7.5, label: 'her lap disappears beneath them when seated' },
  { massKg: 10.0, label: 'breasts press warmly between them whenever she embraces someone' },
  { massKg: 14.0, label: 'must turn sideways to fit through standard doorways' },
  { massKg: 20.0, label: 'cannot reach the ground past them when standing' },
  { massKg: 30.0, label: 'cannot stand unaided for extended periods' },
  { massKg: 45.0, label: 'cannot fit in a standard chair' },
  { massKg: 70.0, label: 'requires custom-built furniture to sit' },
  { massKg: 130.0, label: 'requires structural modifications to any room she occupies' },
  {
    massKg: 180.0,
    label:
      'requires custom architecture — no standard furniture, vehicle, or doorway can accommodate her',
  },
]

/** The next milestone strictly ahead of the given carried mass, or null past the top. */
export function nextMilestone(massKg: number): { label: string; remaining: number } | null {
  for (const milestone of INTERACTION_MILESTONES) {
    if (massKg < milestone.massKg) {
      return { label: milestone.label, remaining: milestone.massKg - massKg }
    }
  }
  return null
}
