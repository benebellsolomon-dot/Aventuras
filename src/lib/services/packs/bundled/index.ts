import { breastExpansionBundle } from './breast-expansion'
import type { BundledPackDefinition } from './types'

export type { BundledPackDefinition } from './types'

/** All bundled packs available in the Create Pack dialog. */
export const BUNDLED_PACKS: BundledPackDefinition[] = [breastExpansionBundle]

export function getBundledPack(bundleId: string): BundledPackDefinition | undefined {
  return BUNDLED_PACKS.find((b) => b.bundleId === bundleId)
}
