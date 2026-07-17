// Illustrious / SDXL prompt builder.
// Ported from D:\LLM\scene-illustrator\engine\illustrious-prompt-builder.js
// (v0.5.29.0 calibration v2.1 per PATH_B_PROMPT_CALIBRATION_RESEARCH.md +
// PATH_B_QUALITY_RESEARCH).
//
// v2.1 calibration ladder (cup tag carries band, slider fine-tunes):
//
//   tier band  | cup tag                | slider range  | hyper concept
//   ───────────┼────────────────────────┼───────────────┼──────────────
//   0          | flat chest             | -1.5 .. -1.0  | 0
//   1-3        | small breasts          | -0.8 .. -0.4  | 0
//   4-7        | medium breasts         | -0.4 .. 0.0   | 0
//   8-13       | medium breasts         |  0.0 .. +0.2  | 0
//   14-21      | large breasts          |  0.0 .. +0.4  | 0
//   22-29      | huge breasts           |  0.3 .. +0.6  | 0
//   30-39      | gigantic breasts       |  0.4 .. +0.7  | 0
//   40-49      | hyper breasts          |  0.5 .. +0.59 | 0.5 -> 0.82
//   50+        | hyper breasts          |  0.6          | 0.85
//
// v2.2 hyper-band recalibration (2026-06-20): the v2.1 hyper band reset the slider
// to 0.3 at tier 40 while hyper only reached 0.3, so tier 40 rendered SMALLER than
// the gigantic peak (tier 39, slider 0.7) — a non-monotonic dip at the band seam —
// and the hyper band (40-50) barely exceeded gigantic. Fix (empirically swept on
// WAI v17, fixed seed/scene): hold the slider elevated through the hyper band
// (0.5->0.6) and push the hyper concept LoRA 0.5->0.85. tier 40 (0.5/0.5) now clears
// the gigantic peak; tier 50 (0.6/0.85) is dramatically larger and still coherent;
// (0.7/1.0) saturates with no gain, so 0.85 is the ceiling. Keep in lockstep with
// comic-continuer/comic_continuer/art/be_prompt.py.
//
// Pure ES module + named exports. Direct imports from danbooru-tags +
// inference (replaces SI's globalThis.__SI probing).

import { shapeToTags, buildToTags, sceneTypeToTags, countGenders } from './danbooru-tags.js';
import { inferIdentityTags as inferIdentityTagsFn } from './inference.js';
import type { Intimacy, ScenePayload, PayloadCharacter } from './scene-composer.js';

// ───────── Quality / scaffolding (v2.1) ─────────

// v2.1 quality stack — SeaArt canonical + `official art` for "deliberate
// illustration" feel (research §6 #3). Token-position-1; don't weight the block.
// 2026-06-21 polish: dropped 'amazing quality' (cargo-cult; not in the Illustrious/NoobAI quality
// hierarchy). Keep in lockstep with comic-continuer be_prompt.py QUALITY_TAGS.
export const QUALITY_TAGS: ReadonlyArray<string> = Object.freeze([
  'masterpiece', 'best quality',
  'very aesthetic', 'newest', 'absurdres', 'highres',
  'official art',
]);

export const MATURE_ANCHOR: ReadonlyArray<string> = Object.freeze(['mature female', 'adult']);

// v2.1 lighting tag — pick ONE per render (stacking dilutes per research §6 #2).
export const DEFAULT_LIGHTING_TAG = 'cinematic lighting';

// v2.1 negative baseline — TRIMMED from v2.0's SeaArt long UC. Per WAI's
// creator: "do not add too many quality and aesthetic-related tags, nor
// overly long negative prompts, as this reduces image quality and causes
// blurriness." Embeddings carry the suppression load.
// 2026-06-21 polish: lightened — embeddings carry generic quality/anatomy; dropped redundant
// lowres/worst quality/bad quality/jpeg artifacts; added old/early to reinforce `newest`.
// Keep in lockstep with comic-continuer be_prompt.py HEAVY_UC_BASE.
export const HEAVY_UC_BASE: ReadonlyArray<string> = Object.freeze([
  'embedding:Illust_Neg-neg',
  'embedding:BadDigitalHandsNeg',
  'bad anatomy', 'bad hands',
  'signature', 'watermark', 'username',
  'old', 'early',
  // Maturity suppressors — non-negotiable.
  'child', 'loli', 'kid', 'shota', 'young', 'underage',
]);

// Phase 4.5 / P0-1 — Danbooru censorship-suppression cluster. Booru training
// data is contaminated with mosaic/bar-censor artifacts; at default CFG the
// leak rate on explicit renders is ~5%. Appended ONLY when the resolved
// rating is 'explicit' (sex). Skipped for sensitive/general so the embedding-
// led short-UC discipline (HEAVY_UC_BASE comment above) is preserved for
// non-explicit gens.
export const CENSORSHIP_SUPPRESSION_UC: ReadonlyArray<string> = Object.freeze([
  'censored', 'mosaic_censoring', 'bar_censor', 'convenient_censoring',
  'censor_bar', 'heart_censor', 'light_censor', 'novelty_censor',
  'dotted_line_censor', 'hair_censor', 'soap_censor', 'steam_censor',
  'pasties', 'blank_censor', 'identity_censor', 'pixelated', 'mosaic',
  'blurry_genitals',
]);

// Phase 4.5 / P0-1 — affirmative companion to CENSORSHIP_SUPPRESSION_UC.
// Steers the positive distribution toward uncensored anatomy. Appended for
// any rating that implies bare skin (sensitive=nude, explicit=sex).
export const CENSORSHIP_AFFIRM_POS: ReadonlyArray<string> = Object.freeze([
  'uncensored', 'detailed anatomy', 'clear view',
]);

// Identity-preservation anchor — always-on. Prevents drift between paired
// renders where only one descriptor (slider weight) varies (research §C4).
export const IDENTITY_ANCHOR_NEG =
  '(different character, different hair color, different eye color:1.1)';

// Map SI intimacy → Illustrious Danbooru rating tag (research §6 #1).
// Prefixes the prompt at token position 1, BEFORE the quality stack —
// it gates the entire generation distribution.
export function intimacyToRating(intimacy: Intimacy | 'explicit' | 'mature' | string | undefined): string {
  if (intimacy === 'sex' || intimacy === 'explicit') return 'explicit';
  if (intimacy === 'nude' || intimacy === 'mature') return 'sensitive';
  return 'general';
}

// ───────── Tier -> cup tag (v2.1 Option C — single tag per band) ─────────

/**
 * Map a tier_index to the SINGLE Danbooru cup-band tag for that band.
 * v2.1 calibration: ONE tag per band; slider weights lowered so the cup
 * tag sets the baseline and the slider fine-tunes within the band.
 */
export function tierToCupTag(tier: number): string | null {
  if (typeof tier !== 'number' || !Number.isFinite(tier)) return null;
  const t = Math.max(0, Math.floor(tier));
  if (t === 0) return 'flat chest';
  if (t < 4) return 'small breasts';
  if (t < 14) return 'medium breasts';   // 4-13
  if (t < 22) return 'large breasts';    // 14-21
  if (t < 30) return 'huge breasts';     // 22-29 (canonical N-cup band)
  if (t < 40) return 'gigantic breasts'; // 30-39 (canonical P-T-cup)
  return 'hyper breasts';                // 40+ (canonical U+, with hyper concept LoRA)
}

// ───────── Tier -> slider LoRA weight (v2.1 lowered for cup-tag interaction) ─────────

/**
 * Slider weight curve. v2.1: LOWERED across the board vs v2.0 because the
 * cup tag now carries the band magnitude. Slider is the within-band
 * fine-tune adjuster. Sawtooth shape: each band resets when the cup tag
 * jumps, then climbs through the band.
 *
 * Returns weight in roughly [-1.5, +0.7].
 */
export function tierToSliderWeight(tier: number): number {
  if (typeof tier !== 'number' || !Number.isFinite(tier)) return 0.0;
  const t = Math.max(0, Math.floor(tier));
  const anchors: ReadonlyArray<readonly [number, number]> = [
    [0, -1.5], [4, -0.7], [8, -0.2], [12, 0.1],
    [14, 0.0], [21, 0.4],
    [22, 0.3], [29, 0.6],
    [30, 0.4], [39, 0.7],
    // hyper band: slider held elevated (was reset to 0.3) so tier 40 clears the
    // gigantic peak; paired with the stronger hyper ramp below. See v2.2 note.
    [40, 0.5], [50, 0.6],
    [100, 0.6],
  ];
  if (t <= anchors[0]![0]) return anchors[0]![1];
  if (t >= anchors[anchors.length - 1]![0]) return anchors[anchors.length - 1]![1];
  for (let i = 1; i < anchors.length; i++) {
    const [aT, aW] = anchors[i - 1]!;
    const [bT, bW] = anchors[i]!;
    if (t <= bT) {
      const frac = (t - aT) / (bT - aT);
      return Math.round((aW + (bW - aW) * frac) * 100) / 100; // 2-decimal
    }
  }
  return 0.0;
}

/**
 * Hyper concept LoRA: off below tier 40, ramps 0.5 → 0.85 across 40-50.
 * Necessary at upper tiers where slider alone (even with hyper-breasts cup
 * tag) can't reach the macromastia register coherently.
 *
 * v2.2: raised from the v2.1 0.3→0.5 ramp. With the slider also held elevated
 * through the hyper band, this removes the gigantic→hyper seam dip and lets the
 * hyper band read clearly larger than gigantic. 0.85 is the saturation ceiling
 * (0.85→1.0 adds no size on WAI v17).
 */
export function tierToHyperConceptWeight(tier: number): number {
  if (typeof tier !== 'number' || !Number.isFinite(tier) || tier < 40) return 0.0;
  const t = Math.min(50, Math.floor(tier));
  return Math.round((0.5 + (t - 40) * 0.035) * 100) / 100;
}

// ───────── Brace → (tag:weight) conversion ─────────

/**
 * Convert NAI brace emphasis ({{tag}}) and NAI numeric emphasis
 * (1.16::tag::) to SDXL (tag:weight). Used to translate danbooruTags
 * shape-tag output (which carries NAI emphasis) into Illustrious-compatible
 * SDXL form.
 */
export function naiEmphasisToSdxlWeight(tag: string): string {
  if (typeof tag !== 'string') return tag;
  const numericMatch = tag.match(/^(-?\d*\.?\d+)::(.*?)::$/);
  if (numericMatch) {
    const weight = Math.max(-2.0, Math.min(2.0, parseFloat(numericMatch[1]!)));
    return `(${numericMatch[2]}:${Math.round(weight * 100) / 100})`;
  }
  let stripped = tag;
  let openCount = 0;
  while (stripped.startsWith('{')) { stripped = stripped.slice(1); openCount++; }
  let closeCount = 0;
  while (stripped.endsWith('}')) { stripped = stripped.slice(0, -1); closeCount++; }
  const level = Math.min(openCount, closeCount);
  if (level <= 0) return tag;
  const weight = Math.min(1.5, Math.round(Math.pow(1.05, level) * 100) / 100);
  return `(${stripped}:${weight})`;
}

// ───────── Identity descriptor composition ─────────

/**
 * Character shape this builder accepts. Extends scene-composer's
 * PayloadCharacter with the optional flat identity fields that older
 * (pre-Path-B) character rows carry. New rows store identity tags in
 * `identity_tags` or `llm_identity_tags`; the flat fields are a legacy
 * fallback.
 */
export interface PromptBuilderCharacter extends PayloadCharacter {
  hair_color?: string | null;
  hair_style?: string | null;
  eye_color?: string | null;
  distinguishing_mark?: string | null;
}

/**
 * Build the per-character identity tag block. 4-tier fallback ladder:
 *   1. franchise_tag at FRONT + character.identity_tags (explicit override)
 *   2. franchise_tag + character.llm_identity_tags (LLM-synthesized;
 *      PRIMARY identity path for original characters)
 *   3. franchise_tag + character.{hair_color, hair_style, eye_color,
 *      distinguishing_mark} (legacy flat shape)
 *   4. franchise_tag + regex-inferred from character.appearance_excerpt
 *      (offline fallback — narrower vocabulary than the LLM extraction)
 */
export function composeIdentityTags(character: PromptBuilderCharacter | null | undefined): string[] {
  if (!character) return [];
  const out: string[] = [];

  // Franchise tag at FRONT of identity block (Path B v2.2). Canonical
  // Danbooru `character (series)` tag pulls character identity AND series
  // aesthetic register in one shot.
  if (character.franchise_tag && typeof character.franchise_tag === 'string') {
    out.push(character.franchise_tag);
  }

  const baseLen = out.length;

  // Tier 1: explicit identity_tags object (user override).
  const id = character.identity_tags as
    | { hair_color?: unknown; hair_style?: unknown; eye_color?: unknown; distinguishing_mark?: unknown }
    | null
    | undefined;
  if (id && typeof id === 'object') {
    if (id.hair_color) out.push(String(id.hair_color));
    if (id.hair_style) out.push(String(id.hair_style));
    if (id.eye_color) out.push(String(id.eye_color));
    if (id.distinguishing_mark) out.push(String(id.distinguishing_mark));
    if (out.length > baseLen) return out;
  }

  // Tier 2 (v0.5.31): LLM-synthesized tags. PRIMARY identity path for
  // original characters — far broader than regex inference.
  if (Array.isArray(character.llm_identity_tags) && character.llm_identity_tags.length > 0) {
    for (const t of character.llm_identity_tags) {
      if (typeof t === 'string' && t.trim()) out.push(t.trim());
    }
    return out;
  }

  // Tier 3: top-level flat fields (legacy convenience shape).
  let added = false;
  if (character.hair_color) { out.push(String(character.hair_color)); added = true; }
  if (character.hair_style) { out.push(String(character.hair_style)); added = true; }
  if (character.eye_color) { out.push(String(character.eye_color)); added = true; }
  if (character.distinguishing_mark) { out.push(String(character.distinguishing_mark)); added = true; }
  if (added) return out;

  // Tier 4: regex-infer from appearance_excerpt (offline fallback).
  if (character.appearance_excerpt) {
    const inferred = inferIdentityTagsFn(character.appearance_excerpt);
    if (inferred.hair_color) out.push(inferred.hair_color);
    if (inferred.hair_style) out.push(inferred.hair_style);
    if (inferred.eye_color) out.push(inferred.eye_color);
    if (inferred.distinguishing_mark) out.push(inferred.distinguishing_mark);
  }

  return out;
}

// ───────── Per-character body tag composition ─────────

/**
 * Build flat list of body shape/build tags for a character. v2.1: the cup
 * tag is composed SEPARATELY at the scene level (via tierToCupTag) since
 * one per scene is the right scope. This function returns ONLY build/shape/
 * skinny.
 */
export function composeIllustriousBodyTags(character: PromptBuilderCharacter | null | undefined): string[] {
  if (!character) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (tag: string): void => {
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    out.push(tag);
  };

  // Shape: firm / gravity-defying / round breasts.
  if (character.breast_shape) {
    for (const t of shapeToTags(character.breast_shape)) {
      push(naiEmphasisToSdxlWeight(t));
    }
  }
  // Build: petite / slim / curvy / athletic / full / (average=no tag).
  if (character.build) {
    for (const t of buildToTags(character.build)) {
      push(naiEmphasisToSdxlWeight(t));
    }
  }
  // Skinny proportion lock — high tier + petite/slim build.
  if (typeof character.tier_index === 'number' && character.tier_index >= 14
      && (character.build === 'petite' || character.build === 'slim')) {
    push('skinny');
  }
  return out;
}

// ───────── Top-level builder (v2.1) ─────────

export interface IllustriousImageRequest {
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number | null;
  workflow: string;
  lora_strengths: {
    slider: number;
    hyper_concept: number;
    smooth_booster: number;
    anime_style: number;
    style: number;
  };
  hires_fix: Record<string, unknown>;
  scene_payload: ScenePayload;
  campaign_id: string | null;
  linked_proposal_id: string | null;
  linked_still_entry_id: string | null;
  pre_convert_webp: boolean;
}

export interface IllustriousBuildOptions {
  workflow?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  seed?: number;
  sliderWeightOverride?: number;
  hyperConceptOverride?: number;
  smoothBoosterOverride?: number;
  animeStyleWeight?: number;
  styleWeight?: number;
  lightingTag?: string;
  ratingOverride?: string;
  worldTheme?: string;
  extraTags?: ReadonlyArray<string>;
  linkedProposalId?: string;
  linkedStillEntryId?: string;
  preConvertWebp?: boolean;
  hires_fix?: Record<string, unknown>;
}

/**
 * Build an Illustrious /image request body from a scene payload.
 *
 * v2.1 positive prompt structure:
 *   [rating], [quality stack + official art], [world theme],
 *   [lighting tag], [mature anchor], [identity (incl. franchise tag)],
 *   [scene tags], [body tags], [cup tag — ONCE per scene, from max tier],
 *   [extra tags]
 */
export function buildImageRequest(
  payload: ScenePayload & { campaign_id?: string | null },
  options: IllustriousBuildOptions = {}
): IllustriousImageRequest {
  if (!payload || typeof payload !== 'object') {
    throw new Error('illustriousPromptBuilder.buildImageRequest: payload required');
  }
  const characters = (Array.isArray(payload.characters) ? payload.characters : []) as PromptBuilderCharacter[];

  // Max tier across characters — drives cup tag, slider, hyper concept.
  const maxTier = characters.reduce(
    (m, c) => (typeof c.tier_index === 'number' && c.tier_index > m ? c.tier_index : m),
    0
  );

  const bodyTagsPerCharacter = characters.map((c) => composeIllustriousBodyTags(c));
  const identityTagsPerCharacter = characters.map((c) => composeIdentityTags(c));

  // Scene tags via danbooru-tags.
  const counts = countGenders(characters);
  const sceneTags = sceneTypeToTags(payload.scene_type, counts);

  // Rating + lighting.
  const rating = options.ratingOverride || intimacyToRating(payload.intimacy);
  const lighting = options.lightingTag || DEFAULT_LIGHTING_TAG;

  // World theme: free-text comma-separated style block injected
  // high-attention so it gates the overall aesthetic register.
  const worldThemeRaw = (typeof options.worldTheme === 'string' && options.worldTheme)
    || payload.world_theme
    || '';
  const worldThemeTags = String(worldThemeRaw)
    .split(',').map((s) => s.trim()).filter(Boolean);

  // Per-render style hints — append after body tags so they don't overpower
  // the structural prompt blocks.
  const extraTags = Array.isArray(options.extraTags)
    ? options.extraTags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim())
    : [];

  // Cup tag — ONE per scene, from max tier (Option C).
  const cupTag = tierToCupTag(maxTier);

  // Phase 4.5 / P0-1 — bare-skin ratings (sensitive=nude, explicit=sex) get
  // the affirmative anatomy cluster; explicit also gets the negative
  // censorship cluster appended.
  const isBareSkin = rating === 'explicit' || rating === 'sensitive';
  const isExplicit = rating === 'explicit';

  // Compose positive. Order is load-bearing for Illustrious attention.
  const positiveParts: Array<string | null | undefined> = [
    rating,
    ...QUALITY_TAGS,
    ...worldThemeTags,
    lighting,
    ...MATURE_ANCHOR,
    ...(isBareSkin ? CENSORSHIP_AFFIRM_POS : []),
    ...identityTagsPerCharacter.flat(),
    ...sceneTags,
    ...bodyTagsPerCharacter.flat(),
    cupTag,
    ...extraTags,
  ];
  const positive = positiveParts.filter((p): p is string => Boolean(p)).join(', ');

  // Compose negative. v2.1: trimmed + embeddings carry suppression load.
  const negativeParts: string[] = [
    ...HEAVY_UC_BASE,
    ...(isExplicit ? CENSORSHIP_SUPPRESSION_UC : []),
    IDENTITY_ANCHOR_NEG,
  ];
  const negative = negativeParts.filter(Boolean).join(', ');

  // LoRA strengths — tier-driven by default; explicit override for tests.
  const sliderWeight = typeof options.sliderWeightOverride === 'number'
    ? options.sliderWeightOverride
    : tierToSliderWeight(maxTier);
  const hyperConceptWeight = typeof options.hyperConceptOverride === 'number'
    ? options.hyperConceptOverride
    : tierToHyperConceptWeight(maxTier);
  const smoothBoosterWeight = typeof options.smoothBoosterOverride === 'number'
    ? options.smoothBoosterOverride
    : 0.5; // community recommendation for stacked-LoRA chain

  return {
    prompt: positive,
    negative_prompt: negative,
    width: typeof options.width === 'number' ? options.width : 832,
    height: typeof options.height === 'number' ? options.height : 1216,
    steps: typeof options.steps === 'number' ? options.steps : 28,
    cfg: typeof options.cfg === 'number' ? options.cfg : 5.0,
    // 2026-06-21 quality bake-off: dpmpp_2m/karras crisper than euler_ancestral/normal.
    // Keep in lockstep with comic-continuer be_prompt.py DEFAULT_SAMPLER/SCHEDULER.
    sampler: options.sampler || 'dpmpp_2m',
    scheduler: options.scheduler || 'karras',
    seed: typeof options.seed === 'number' ? options.seed : null,
    workflow: options.workflow || 'illustrious_image',
    lora_strengths: {
      slider: sliderWeight,
      hyper_concept: hyperConceptWeight,
      smooth_booster: smoothBoosterWeight,
      anime_style: typeof options.animeStyleWeight === 'number' ? options.animeStyleWeight : 0.0,
      style: typeof options.styleWeight === 'number' ? options.styleWeight : 0.0,
    },
    hires_fix: options.hires_fix || {},
    scene_payload: payload,
    campaign_id: payload.campaign_id ?? null,
    linked_proposal_id: options.linkedProposalId || null,
    linked_still_entry_id: options.linkedStillEntryId || null,
    pre_convert_webp: !!options.preConvertWebp,
  };
}
