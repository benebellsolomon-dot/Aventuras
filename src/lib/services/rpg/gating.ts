/**
 * RPG layer — gated interactions (research/46 §2.3, research/48 Step 8).
 *
 * COMPUTED, never stored: availability derives from bond/dependence/mass each
 * turn and feeds the choice generator as instruction text. Thresholds live
 * here and in be/tracks.ts band functions only — restating them anywhere else
 * is the drift risk research/48 warns about.
 */

export interface GateInput {
  name: string
  bond: number
  dependence: number
  massKg: number
  quirks: ReadonlyArray<string>
}

interface GateDef {
  id: string
  label: string
  available: (input: GateInput) => boolean
  requirement: string
}

// ⚠ D5-style reference defaults — re-derive from play.
export const GATED_INTERACTIONS: ReadonlyArray<GateDef> = [
  {
    id: 'intimate_handling',
    label: 'intimate handling',
    available: (i) => i.bond >= 45,
    requirement: 'bond: bonded or deeper',
  },
  {
    id: 'milking',
    label: 'milking',
    available: (i) => i.bond >= 45 && i.massKg >= 2.7,
    requirement: 'bond: bonded, and enough fullness to express',
  },
  {
    id: 'advanced_catalyst',
    label: 'advanced catalysts',
    available: (i) => i.bond >= 70 || i.dependence >= 35,
    requirement: 'deep trust, or an already-hooked appetite',
  },
  {
    id: 'deep_ritual',
    label: 'deep ritual workings',
    available: (i) => i.bond >= 70 && i.dependence >= 60,
    requirement: 'deep trust and a craving dependence',
  },
]

export interface InteractionAvailability {
  available: string[]
  locked: Array<{ id: string; requirement: string }>
}

export function availableInteractions(input: GateInput): InteractionAvailability {
  const available: string[] = []
  const locked: Array<{ id: string; requirement: string }> = []
  for (const gate of GATED_INTERACTIONS) {
    if (gate.available(input)) available.push(gate.id)
    else locked.push({ id: gate.id, requirement: gate.requirement })
  }
  return { available, locked }
}

/**
 * The per-girl availability instruction for the choice generator. Empty when
 * the roster is empty (cache-safety for non-BE and early-game stories).
 */
export function buildGatedActionsInstruction(inputs: ReadonlyArray<GateInput>): string {
  if (inputs.length === 0) return ''
  const lines = inputs.map((input) => {
    const { available } = availableInteractions(input)
    return `- ${input.name}: ${available.length > 0 ? available.join(', ') : 'no gated interactions yet'}`
  })
  return [
    '## Gated Interactions',
    'Some interactions unlock per character as trust, dependence, and her body develop. Currently available:',
    ...lines,
    'Do not offer a gated interaction (intimate handling, milking, advanced catalysts, deep rituals) that is not listed as available for that character.',
  ].join('\n')
}
