/**
 * Image Provider Interface & Types
 *
 * Defines the contract for standalone image generation providers.
 * Each provider makes direct HTTP calls instead of going through the Vercel AI SDK.
 */

import type { ImageProviderType } from '$lib/types'
// Provider specific types
export type ComfySamplerInfo = {
  samplers: string[]
  schedulers: string[]
}

/** A user-uploaded ComfyUI API-format workflow with auto-detected field paths. */
export interface ComfyCustomWorkflow {
  /** The raw API-format workflow JSON (node IDs as keys). */
  workflow: Record<
    string,
    { inputs: Record<string, unknown>; class_type: string; _meta?: { title?: string } }
  >
  /** Dot-path to the positive CLIPTextEncode text input, e.g. "57:27.inputs.text" */
  positivePromptPath: string
  /** Dot-path to the seed input on the KSampler node, e.g. "57:3.inputs.seed" */
  seedPath: string
  /** Node ID of the SaveImage output node, e.g. "9" */
  outputNodeId: string
  /** Dot-path to the negative CLIPTextEncode text input, if detected — null otherwise. */
  negativePromptPath: string | null
}

/**
 * One subject in a bridge StructuredImageSpec (si-animator-bridge contract §2).
 * `tier_index` rides the shared 0-51 cup-band scalar (see bridgeSpec.bridgeTierIndex);
 * identity travels as `appearance_excerpt` free text — the bridge infers flat
 * fields from it, so no caller-side descriptor parsing. NOTE: be_moments is a
 * SPEC-level field only — SpecCharacter has no such field server-side, and
 * character-level extras are silently ignored (extra="allow").
 */
export interface BridgeSpecCharacter {
  sex?: 'female' | 'male'
  tier_index: number
  build?: string
  breast_shape?: string
  hair_color?: string
  hair_style?: string
  eye_color?: string
  skin_tone?: string
  appearance_excerpt?: string
}

/**
 * The structured request body for the bridge's native `POST /image`. The bridge
 * owns the prompt recipe: send structure, never hand-built prompt strings.
 * Unknown keys are ignored bridge-side, so this can trail the live contract safely.
 */
export interface StructuredImageSpecInput {
  register?: 'color' | 'manga'
  intimacy?: 'clean' | 'suggestive' | 'nude' | 'explicit'
  characters: BridgeSpecCharacter[]
  scene_tags?: string[]
  location?: string | null
  lighting_tag?: string | null
  be_moments?: string[]
  intimate_moments?: string[]
  regional?: boolean
  extra_tags?: string[]
  style_preset?: 'clean_premium' | 'painterly_glow' | 'semireal' | 'none'
}

export interface ImageGenerateOptions {
  model: string
  prompt: string
  size: string
  referenceImages?: string[] // raw base64 (no data: prefix)
  signal?: AbortSignal
  providerOptions?: Record<string, unknown>
  /** Structured spec for the si-bridge provider; other providers ignore it. */
  spec?: StructuredImageSpecInput
  /**
   * si-bridge FaceID/OpenPose identity-hold (Spec 4 B1): bare base64 of the
   * approved anchor render. Routes the request onto the openpose_faceid
   * workflow bridge-side while the spec still drives tier sizing.
   */
  poseFaceAnchor?: string
  faceidWeight?: number
  openposeStrength?: number
  /** Deterministic seed (sprite sets share one per character+appearance). */
  seed?: number
}

export interface ImageGenerateResult {
  base64: string
  revisedPrompt?: string
}

export interface ImageModelInfo {
  id: string
  name: string
  description?: string
  supportsSizes: string[]
  supportsImg2Img: boolean
  costPerImage?: number
  costPerTextToken?: number
  costPerImageToken?: number
  inputModalities?: string[]
  outputModalities?: string[]
}

export interface ImageProvider {
  readonly id: ImageProviderType
  readonly name: string
  generate(options: ImageGenerateOptions): Promise<ImageGenerateResult>
  listModels(apiKey?: string): Promise<ImageModelInfo[]>
  // ComfyUI specific
  getSamplerInfo?(): Promise<ComfySamplerInfo>
  listLoras?(): Promise<string[]>
}

export interface ImageProviderConfig {
  apiKey: string
  baseUrl?: string
  providerOptions?: Record<string, unknown>
  timeoutMs?: number
}
