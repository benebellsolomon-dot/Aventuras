/**
 * Dedicated booru scene-prompt writer (research/55 follow-up).
 *
 * PROBLEM (measured): in inline mode the NARRATION model is asked to embed a
 * booru `<pic prompt="...">` tag block mid-story. Even with the booru
 * instructions and a populated identity bank in front of it, a story model like
 * `deepseek-v4-pro` writes PROSE, not Danbooru tags. A booru image model
 * (`wai-illustrious-sdxl`) cannot follow prose → wrong pose/scene/anatomy.
 *
 * FIX: stop relying on the narration model for the tag prompt. This module runs
 * a SINGLE-PURPOSE LLM call whose ONLY job is to convert one scene into a proper
 * booru TAG prompt — so it complies. It copies each present subject's locked
 * `imageTags` bank verbatim (or converts their descriptor prose to tags when
 * they have no bank yet), states current clothing + body-size band, and closes
 * on current-location scene tags. The booru image model then receives tags it
 * can actually follow.
 *
 * ORDER (research/56): the call returns SECTIONS, and `composeBooruScenePrompt`
 * joins them — rating, camera, count, ACTION, SIZE, characters, scene. Asking the LLM
 * for one finished string put the two per-character identity clauses ahead of
 * the pose and setting tags, which then sat past CLIP's ~75-token attention
 * window; the model rendered the identities and invented its own scene (a bed
 * scene came back as a standing hallway shot). Order is deterministic here.
 *
 * EXPRESSION: each character's run ends in her own 1-3 expression tags, merged
 * from the writer's read of the narrative beat and the engine's deterministic
 * soft state (see expressionTags.ts). Per-character by construction — a shared
 * mood block would put the same face on everyone in frame.
 *
 * Best-effort by contract, exactly like `extractIdentity`: if the setting is
 * off, the model is not a booru model, no preset is assigned, or the AI call
 * throws, the caller keeps the original story-written prompt. It never throws.
 *
 * Rides the `imageGeneration` service preset — the same LLM assignment that
 * authors the identity tag bank — so it stays OFF the narration model and on a
 * fast, format-following model. The zod schema below enforces the output SHAPE
 * regardless of template edits, so a user edit can degrade quality but can never
 * break the caller's contract.
 */

import { z } from 'zod'
import { settings } from '$lib/stores/settings.svelte'
import { createLogger } from '$lib/log'
import { ContextBuilder } from '$lib/services/context'
import { database } from '$lib/services/database'
import {
  apparentTier,
  bandWord,
  imageSizeAnchor,
  imageStateCues,
  readBodyState,
  isEngorged,
} from '$lib/services/be'
import { generateStructured } from '../sdk/generate'
import { chunksLongPrompts } from './providerCapabilities'
import { detectPromptDialect } from './dialect'
import {
  compressStateCues,
  engineSizeTags,
  hasActFamilyTag,
  hasPartneredActTag,
  isSizeVocabularyTag,
  joinTags,
  sanitizeBreastTags,
  toTags,
  type SizeSanction,
} from './booruTags'
import { engineExpressionTags, isExpressionTag } from './expressionTags'
import {
  CLOTHED_ASSERTION_TAGS,
  DRESS_TAG_FOR_STATE,
  hasDressStateTag,
  inferImpliedDressState,
  isDressStateTag,
} from './dressState'
import type { Character, ImageProviderType, Location, VisualDescriptors } from '$lib/types'

const log = createLogger('BooruPromptWriter')

/** Rides the image-generation preset — same LLM that authors the identity bank. */
const SERVICE_ID = 'imageGeneration'

/** User-editable vault prompt this call renders (see prompts/templates/image.ts). */
const TEMPLATE_ID = 'image-booru-scene-prompt'

/** Cap the narrative-beat context so it stays a hint, not the bulk of the prompt. */
const NARRATIVE_CONTEXT_CHARS = 1200

/**
 * Tag budgets for the composed prompt (research/56 + D5 measurement).
 *
 * A booru tag plus its comma averages ~2 CLIP tokens, so a 75-token window
 * holds ≈36 tags after the quality prefix. Local SD backends (a1111/comfy/
 * si-bridge) CHUNK long prompts into multiple windows, so they can afford the
 * richer 60-tag budget; endpoint providers (nanogpt — measured 2026-08-21)
 * TRUNCATE at the first window, and anything past it simply never renders
 * (the app's real prompts lost their whole scene block this way). The
 * single-window budget exists so the ENTIRE prompt fits in what renders.
 */
export const BOORU_MAX_TAGS = 60
export const BOORU_MAX_TAGS_SINGLE_WINDOW = 36

/** Per-character run cap in single-window mode: identity banks lead the run,
 * so the tail (clothing extras) gives way first. Without this, two long
 * identity runs alone could fill the window before any scene tag. */
export const BOORU_MAX_RUN_TAGS_SINGLE_WINDOW = 13

/**
 * Single-window endpoints render ONE 77-token CLIP window (measured on nanogpt,
 * research/63). A tag-count cap alone under-protects it: multi-word tags
 * ("vaginal from behind", "detailed anatomy") cost 3-4 tokens each, so a 36-tag
 * prompt full of them still loses its tail (D5 live: the environment and part
 * of the identity run truncated on an explicit beat). After the tag-count trim,
 * single-window prompts are trimmed again against this ESTIMATED token budget:
 * 77 minus BOS/EOS minus the single-window quality prefix (`masterpiece, best
 * quality` = 5 real tokens) = 70 usable, minus the estimator's measured ≈4 %
 * under-count (see estimateTagTokens) → 67.
 */
export const BOORU_SINGLE_WINDOW_TOKEN_BUDGET = 67
/** Identity core a character run never trims below under the token budget
 * (Ben's ruling 2026-08-23, research/64 §3g: 5 — the locked bank leads the run,
 * so the sixth tag is the least identity-bearing one). */
const MIN_RUN_BASE_TAGS = 5

/** Floors for the trimmable blocks — a scene still needs a place, and an act
 * needs its family (act + arrangement + two position tags): the action block
 * is trimmed LAST and never below this, because positions are what the failed
 * renders left out (research/64 §3g). */
const MIN_SCENE_TAGS = 3
const MIN_ACTION_TAGS = 4
/** The shot type always stays; the angle tag is the first camera tag to go. */
const MIN_CAMERA_TAGS = 1
/** The faceless protagonist-POV run keeps nothing beyond its (protected) POV tags. */
const MIN_POV_RUN_TAGS = 0
/** A lactating girl filled to at least this much is drawn leaking (engine lactation tag). */
const LACTATION_VISIBLE_FILL = 70
/** Rating-block restatements dropped on single-window endpoints (research/64 §3g). */
const SINGLE_WINDOW_RATING_DROPS: ReadonlySet<string> = new Set(['detailed anatomy', 'uncensored'])

/**
 * Rough CLIP token cost of one tag, plus its comma. Calibrated against the real
 * CLIP BPE over 273 live booru tags (research/64 §3g): each whitespace word
 * splits the way CLIP's pre-tokenizer does — letter runs, SINGLE digits, and
 * punctuation runs are separate tokens (`1boy` = 2, `face-to-face` = 5) — and a
 * letter run over 9 characters costs two. Residual under-count ≈ 4 %, absorbed
 * by the budget above (67 × 1.04 ≈ 69.7 < 70 = 77 − BOS/EOS − the 5-token
 * single-window quality prefix). The floors of a 1boy+1girl explicit beat
 * (rating 2, shot, count 2, act 4, size + lactation state, POV 2, identity 6 +
 * dress, face 1, place 3) land around 70 — at the edge; see research/64 §3g for
 * the remaining floor rulings.
 */
export function estimateTagTokens(tag: string): number {
  const pieces = tag.trim().match(/[0-9]|[A-Za-z]+|[^\sA-Za-z0-9]+/g) ?? []
  return pieces.reduce((n, piece) => n + (/^[A-Za-z]+$/.test(piece) && piece.length > 9 ? 2 : 1), 1)
}
export const estimateTokens = (tags: ReadonlyArray<string>): number =>
  tags.reduce((n, tag) => n + estimateTagTokens(tag), 0)

/**
 * A face never loses its LAST expression tag: an expressionless character is the
 * exact failure this layer exists to fix, and setting detail has already been cut
 * to its own floor before expressions are touched at all.
 */
const MIN_EXPRESSION_TAGS = 1

/**
 * The writer emits SECTIONS, not one pre-ordered string: the final tag order is
 * the thing that was broken (identity clauses displaced the action and setting
 * past CLIP's attention window), and order enforced by `composeBooruScenePrompt`
 * is deterministic where order requested of an LLM is not.
 */
const booruScenePromptSchema = z.object({
  rating: z
    .string()
    .describe(
      'Content rating tags only: "general", "sensitive", or "explicit, uncensored, detailed anatomy". Rate THIS beat, from the scene intent and narrative beat ONLY: if they describe no sexual act, nudity, or exposure, the rating is "general" (or "sensitive" for suggestive-but-clothed) — regardless of the characters\' stats, their arousal state, or anything from earlier scenes.',
    ),
  camera: z
    .string()
    .describe(
      'Shot-type tag plus an optional angle tag (e.g. "cowboy shot, from above"). Wide enough to show everyone and the setting.',
    ),
  countTags: z
    .string()
    .describe(
      'Booru count tags for EVERY person in frame, including unnamed ones (e.g. "1boy, 1girl", "2girls"). Never omitted.',
    ),
  actInProgress: z
    .boolean()
    .describe(
      'REQUIRED. Is a physical/sexual act actively occurring in this beat (not aftermath, not anticipation)? True mid-act even when something else (growth, a transformation) happens at the same time; false for afterglow, aftermath, or a plain pose.',
    ),
  action: z
    .string()
    .describe(
      'What the people are DOING: interaction/sex-act/pose tags (e.g. "hetero, paizuri, breast squeezing, lying on back"). The scene beat, not the people. When actInProgress is true this MUST open with the act tag family. When the scene describes NO sexual act, use only mundane pose/interaction tags — never invent nudity or acts the beat does not contain. Name held items SPECIFICALLY (holding dagger, holding sword) — never the bare "weapon" tag, which renders as a random firearm.',
    ),
  characters: z
    .array(z.string())
    .describe(
      'One FLAT comma-separated tag run per person, in the same order as the count tags: locked identity tags copied verbatim, then THIS beat\'s dress state (her current clothing while she still wears it; "completely nude" / "topless" / "bottomless" when the scene intent says it is off — never "clothed" then), then breast-size band. No parentheses. A male who is the story protagonist (the scene addresses him as "you") gets "pov, male pov, faceless male" plus at most "muscular" instead of a described 1boy.',
    ),
  expressions: z
    .array(z.string())
    .describe(
      'REQUIRED. One 1-3 tag expression run per person, SAME length and order as "characters": that person\'s own emotional state in THIS beat, as real danbooru expression tags (e.g. "blush, averted eyes"). Never a shared mood. Empty string only for a faceless protagonist-POV male.',
    ),
  scene: z
    .string()
    .describe(
      'Setting, furniture, time of day, light source and atmosphere tags. Lowest priority — trimmed first when the prompt runs long.',
    ),
})

export type BooruSceneSections = z.infer<typeof booruScenePromptSchema>

/** Band words + anchors — hoisted out of a run the engine holds no state for. */
const isSizeTag = isSizeVocabularyTag

// ============================================================================
// Engine-derived expression cues
// ============================================================================

/**
 * One girl's deterministic expression block plus the identity tags that let the
 * assembly find HER run among the writer's flat runs.
 */
export interface CharacterExpressionCue {
  /** Her locked identity bank, split into tags — the run-matching key. */
  identityTags: string[]
  /** Engine-derived expression tags, strongest signal first. */
  expressionTags: string[]
}

/** Identity tags a run must share with a cue before it counts as that subject. */
const MIN_IDENTITY_MATCH = 2

/** The faceless protagonist-POV run carries no expression — he has no face. */
const POV_RUN_TAGS: ReadonlySet<string> = new Set(['faceless male', 'male pov', 'pov'])

const isProtagonistRun = (run: ReadonlyArray<string>): boolean =>
  run.some((tag) => POV_RUN_TAGS.has(tag.trim().toLowerCase()))

/** Case-insensitive dedupe within a single list, keeping the first occurrence. */
function dedupeTags(tags: ReadonlyArray<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of tags) {
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/** Anything attributable to one subject carries her identity bank as the key. */
interface SubjectKeyed {
  /** Her locked identity bank, split into tags — the run-matching key. */
  identityTags: ReadonlyArray<string>
}

/**
 * Attach each per-subject item to the writer run that depicts that girl.
 *
 * The writer returns FLAT runs with no owner label, so the join is made on the
 * locked identity bank the template tells it to copy verbatim: the run sharing
 * the most bank tags (at least `MIN_IDENTITY_MATCH`, so a lone shared "1girl"
 * cannot claim a run) wins her item. A subject with no bank yet has her prose
 * converted to tags and shares nothing verbatim, so unmatched items fall back to
 * filling the remaining described runs in order — skipping the faceless POV run.
 *
 * Best-effort by design: an item that finds no run simply contributes nothing.
 */
function matchRunsToSubjects<T extends SubjectKeyed>(
  runs: ReadonlyArray<ReadonlyArray<string>>,
  items: ReadonlyArray<T>,
): Array<T | undefined> {
  const byRun: Array<T | undefined> = runs.map(() => undefined)
  const runSets = runs.map((run) => new Set(run.map((tag) => tag.toLowerCase())))
  const claimed = new Set<number>()
  const unmatched: T[] = []

  for (const item of items) {
    let best = -1
    let bestScore = 0
    for (let i = 0; i < runs.length; i++) {
      if (claimed.has(i)) continue
      const score = item.identityTags.filter((tag) => runSets[i].has(tag.toLowerCase())).length
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best >= 0 && bestScore >= MIN_IDENTITY_MATCH) {
      claimed.add(best)
      byRun[best] = item
    } else {
      unmatched.push(item)
    }
  }

  const open = runs
    .map((_, index) => index)
    .filter((index) => !claimed.has(index) && !isProtagonistRun(runs[index]))
  unmatched.forEach((item, slot) => {
    const index = open[slot]
    if (index === undefined) return
    byRun[index] = item
  })

  return byRun
}

/**
 * Engine expression tags per writer run — the run-matching above, with cues that
 * carry no tags dropped first so they cannot claim a run and blank a face.
 */
export function assignEngineExpressions(
  runs: ReadonlyArray<ReadonlyArray<string>>,
  cues: ReadonlyArray<CharacterExpressionCue>,
): string[][] {
  const matched = matchRunsToSubjects(
    runs,
    cues.filter((cue) => cue.expressionTags.length > 0),
  )
  return matched.map((cue) => (cue ? [...cue.expressionTags] : []))
}

// ============================================================================
// Engine-owned size sanction
// ============================================================================

/** One subject's engine size truth, plus the key that finds her writer run. */
export interface SubjectSizeSanction extends SizeSanction, SubjectKeyed {
  identityTags: string[]
}

/**
 * The sanction for tags that belong to the SCENE rather than to one run: action
 * and setting tags, and any character run that could not be attributed. Keyed on
 * the LARGEST subject present, because a scene tag may legitimately describe the
 * biggest girl in frame; growth is sanctioned if the engine grew anyone.
 */
function sceneWideSanction(
  sanctions: ReadonlyArray<SubjectSizeSanction>,
): SizeSanction | undefined {
  if (sanctions.length === 0) return undefined
  return {
    tier: Math.max(...sanctions.map((s) => s.tier)),
    grewThisTurn: sanctions.some((s) => s.grewThisTurn),
    engorged: sanctions.some((s) => s.engorged === true),
    lactating: sanctions.some((s) => s.lactating === true),
  }
}

/** One character's run, split so expressions can be placed and budgeted apart. */
interface PreparedRun {
  /** Identity + clothing tags, in the writer's order. */
  base: string[]
  /** Her expression tags: engine-derived first, then the writer's. */
  expression: string[]
}

/**
 * Drop `count` expression tags from the tails of the longest runs first, never
 * taking a run below `MIN_EXPRESSION_TAGS`. Tail-first means the writer's
 * beat-driven extras go before the engine's — the engine owns the arousal axis.
 */
function trimExpressionRuns(runs: ReadonlyArray<PreparedRun>, count: number): PreparedRun[] {
  const lengths = runs.map((run) => run.expression.length)
  let remaining = count
  while (remaining > 0) {
    let target = -1
    for (let i = 0; i < lengths.length; i++) {
      if (lengths[i] <= MIN_EXPRESSION_TAGS) continue
      if (target === -1 || lengths[i] > lengths[target]) target = i
    }
    if (target === -1) break
    lengths[target] -= 1
    remaining -= 1
  }
  return runs.map((run, i) => ({ base: run.base, expression: run.expression.slice(0, lengths[i]) }))
}

/**
 * ONE dress-state tag per run (nude family / clothes-displaced family) is
 * exempt from both run trims. The writer — and the dress-state fallback — put
 * it at the run's TAIL, and live renders lost `completely nude` to the
 * single-window head cap / token-budget tail trim on every explicit beat
 * (research/64 §3f): the one tag the beat cannot do without went first. Only
 * one tag is protected so the exemption is bounded (a run cannot overrun the
 * cap or hold the token budget hostage); when a run carries several, the
 * most-exposed wins (nude family, then topless/bottomless, then the
 * clothes-displaced family; ties → first), and the rest trim like anything
 * else. Order is preserved throughout.
 */
const NUDE_FAMILY: ReadonlySet<string> = new Set(['completely nude', 'nude', 'naked'])
const TORSO_FAMILY: ReadonlySet<string> = new Set(['topless', 'bottomless'])
function dressStateRank(tag: string): number {
  const key = tag.trim().toLowerCase()
  if (NUDE_FAMILY.has(key)) return 0
  if (TORSO_FAMILY.has(key)) return 1
  return 2
}

/** Index of the run's protected dress-state tag, -1 when it has none. */
function protectedDressIndex(run: ReadonlyArray<string>): number {
  let best = -1
  run.forEach((tag, i) => {
    if (!isDressStateTag(tag)) return
    if (best < 0 || dressStateRank(tag) < dressStateRank(run[best])) best = i
  })
  return best
}

/**
 * Indices no run trim may take: the protected dress-state tag and the
 * faceless-POV tags (`male pov`, `faceless male`) — the POV run's whole job is
 * those two tags, so trimming it by count could keep `muscular` and drop them.
 */
function protectedIndices(run: ReadonlyArray<string>): ReadonlySet<number> {
  const keep = new Set<number>()
  const dress = protectedDressIndex(run)
  if (dress >= 0) keep.add(dress)
  run.forEach((tag, i) => {
    if (POV_MALE_TAGS.has(tag.toLowerCase())) keep.add(i)
  })
  return keep
}

/** Head-cap a run, keeping its protected tags wherever they sit; order preserved. */
function capRunKeepingProtected(run: ReadonlyArray<string>, cap: number): string[] {
  if (run.length <= cap) return [...run]
  const keep = protectedIndices(run)
  const protectedPastCap = [...keep].filter((i) => i >= cap).sort((a, b) => a - b)
  if (protectedPastCap.length === 0) return run.slice(0, cap)
  const headBudget = Math.max(0, cap - protectedPastCap.length)
  return [
    ...run.slice(0, cap).filter((_, i) => keep.has(i) || i < headBudget),
    ...protectedPastCap.map((i) => run[i]),
  ]
}

/** The run without its last unprotected tag (unchanged when there is none). */
function dropLastTrimmableTag(run: ReadonlyArray<string>): string[] {
  const keep = protectedIndices(run)
  for (let i = run.length - 1; i >= 0; i--) {
    if (!keep.has(i)) return [...run.slice(0, i), ...run.slice(i + 1)]
  }
  return [...run]
}

/** Tags the tail trim may take from a run: all but its protected ones. */
function trimmableCount(run: ReadonlyArray<string>): number {
  return run.length - protectedIndices(run).size
}

/**
 * Compose the writer's sections into the final booru tag order.
 *
 * Order is the fix (research/56): rating → camera → count → ACTION → SIZE →
 * characters → scene. The action block moved AHEAD of the per-character
 * identity runs because with two characters the identity blocks are ~20 tags
 * and pushed the sex-act/pose and setting tags past CLIP's ~75-token attention
 * window — the model then rendered identity only and invented its own scene.
 *
 * The SIZE block sits immediately after the action block, in count-tag order,
 * and the composer OWNS that position. Size previously sat mid-run behind ~10
 * identity tags, and a live tier-24 subject prompted "huge breasts"
 * under-rendered as "large". CLIP attention falls off across the window and the
 * backend parses no prompt weighting (nanogpt — measured, see
 * providerCapabilities.ts), so position is the only emphasis lever left.
 *
 * For a subject the engine holds body state for, that block is INJECTED from the
 * engine (`engineSizeTags`) and her own written size vocabulary is deleted
 * upstream — one canonical placement, stated once. It is not repeated inside her
 * character run: the run copy would cost tokens inside the same attention window
 * for no new signal, and the global dedupe was already discarding it in favour of
 * the early copy. For a subject the engine holds nothing for, the writer's own
 * size vocabulary is hoisted into the same slot instead.
 *
 * EXPRESSION (this layer) stays INSIDE each character's run, at its tail —
 * after that person's identity and clothing, because it describes HER and must
 * not bleed onto the other subject. Each run's expressions are the engine's
 * deterministic tags first (ground truth for the arousal axis) and the writer's
 * beat-driven ones after.
 *
 * Tags are de-duplicated globally (the count tag routinely reappears inside a
 * character's own run) keeping the FIRST occurrence — which is what makes the
 * early size copy the surviving one and drops any in-run duplicate. Expression
 * tags are the one deliberate exception: they dedupe only within their own run,
 * because two girls sharing a mood must BOTH render it and a global dedupe would
 * silently blank the second one's face.
 *
 * The total is capped at `BOORU_MAX_TAGS`. The tag-count drop order is setting →
 * expression → interaction (floor 4); identity, size, rating, camera and count
 * are never trimmed by count. Single-window endpoints then run the token pass
 * (`fitTokenBudget`): setting → expression → camera angle → run tails → the
 * act LAST, because positions are what the failed renders left out.
 *
 * SIZE SANCTION runs before any of that: for every subject the engine holds body
 * state for, each block (action, setting, her own run) loses every breast claim
 * that is not curated act/anatomy vocabulary (`sanitizeBreastTags`), and the
 * engine's own size block is injected in its place. A writer following a
 * narration that over-claims growth therefore cannot out-vote the engine's body
 * state in ANY phrasing — the failure this pass exists to stop.
 */
export function composeBooruScenePrompt(
  sections: Partial<BooruSceneSections>,
  engineExpressions: ReadonlyArray<CharacterExpressionCue> = [],
  sizeSanctions: ReadonlyArray<SubjectSizeSanction> = [],
  options: { singleWindow?: boolean } = {},
): string {
  const budget = options.singleWindow ? BOORU_MAX_TAGS_SINGLE_WINDOW : BOORU_MAX_TAGS
  const stripped: string[] = []
  const sanitize = (tags: ReadonlyArray<string>, sanction: SizeSanction | undefined): string[] => {
    const result = sanitizeBreastTags(tags, sanction)
    stripped.push(...result.stripped)
    return result.kept
  }
  const sceneSanction = sceneWideSanction(sizeSanctions)
  const writtenRuns = (sections.characters ?? []).map((run) => toTags(run))
  const sanctionByRun = matchRunsToSubjects(writtenRuns, sizeSanctions)

  const seen = new Set<string>()
  const dedupe = (tags: ReadonlyArray<string>): string[] => {
    const out: string[] = []
    for (const tag of tags) {
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(tag)
    }
    return out
  }

  // Single-window only: `detailed anatomy` is a prompt-ism and `uncensored`
  // buys nothing on Illustrious-family models (they render explicit from the
  // act tags; Ben's ruling 2026-08-23) — the rating block is `explicit` alone,
  // 5 tokens back for content. Chunking backends keep the full triple. The
  // matching `pov` dedupe happens after assembly, against the runs that
  // actually survived.
  const rating = dedupe(
    toTags(sections.rating).filter(
      (tag) => !(options.singleWindow && SINGLE_WINDOW_RATING_DROPS.has(tag.toLowerCase())),
    ),
  )
  const camera = dedupe(toTags(sections.camera))
  const count = dedupe(toTags(sections.countTags))
  const action = dedupe(sanitize(toTags(sections.action), sceneSanction))
  // Each run is filtered by ITS OWN subject's engine state. A run no sanction
  // claims is an unnamed bystander the engine holds nothing for, so it passes
  // through untouched — filtering her against the largest subject present would
  // delete a smaller girl's honest band word as collateral.
  const characterRuns = writtenRuns.map((run, index) => sanitize(run, sanctionByRun[index]))
  // Size, resolved before the runs so the global dedupe keeps THIS copy: the
  // engine's block for a sanctioned subject, the writer's own hoisted vocabulary
  // for anyone the engine holds nothing for. A sanction whose subject the writer
  // never depicted still gets stated rather than silently lost.
  const size = dedupe([
    ...writtenRuns.flatMap((_, index) => {
      const sanction = sanctionByRun[index]
      return sanction ? engineSizeTags(sanction) : characterRuns[index].filter(isSizeTag)
    }),
    ...sizeSanctions.filter((s) => !sanctionByRun.includes(s)).flatMap(engineSizeTags),
  ])
  const engineByRun = assignEngineExpressions(characterRuns, engineExpressions)
  const runs: PreparedRun[] = characterRuns.map((run, index) => ({
    // Single-window mode caps each run at the head: identity banks lead, so
    // trailing clothing extras give way before any identity core does — except
    // her dress-state tag, which the cap keeps wherever the writer put it.
    base: options.singleWindow
      ? capRunKeepingProtected(
          dedupe(run.filter((tag) => !isExpressionTag(tag))),
          BOORU_MAX_RUN_TAGS_SINGLE_WINDOW,
        )
      : dedupe(run.filter((tag) => !isExpressionTag(tag))),
    expression: dedupeTags([
      ...engineByRun[index],
      ...toTags(sections.expressions?.[index]),
      ...run.filter(isExpressionTag),
    ]),
  }))
  const scene = dedupe(sanitize(toTags(sections.scene), sceneSanction))

  if (stripped.length > 0) {
    // Prompt archaeology: a later "why is she rendering small" investigation
    // should see that the writer over-claimed and that this pass acted.
    log('stripped breast claims the engine does not sanction', {
      stripped,
      sizeBlock: size,
      sanctioned: sizeSanctions.map((s) => ({ tier: s.tier, grewThisTurn: s.grewThisTurn })),
    })
  }

  const baseTotal = runs.reduce((total, run) => total + run.base.length, 0)
  const expressionTotal = (prepared: ReadonlyArray<PreparedRun>): number =>
    prepared.reduce((total, run) => total + run.expression.length, 0)
  const fixed = rating.length + camera.length + count.length + size.length + baseTotal
  const overBy = (sceneLength: number, expressionLength: number, actionLength: number): number =>
    fixed + sceneLength + expressionLength + actionLength - budget

  const sceneOver = overBy(scene.length, expressionTotal(runs), action.length)
  const trimmedScene =
    sceneOver > 0 ? scene.slice(0, Math.max(MIN_SCENE_TAGS, scene.length - sceneOver)) : scene
  const expressionOver = overBy(trimmedScene.length, expressionTotal(runs), action.length)
  const trimmedRuns = expressionOver > 0 ? trimExpressionRuns(runs, expressionOver) : runs
  const actionOver = overBy(trimmedScene.length, expressionTotal(trimmedRuns), action.length)
  const trimmedAction =
    actionOver > 0 ? action.slice(0, Math.max(MIN_ACTION_TAGS, action.length - actionOver)) : action

  const assembled = options.singleWindow
    ? fitTokenBudget(
        {
          rating,
          camera,
          count,
          action: trimmedAction,
          size,
          runs: trimmedRuns,
          scene: trimmedScene,
        },
        BOORU_SINGLE_WINDOW_TOKEN_BUDGET,
      )
    : { action: trimmedAction, camera, runs: trimmedRuns, scene: trimmedScene }

  // Single-window only: a bare `pov` restates a surviving `male pov` /
  // `faceless male` run (checked on the FINAL runs, so a trimmed-away POV run
  // never leaves the prompt with no POV signal at all).
  const povRunSurvived = assembled.runs.some((run) =>
    run.base.some((tag) => POV_MALE_TAGS.has(tag.toLowerCase())),
  )
  const finalCamera =
    options.singleWindow && povRunSurvived
      ? assembled.camera.filter((tag) => tag.toLowerCase() !== 'pov')
      : assembled.camera
  if (options.singleWindow) {
    const fitted = estimateTokens([
      ...rating,
      ...finalCamera,
      ...count,
      ...assembled.action,
      ...size,
      ...assembled.runs.flatMap((run) => [...run.base, ...run.expression]),
      ...assembled.scene,
    ])
    if (fitted > BOORU_SINGLE_WINDOW_TOKEN_BUDGET) {
      // Every block is at its floor and the window is still over: the
      // endpoint will truncate the tail. Diagnosable, not silent.
      log('single-window prompt over budget at floors', {
        estimated: fitted,
        budget: BOORU_SINGLE_WINDOW_TOKEN_BUDGET,
        runs: assembled.runs.length,
      })
    }
  }

  return joinTags([
    ...rating,
    ...finalCamera,
    ...count,
    ...assembled.action,
    ...size,
    ...assembled.runs.flatMap((run) => [...run.base, ...run.expression]),
    ...assembled.scene,
  ])
}

interface BudgetedBlocks {
  rating: string[]
  camera: string[]
  count: string[]
  action: string[]
  size: string[]
  runs: PreparedRun[]
  scene: string[]
}

/**
 * Token-budget post-pass for single-window endpoints: scene tail → expression
 * extras → camera angle → character-run tails → action (last; positions are the
 * beat), each to its floor, one tag at a time until the ESTIMATED token total
 * fits. Pure.
 */
export function fitTokenBudget(
  blocks: BudgetedBlocks,
  budget: number,
): { action: string[]; camera: string[]; runs: PreparedRun[]; scene: string[] } {
  let scene = [...blocks.scene]
  let action = [...blocks.action]
  let camera = [...blocks.camera]
  let runs = blocks.runs.map((run) => ({ base: [...run.base], expression: [...run.expression] }))
  const total = (): number =>
    estimateTokens([
      ...blocks.rating,
      ...camera,
      ...blocks.count,
      ...action,
      ...blocks.size,
      ...runs.flatMap((run) => [...run.base, ...run.expression]),
      ...scene,
    ])
  // Bounded: every iteration removes exactly one tag or stops.
  while (total() > budget) {
    if (scene.length > MIN_SCENE_TAGS) {
      scene = scene.slice(0, -1)
      continue
    }
    const expressive = runs
      .map((run, i) => ({ i, n: run.expression.length }))
      .filter((r) => r.n > MIN_EXPRESSION_TAGS)
      .sort((a, b) => b.n - a.n)[0]
    if (expressive) {
      runs = runs.map((run, i) =>
        i === expressive.i ? { ...run, expression: run.expression.slice(0, -1) } : run,
      )
      continue
    }
    // The camera's angle tag goes before any identity does; the shot type stays.
    if (camera.length > MIN_CAMERA_TAGS) {
      camera = camera.slice(0, -1)
      continue
    }
    // Run tails give way before the action block, and a run's protected
    // dress-state tag never does: the identity floor counts all but that tag.
    // The faceless protagonist-POV run has no identity to protect — it keeps
    // just `male pov, faceless male`.
    const longest = runs
      .map((run, i) => ({ i, n: trimmableCount(run.base), floor: runFloor(run.base) }))
      .filter((r) => r.n > r.floor)
      .sort((a, b) => b.n - a.n)[0]
    if (longest) {
      runs = runs.map((run, i) =>
        i === longest.i ? { ...run, base: dropLastTrimmableTag(run.base) } : run,
      )
      continue
    }
    // The act and its positions go last, and never below their floor.
    if (action.length > MIN_ACTION_TAGS) {
      action = action.slice(0, -1)
      continue
    }
    break
  }
  return { action, camera, runs, scene }
}

/** Identity floor (in trimmable tags) for one run under the token budget: the
 * faceless POV-male run has no identity to keep beyond its protected POV tags;
 * every described person keeps MIN_RUN_BASE_TAGS. */
function runFloor(base: ReadonlyArray<string>): number {
  return base.some((tag) => POV_MALE_TAGS.has(tag.toLowerCase()))
    ? MIN_POV_RUN_TAGS
    : MIN_RUN_BASE_TAGS
}

// ============================================================================
// Inputs
// ============================================================================

export interface BooruPromptWriterInput {
  /** All characters present in the scene (identity/clothing/bodyState source). */
  presentCharacters: Character[]
  /** Names on the <pic>/scene tag — the actual subjects to depict. */
  tagCharacterNames: string[]
  /** The story/narration-written prompt (scene, pose, framing intent + fallback). */
  scenePrompt: string
  /** The surrounding narrative beat, for extra scene context. */
  narrativeText: string
  /** BE-mode gate — include body-size band phrases only when on. */
  beMode: boolean
  /** Image provider — single-window endpoints get the tighter tag budget so
   * the WHOLE prompt fits in the one CLIP window that actually renders. */
  providerType?: ImageProviderType
  /**
   * Story id — used to look up the current location for scene tags. Optional:
   * the regeneration path has no story id, and the location block is a
   * best-effort nice-to-have, so it is simply omitted when absent.
   */
  storyId?: string
}

export interface ResolveBooruSceneInput extends BooruPromptWriterInput {
  /** Image model id — the writer runs only for booru-dialect models. */
  model: string | undefined
}

// ============================================================================
// Pure dossier assembly (unit-tested directly)
// ============================================================================

/** Descriptor fields that describe a stable/appearance look, in prose order. */
const APPEARANCE_FIELDS: ReadonlyArray<keyof VisualDescriptors> = [
  'face',
  'hair',
  'eyes',
  'build',
  'distinguishing',
]

/** Join a character's identity-bank string into a single comma-separated tag run. */
export function normalizeBank(imageTags: string | null | undefined): string {
  return (imageTags ?? '')
    .replace(/\s*\n+\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Deterministic backstop for the template's "never use names" rule: drop any
 * standalone comma-token that equals a present character's name (case-insensitive).
 * Booru models don't know names — "1girl, solo, Amelia, blonde hair" must lose
 * "Amelia". Only whole comma-tokens are removed, so a name embedded inside a
 * multi-subject clause ("straddling him") is left to the prompt's own wording.
 */
export function stripCharacterNames(prompt: string, presentCharacters: Character[]): string {
  const names = new Set(
    presentCharacters.map((c) => c.name.trim().toLowerCase()).filter((n) => n.length > 0),
  )
  if (names.size === 0) return prompt
  return prompt
    .split(',')
    .filter((token) => !names.has(token.trim().toLowerCase()))
    .join(', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/(?:,\s*)+,/g, ', ')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .trim()
}

/** Appearance reference (for subjects with no locked bank) as "field: value" parts. */
export function appearanceReference(vd: VisualDescriptors | null | undefined): string {
  if (!vd) return ''
  const parts: string[] = []
  for (const field of APPEARANCE_FIELDS) {
    const value = vd[field]?.trim()
    if (value) parts.push(`${field}: ${value}`)
  }
  return parts.join('; ')
}

/**
 * Image-facing body-size phrase for a subject — the band word, a relative-size
 * anchor at large tiers, and any engorgement/arousal cues, all already in booru
 * tag form so the writer can copy them straight into the character's run. Uses
 * the APPARENT tier (research/49 R6) to match what `assembleInlineImage` grounds
 * on downstream, so the writer's band word and the grounding pass agree.
 *
 * The cup letter and the engine's prose cue wording are deliberately absent:
 * booru models know neither, and the dossier is copied nearly verbatim, so any
 * non-tag text here becomes wasted tokens inside CLIP's attention window.
 */
export function bodyStatePhrase(metadata: Character['metadata']): string | null {
  const state = readBodyState(metadata)
  if (!state) return null
  const tier = apparentTier(state)
  const parts = [bandWord(tier)]
  const anchor = imageSizeAnchor(tier)
  if (anchor) parts.push(anchor)
  parts.push(...compressStateCues(imageStateCues(state)))
  return joinTags(parts)
}

/**
 * Image-facing expression phrase for a subject — the engine's deterministic
 * emotional read (arousal band, a growth that just landed, transformation
 * attitude, a bond extreme) already in booru tag form. Shown in the dossier so
 * the writer can copy it, AND merged deterministically at compose time so the
 * face survives even when the writer ignores it.
 */
export function expressionPhrase(metadata: Character['metadata']): string | null {
  const state = readBodyState(metadata)
  if (!state) return null
  const tags = engineExpressionTags(state)
  return tags.length > 0 ? joinTags(tags) : null
}

/** Resolve the tagged subjects in tag order (skips names with no present match). */
export function resolveSubjects(present: Character[], tagNames: string[]): Character[] {
  const byName = new Map(present.map((c) => [c.name.toLowerCase(), c]))
  const out: Character[] = []
  const seen = new Set<string>()
  for (const name of tagNames) {
    const key = name.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    const match = byName.get(key)
    if (match) {
      seen.add(key)
      out.push(match)
    }
  }
  return out
}

/**
 * Build the per-subject dossier block: locked identity tags to copy verbatim (or
 * an appearance reference to convert when there is no bank), current clothing
 * (current-state wins over baseline), and the body-size band (BE mode only).
 * Pure and testable — no I/O.
 */
export function buildSubjectDossier(
  presentCharacters: Character[],
  tagCharacterNames: string[],
  beMode: boolean,
): string {
  const subjects = resolveSubjects(presentCharacters, tagCharacterNames)
  if (subjects.length === 0) {
    return '(no named subjects — depict the scene described above; use "no humans" if nobody is in frame)'
  }

  const blocks = subjects.map((c) => {
    const lines: string[] = [`- ${c.name}:`]

    const bank = normalizeBank(c.imageTags)
    if (bank) {
      lines.push(`  identity tags (copy VERBATIM): ${bank}`)
    } else {
      const appearance = appearanceReference(c.currentVisualDescriptors ?? c.visualDescriptors)
      lines.push(
        appearance
          ? `  appearance (convert to booru identity tags): ${appearance}`
          : '  appearance: (unspecified — infer a plausible consistent look)',
      )
    }

    const clothing = (c.currentVisualDescriptors?.clothing ?? c.visualDescriptors?.clothing)?.trim()
    if (clothing) lines.push(`  current clothing: ${clothing}`)

    if (beMode) {
      const body = bodyStatePhrase(c.metadata)
      if (body) lines.push(`  body: ${body}`)
      const expression = expressionPhrase(c.metadata)
      if (expression) {
        lines.push(
          `  expression (engine state — copy VERBATIM into her expression run, then add what the beat shows): ${expression}`,
        )
      }
    }

    return lines.join('\n')
  })

  return blocks.join('\n')
}

/**
 * Engine expression cues for the tagged subjects, in tag order — the
 * deterministic half of the expression layer, handed to
 * `composeBooruScenePrompt` so it lands in each girl's own run regardless of
 * what the writer did with the dossier line.
 *
 * BE-mode gated for the same reason the body line is: the BE reducer is the only
 * writer of this state, so outside a BE story there is nothing to read and the
 * writer's beat-driven expressions stand alone.
 */
export function buildExpressionCues(
  presentCharacters: Character[],
  tagCharacterNames: string[],
  beMode: boolean,
): CharacterExpressionCue[] {
  if (!beMode) return []
  const cues: CharacterExpressionCue[] = []
  for (const character of resolveSubjects(presentCharacters, tagCharacterNames)) {
    const state = readBodyState(character.metadata)
    if (!state) continue
    const expressionTags = engineExpressionTags(state)
    if (expressionTags.length === 0) continue
    cues.push({ identityTags: toTags(normalizeBank(character.imageTags)), expressionTags })
  }
  return cues
}

/**
 * The engine's size truth for the tagged subjects, in tag order — handed to
 * `composeBooruScenePrompt`, which deletes the writer's breast claims for these
 * subjects and states the engine's own size in their place, so the rendered body
 * follows the tier the engine holds rather than the one the narration described.
 *
 * Uses the APPARENT tier for the same reason `bodyStatePhrase` does: it is what
 * the dossier tells the writer and what the downstream grounding pass uses, so
 * all three agree on which band words are legitimate.
 *
 * BE-mode gated: outside a BE story the engine owns no body state, so there is
 * nothing to enforce and the writer's tags stand.
 */
export function buildSizeSanctions(
  presentCharacters: Character[],
  tagCharacterNames: string[],
  beMode: boolean,
): SubjectSizeSanction[] {
  if (!beMode) return []
  const sanctions: SubjectSizeSanction[] = []
  for (const character of resolveSubjects(presentCharacters, tagCharacterNames)) {
    const state = readBodyState(character.metadata)
    if (!state) continue
    sanctions.push({
      identityTags: toTags(normalizeBank(character.imageTags)),
      tier: apparentTier(state),
      grewThisTurn: (state.lastGrowth?.delta ?? 0) > 0,
      engorged: isEngorged(state),
      lactating:
        state.lactation?.active === true && state.fluids.fillPercent >= LACTATION_VISIBLE_FILL,
    })
  }
  return sanctions
}

/** Current-location scene block (name + description), or empty when unknown. */
export function buildLocationBlock(location: Location | null | undefined): string {
  if (!location) return ''
  const description = location.description?.trim()
  const line = description ? `${location.name} — ${description}` : location.name?.trim()
  if (!line) return ''
  return `## Current location\n${line}\n`
}

/**
 * POV-driven camera guidance (D5 playtest): how the scene is presented should
 * follow how the story is TOLD. First/second/hybrid person = the protagonist
 * is the camera; third person = an observed scene. Empty when the story
 * carries no POV.
 */
export function buildPovGuidance(pov: string | null | undefined): string {
  if (pov === 'first' || pov === 'second' || pov === 'hybrid') {
    return `## Camera and POV
This story is told through the protagonist's eyes. Frame the image the same way: prefer pov framing tags (pov, from behind, over-shoulder, or first-person hands where the scene supports it), keep the protagonist the unseen or barely-seen viewer, and never depict the protagonist's face.
`
  }
  if (pov === 'third') {
    return `## Camera and POV
This story is narrated in third person. Frame the image as an observed scene (e.g. cowboy shot, wide shot, from side) — the protagonist, when present, may be depicted fully like any other character.
`
  }
  return ''
}

/**
 * Story setting/genre block — the atmosphere anchor the writer was missing:
 * without it, attire and props default to the checkpoint's modern-day prior
 * (jeans in a fantasy tavern; a smartphone in a castle). Playtest finding,
 * D5 round 1. Empty when the story carries no genre or description.
 */
export function buildStorySettingBlock(
  story: { genre?: string | null; description?: string | null } | null | undefined,
): string {
  if (!story) return ''
  const genre = story.genre?.trim()
  const description = story.description?.trim()
  if (!genre && !description) return ''
  const lines = [genre ? `Genre: ${genre}.` : '', description ?? ''].filter(Boolean)
  return `## Story setting
${lines.join(' ')}
Attire, props, architecture, and technology in your tags MUST fit this setting and era — no modern clothing or devices in period/fantasy settings (and vice versa) unless the narration explicitly says so.
`
}

/** Trim the narrative beat to a bounded tail so it stays a hint, not the bulk. */
export function narrativeContext(narrativeText: string): string {
  const trimmed = (narrativeText ?? '').trim()
  if (trimmed.length <= NARRATIVE_CONTEXT_CHARS) return trimmed || '(none)'
  return `…${trimmed.slice(-NARRATIVE_CONTEXT_CHARS)}`
}

// ============================================================================
// Act-reliability validation (mechanical backstop)
// ============================================================================

/**
 * Count tags that put a male in frame. The count tag is what CONTROLS how many
 * people render, so a male participant absent from it is absent from the image.
 */
const MALE_COUNT_TAG = /^(?:\d+\s*boys?|multiple boys|male focus)$/

/** The writer's protagonist-POV form — a male participant who is the viewer. */
const POV_MALE_TAGS: ReadonlySet<string> = new Set(['male pov', 'faceless male'])

/** Count tags a lone female subject produces — nobody else is in frame. */
const LONE_FEMALE_COUNT_TAGS: ReadonlySet<string> = new Set(['1girl', 'solo'])

const MISSING_ACT_NOTE =
  'Your previous output claimed an act in progress but named no act tag in the action field. ' +
  'Re-emit with the act tag family first: act, arrangement (hetero/yuri), positions.'

const MISSING_MALE_NOTE =
  'Your previous output left the male participant out of countTags. He is in frame and the ' +
  'count tag controls who renders — re-emit countTags with him counted (e.g. "1boy, 1girl"), ' +
  'keeping his character run in the faceless protagonist-POV form when he is the viewer.'

const MISSING_DRESS_NOTE =
  'The scene intent says a subject is bare ("naked", "standing bare", "topless", "breasts exposed" …) ' +
  'but no character run states a dress state. The dossier\'s "current clothing" is what she WORE when ' +
  "the beat began — when the intent says it is off, her run must carry THIS beat's dress state " +
  'instead: "completely nude", "topless" or "bottomless" (plus where the clothes went — "clothes pull", ' +
  '"halter top pulled down" — if they are in frame), and never "clothed". Re-emit with the dress ' +
  'state in her run.'

/** What the deterministic check found wrong, and the correction to re-prompt with. */
export interface ActReliabilityDefect {
  /** `actInProgress` was declared but the action block names no act. */
  missingActTag: boolean
  /** An act with a male participant, but no male in the count tags. */
  missingMaleCount: boolean
  /** Face-to-face AND from-behind arrangement tags in the same action block. */
  conflictingArrangement: boolean
  /** The scene intent says a subject is bare, but no character run states a dress state. */
  missingDressState: boolean
  /** The correction appended to the system prompt on the single retry. */
  note: string
}

/**
 * Mutually exclusive body arrangements. A writer that emits both ("pressed
 * together, arms around neck" AND "vaginal from behind") asks the image model
 * for two poses at once — the live result was tangled anatomy (D5, research/64).
 */
const FACING_TAGS: ReadonlySet<string> = new Set([
  'face to face',
  'face-to-face',
  'pressed together',
  'arms around neck',
  'arm around neck',
  'hug',
  'hugging',
  'kiss',
  'kissing',
  'french kiss',
  'missionary',
  'cowgirl position',
  'upright straddle',
  'suspended congress',
  'mating press',
  'leg lock',
  'eye contact',
])
const BEHIND_TAGS: ReadonlySet<string> = new Set([
  'from behind',
  'sex from behind',
  'vaginal from behind',
  'anal from behind',
  'standing sex from behind',
  'doggystyle',
  'doggy style',
  'prone bone',
  'bent over',
  'bent over table',
  'reverse cowgirl position',
  'looking back',
])

const CONFLICTING_ARRANGEMENT_NOTE =
  'Your previous output mixed a face-to-face arrangement (pressed together / arms around neck / ' +
  'kiss / missionary) with a from-behind one (from behind / doggystyle / prone bone / bent over) in ' +
  'the same action field — the image model cannot draw both. Re-emit with ONE arrangement, ' +
  'the one the narrative beat actually describes, and only tags consistent with it.'

/**
 * Deterministic backstop when the writer still mixes arrangements after the
 * retry: keep the family whose first tag appears EARLIEST in the action run
 * (the writer's own lead), drop the other family's tags. Pure.
 */
export function resolveArrangementConflict<T extends Partial<BooruSceneSections>>(sections: T): T {
  const tags = toTags(sections.action)
  const lower = tags.map((t) => t.toLowerCase())
  const firstFacing = lower.findIndex((t) => FACING_TAGS.has(t))
  const firstBehind = lower.findIndex((t) => BEHIND_TAGS.has(t))
  if (firstFacing === -1 || firstBehind === -1) return sections
  const dropBehind = firstFacing < firstBehind
  const kept = tags.filter((t, i) => !(dropBehind ? BEHIND_TAGS : FACING_TAGS).has(lower[i]))
  return { ...sections, action: joinTags(kept) }
}

/**
 * Deterministic check of the writer's own declaration against its own tags.
 *
 * The template has been told act-first in three successive rewrites and the
 * writer still, unreliably, drops the ongoing act (rendering an explicit beat as
 * an ambiguous pose) and sometimes the male participant with it. Instruction
 * compliance is not fixable from inside the instructions, so the writer declares
 * `actInProgress` and this function checks that declaration mechanically:
 *
 * - `actInProgress` with no act-family tag in the action block → the exact live
 *   failure shape ("lying on back, breast expansion, breasts hanging low").
 * - `actInProgress` with a male participant implied — the arrangement tag
 *   "hetero", the protagonist-POV form in a run, or a partnered act on a lone
 *   female count — but no male count tag → he will not render at all.
 *
 * Returns `null` when the output is fine (the hot path — no retry, no extra LLM
 * call). Aftermath is `actInProgress: false` and is never flagged: a plain pose
 * action is the CORRECT output there.
 */
export function detectActDefects(
  sections: Partial<BooruSceneSections>,
): ActReliabilityDefect | null {
  if (!sections.actInProgress) return null

  const actionTags = toTags(sections.action).map((tag) => tag.toLowerCase())
  const countTags = toTags(sections.countTags).map((tag) => tag.toLowerCase())
  const runTags = (sections.characters ?? []).flatMap((run) =>
    toTags(run).map((tag) => tag.toLowerCase()),
  )

  const missingActTag = !hasActFamilyTag(actionTags)

  const hasMaleCount = countTags.some((tag) => MALE_COUNT_TAG.test(tag))
  const loneFemale =
    countTags.length > 0 && countTags.every((tag) => LONE_FEMALE_COUNT_TAGS.has(tag))
  const povMale = runTags.some((tag) => POV_MALE_TAGS.has(tag))
  // "yuri" is the writer stating the act has no male in it — believe it.
  const maleImplied =
    !actionTags.includes('yuri') &&
    (povMale || actionTags.includes('hetero') || (loneFemale && hasPartneredActTag(actionTags)))
  const missingMaleCount = maleImplied && !hasMaleCount
  const conflictingArrangement =
    actionTags.some((t) => FACING_TAGS.has(t)) && actionTags.some((t) => BEHIND_TAGS.has(t))

  if (!missingActTag && !missingMaleCount && !conflictingArrangement) return null
  return {
    missingActTag,
    missingMaleCount,
    conflictingArrangement,
    missingDressState: false,
    note: [
      missingActTag ? MISSING_ACT_NOTE : '',
      missingMaleCount ? MISSING_MALE_NOTE : '',
      conflictingArrangement ? CONFLICTING_ARRANGEMENT_NOTE : '',
    ]
      .filter(Boolean)
      .join(' '),
  }
}

/** Character runs as tag arrays, minus the faceless protagonist-POV run (he has no dress state to state). */
function describedRuns(sections: Partial<BooruSceneSections>): string[][] {
  return (sections.characters ?? [])
    .map((run) => toTags(run))
    .filter((run) => !run.some((tag) => POV_MALE_TAGS.has(tag.toLowerCase())))
}

/**
 * Dress-state check (D5 round 2, research/64 §4.1). The live failure: the
 * narrator's intent said "standing bare" / "sitting bare on a crate" and the
 * writer still wrote `clothed, damp halter top` (or no dress state at all),
 * because the dossier's "current clothing" line — what she wore when the beat
 * began — beat the beat. Independent of `actInProgress`: both live cases were
 * anticipation beats. True when the intent names exposure and no described run
 * states ANY dress state (nude family or clothes-displaced family). Pure.
 */
export function detectMissingDressState(
  sections: Partial<BooruSceneSections>,
  sceneIntent: string,
): boolean {
  if (!inferImpliedDressState(sceneIntent)) return false
  const described = describedRuns(sections)
  // Nobody described (a faceless-POV-only cast): nothing to state, nothing to check.
  if (described.length === 0) return false
  return !described.some((run) => hasDressStateTag(run))
}

/**
 * Every mechanical check in one pass, so the single corrective retry carries
 * every note at once. `null` on the hot path (nothing wrong, no extra call).
 */
export function detectWriterDefects(
  sections: Partial<BooruSceneSections>,
  sceneIntent: string,
): ActReliabilityDefect | null {
  const act = detectActDefects(sections)
  const missingDressState = detectMissingDressState(sections, sceneIntent)
  if (!act && !missingDressState) return null
  return {
    missingActTag: act?.missingActTag ?? false,
    missingMaleCount: act?.missingMaleCount ?? false,
    conflictingArrangement: act?.conflictingArrangement ?? false,
    missingDressState,
    note: [act?.note ?? '', missingDressState ? MISSING_DRESS_NOTE : ''].filter(Boolean).join(' '),
  }
}

/**
 * Deterministic backstop when the writer still leaves the bare subject dressed
 * after the retry: with exactly ONE named subject (so there is no doubt who the
 * intent means), her run — the described run sharing the most of her locked
 * bank, else the first described run — drops any "clothed" assertion and gains
 * the intent's dress tag (completely nude / topless / bottomless). With several
 * named subjects the intent is ambiguous about who is bare, so nothing changes.
 * Pure; returns the same object when it does nothing.
 */
export function applyDressStateFallback<T extends Partial<BooruSceneSections>>(
  sections: T,
  sceneIntent: string,
  subjects: ReadonlyArray<Pick<Character, 'imageTags'>>,
): T {
  const implied = inferImpliedDressState(sceneIntent)
  if (!implied || subjects.length !== 1) return sections
  const runs = (sections.characters ?? []).map((run) => toTags(run))
  const described = runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) => !run.some((tag) => POV_MALE_TAGS.has(tag.toLowerCase())))
  if (described.length === 0 || described.some(({ run }) => hasDressStateTag(run))) return sections

  const bank = new Set(toTags(normalizeBank(subjects[0].imageTags)).map((t) => t.toLowerCase()))
  const scored = described.map(({ run, index }) => ({
    index,
    score: run.filter((tag) => bank.has(tag.toLowerCase())).length,
  }))
  const target = scored.reduce((best, cur) => (cur.score > best.score ? cur : best), scored[0])

  const rewritten = runs.map((run, index) =>
    index === target.index
      ? joinTags([
          ...run.filter((tag) => !CLOTHED_ASSERTION_TAGS.has(tag.toLowerCase())),
          DRESS_TAG_FOR_STATE[implied],
        ])
      : joinTags(run),
  )
  return { ...sections, characters: rewritten }
}

// ============================================================================
// The LLM call
// ============================================================================

/**
 * Convert one scene into a booru tag prompt. Best-effort: returns `null` when no
 * preset is assigned or the AI call throws — never throws out of this function.
 * Does NOT check the setting or model dialect; that gating lives in
 * `resolveBooruScenePrompt` so the raw call stays independently testable.
 */
export async function writeBooruScenePrompt(input: BooruPromptWriterInput): Promise<string | null> {
  // Everything (including the preset lookup) sits inside the try so the
  // best-effort "never throws" contract is structural, not incidental — the two
  // seams that call this outside their own try/catch depend on it.
  try {
    const presetId = settings.getServicePresetId(SERVICE_ID)
    if (!presetId) {
      log('no preset assigned for booru prompt writer — skipping')
      return null
    }

    const subjects = resolveSubjects(input.presentCharacters, input.tagCharacterNames)

    // Current location + story setting for scene tags — best-effort; a lookup
    // failure (or no story id, as on the regeneration path) just omits the
    // block rather than failing the whole write.
    let location: Location | undefined
    let story: {
      genre?: string | null
      description?: string | null
      settings?: { pov?: string } | null
    } | null = null
    if (input.storyId) {
      try {
        const locations = await database.getLocations(input.storyId)
        location = locations.find((l) => l.current) ?? undefined
      } catch (error) {
        log('current-location lookup failed — omitting location block', error)
      }
      try {
        story = await database.getStory(input.storyId)
      } catch (error) {
        log('story lookup failed — omitting story-setting block', error)
      }
    }

    const ctx = new ContextBuilder()
    ctx.add({
      sceneIntent: input.scenePrompt.trim() || '(the narration gave no explicit scene prompt)',
      narrativeBeat: narrativeContext(input.narrativeText),
      subjectCount: String(subjects.length),
      subjectDossier: buildSubjectDossier(
        input.presentCharacters,
        input.tagCharacterNames,
        input.beMode,
      ),
      storySetting: buildStorySettingBlock(story),
      povGuidance: buildPovGuidance(story?.settings?.pov),
      locationBlock: buildLocationBlock(location),
    })
    const { system, user: prompt } = await ctx.render(TEMPLATE_ID)

    let raw = await generateStructured(
      {
        presetId,
        schema: booruScenePromptSchema,
        system,
        prompt,
      },
      SERVICE_ID,
    )

    // Mechanical act-reliability + dress-state backstop. Off the hot path by
    // construction: a compliant output detects no defect and costs zero extra
    // calls. ONE corrective retry covers every defect; the retry's output is
    // used even if it is still wrong, because a mediocre prompt beats no image.
    const sceneIntent = input.scenePrompt
    const defect = detectWriterDefects(raw, sceneIntent)
    if (defect) {
      log('act-reliability validation failed', {
        missingActTag: defect.missingActTag,
        missingMaleCount: defect.missingMaleCount,
        conflictingArrangement: defect.conflictingArrangement,
        missingDressState: defect.missingDressState,
        action: raw.action,
        countTags: raw.countTags,
        characters: raw.characters,
      })
      try {
        log('issuing single corrective retry')
        const retried = await generateStructured(
          {
            presetId,
            schema: booruScenePromptSchema,
            system: `${system}\n\nCORRECTION — your previous attempt was rejected. ${defect.note}`,
            prompt,
          },
          SERVICE_ID,
        )
        const stillWrong = detectWriterDefects(retried, sceneIntent)
        if (stillWrong) {
          log('WARN: retry still fails act validation — using it anyway (best effort)', {
            missingActTag: stillWrong.missingActTag,
            missingMaleCount: stillWrong.missingMaleCount,
            conflictingArrangement: stillWrong.conflictingArrangement,
            missingDressState: stillWrong.missingDressState,
          })
        } else {
          log('retry satisfied act validation')
        }
        raw = retried
      } catch (error) {
        // A failed retry must not cost us the usable first output.
        log('corrective retry threw — keeping the first output', error)
      }
    }

    // A still-mixed arrangement after the retry is resolved mechanically (keep
    // the writer's lead family) — two poses at once is never a usable prompt.
    raw = resolveArrangementConflict(raw)
    // A still-dressed bare subject after the retry gets the intent's dress tag
    // mechanically (single named subject only — see applyDressStateFallback).
    const dressed = applyDressStateFallback(raw, sceneIntent, subjects)
    if (dressed !== raw) {
      log('dress-state fallback applied', { characters: dressed.characters })
      raw = dressed
    }

    // Order is imposed here, not asked of the model: the sections come back
    // labelled, so the attention-critical action-before-identity ordering and
    // the tag budget are deterministic. The engine's expression cues merge into
    // the matching character run at the same time, and the engine's size truth
    // filters out any size claim the writer took from the narration instead.
    const rawWritten = composeBooruScenePrompt(
      raw,
      buildExpressionCues(input.presentCharacters, input.tagCharacterNames, input.beMode),
      buildSizeSanctions(input.presentCharacters, input.tagCharacterNames, input.beMode),
      { singleWindow: !chunksLongPrompts(input.providerType) },
    )
    if (!rawWritten) {
      log('booru prompt writer returned empty — falling back')
      return null
    }
    // Backstop the template's "never use names" rule — booru models don't know
    // character names, so a leaked "Amelia" tag just wastes conditioning.
    const written = stripCharacterNames(rawWritten, input.presentCharacters)
    log('wrote booru scene prompt', {
      subjects: subjects.map((c) => c.name),
      length: written.length,
    })
    return written
  } catch (error) {
    log('booru prompt writer failed — falling back', error)
    return null
  }
}

/**
 * Resolve the tag prompt to send to `assembleInlineImage`: the dedicated
 * writer's booru output when it is enabled, the model is a booru model, and the
 * call succeeds — otherwise the original story-written `scenePrompt`, unchanged.
 * This is the single gate every inline/analyzed seam calls, so the three paths
 * cannot drift.
 */
export async function resolveBooruScenePrompt(input: ResolveBooruSceneInput): Promise<string> {
  if (!settings.systemServicesSettings.imageGeneration.dedicatedBooruPromptWriter) {
    return input.scenePrompt
  }
  if (detectPromptDialect(input.model) !== 'booru') {
    return input.scenePrompt
  }
  const written = await writeBooruScenePrompt(input)
  return written ?? input.scenePrompt
}
