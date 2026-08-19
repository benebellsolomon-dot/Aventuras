/**
 * Per-provider prompt-syntax capabilities.
 *
 * Some providers front a local SD backend (si-bridge, a1111, comfyui) that
 * parses A1111-style prompt weighting (`(tag:1.20)`) natively. Endpoint
 * providers (nanogpt and the various cloud APIs) hand the prompt string
 * straight to a hosted model that has no such parser — the parens and
 * weight number would arrive as literal tokens, degrading the prompt
 * instead of emphasizing it.
 */

import type { ImageProviderType } from '$lib/types'

/** Providers whose backend parses A1111 `(tag:weight)` emphasis syntax. */
const WEIGHTING_CAPABLE_PROVIDERS: ReadonlySet<ImageProviderType> = new Set([
  'si-bridge',
  'a1111',
  'comfyui',
])

/**
 * Whether `providerType` parses A1111-style `(tag:weight)` prompt emphasis.
 * Unknown/undefined providers are treated conservatively as non-parsing.
 */
export function parsesPromptWeighting(providerType: ImageProviderType | undefined): boolean {
  return providerType !== undefined && WEIGHTING_CAPABLE_PROVIDERS.has(providerType)
}
