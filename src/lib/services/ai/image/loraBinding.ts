/**
 * Per-character LoRA binding helpers (pure).
 *
 * Two provider-facing outputs from a CharacterLoraConfig:
 *  - trigger-word text prepended to the image prompt (works on every provider),
 *  - a resolved LoRA file + weight for LoRA-capable providers (ComfyUI), where
 *    the weight scales with the BE engine tier so a size LoRA can strengthen as
 *    a character grows.
 */

import type { CharacterLoraConfig } from '$lib/types'

const DEFAULT_BASE_WEIGHT = 1
const DEFAULT_TIER_SCALE = 0
const DEFAULT_MAX_WEIGHT = 1.5

/** Resolved LoRA for a provider workflow. */
export interface ResolvedLora {
  name: string
  strengthModel: number
  strengthClip: number
}

/**
 * Compute the effective LoRA weight at a given engine tier:
 *   clamp(baseWeight + tierScale * tier, 0, maxWeight)
 * Non-finite inputs fall back to defaults; tier is floored at 0.
 */
export function resolveLoraWeight(config: CharacterLoraConfig, tier: number): number {
  const base = Number.isFinite(config.baseWeight)
    ? (config.baseWeight as number)
    : DEFAULT_BASE_WEIGHT
  const scale = Number.isFinite(config.tierScale)
    ? (config.tierScale as number)
    : DEFAULT_TIER_SCALE
  // Floor max at 0 so a negative maxWeight can't invert the clamp into a
  // negative result (the contract is clamp(..., 0, maxWeight)).
  const max = Math.max(
    0,
    Number.isFinite(config.maxWeight) ? (config.maxWeight as number) : DEFAULT_MAX_WEIGHT,
  )
  const t = Number.isFinite(tier) ? Math.max(0, tier) : 0
  const raw = base + scale * t
  return Math.min(Math.max(raw, 0), max)
}

/**
 * Resolve a config + tier into a provider LoRA, or null when no LoRA file is
 * bound (trigger-words-only configs return null here — their text still flows
 * through loraTriggerText).
 */
export function resolveLora(
  config: CharacterLoraConfig | null | undefined,
  tier: number,
): ResolvedLora | null {
  const name = config?.name?.trim()
  if (!config || !name) return null
  const weight = resolveLoraWeight(config, tier)
  return { name, strengthModel: weight, strengthClip: weight }
}

/**
 * Trigger-word prefix for a set of configs (deduped, order-preserving). Empty
 * string when none carry trigger words. Callers prepend this to the prompt.
 */
export function loraTriggerText(
  configs: ReadonlyArray<CharacterLoraConfig | null | undefined>,
): string {
  const seen = new Set<string>()
  const words: string[] = []
  for (const config of configs) {
    const raw = config?.triggerWords?.trim()
    if (!raw) continue
    for (const word of raw.split(/[;,\n]/).map((w) => w.trim())) {
      if (!word) continue
      const key = word.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      words.push(word)
    }
  }
  return words.join(', ')
}
