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

/**
 * Providers whose backend parses A1111 `(tag:weight)` emphasis syntax.
 *
 * nanogpt is excluded DELIBERATELY, and this is measured rather than assumed:
 * on 2026-08-20 a down-weight discriminator — `(blue hair:0.2)` in an otherwise
 * normal prompt — rendered blue-dominant hair, exactly as an unparsed literal
 * would. Its endpoint hands the string to a hosted model with no weighting
 * parser, so weighting is NOT an available emphasis lever there; tag ORDER and
 * the negative prompt are (see booruPromptWriter's size hoist and dialect.ts's
 * sizeNegativeForPrompt). Do not add nanogpt here without re-running that test.
 */
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

/**
 * Whether the provider's backend splits long prompts into multiple 77-token
 * CLIP windows (A1111-style chunking). The local SD backends do; endpoint
 * providers hand the string to a hosted pipeline that TRUNCATES at the first
 * window — measured on nanogpt 2026-08-21: the app's real ~120-token prompt
 * lost its entire scene tail (castle/rain/night rendered as a bare wall),
 * while a ~40-token control with identical scene tags rendered every one.
 * Unknown providers are treated conservatively as single-window.
 */
export function chunksLongPrompts(providerType: ImageProviderType | undefined): boolean {
  return providerType !== undefined && WEIGHTING_CAPABLE_PROVIDERS.has(providerType)
}
