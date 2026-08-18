/**
 * Types for bundled pack definitions — code-shipped starter packs the user
 * can instantiate from the Create Pack dialog. Unlike the default pack, a
 * bundled pack is a normal user pack after creation (never auto-refreshed).
 */

import type { CustomVariable, RuntimeVariable } from '../types'

/** Custom variable seed: everything but the DB-assigned fields. */
export type BundledCustomVariable = Omit<CustomVariable, 'id' | 'packId' | 'createdAt'>

/** Runtime variable seed: everything but the DB-assigned fields. */
export type BundledRuntimeVariable = Omit<RuntimeVariable, 'id' | 'packId' | 'createdAt'>

export interface BundledPackDefinition {
  /** Stable identifier for the bundle (not the created pack's ID). */
  bundleId: string
  /** Default pack name (user-editable at creation). */
  name: string
  description: string
  author: string
  /**
   * Transforms applied to baseline PROMPT_TEMPLATES content, keyed by
   * templateId. Templates without a transform are seeded unchanged.
   */
  templateTransforms: Record<string, (baselineContent: string) => string>
  customVariables: BundledCustomVariable[]
  runtimeVariables: BundledRuntimeVariable[]
}
