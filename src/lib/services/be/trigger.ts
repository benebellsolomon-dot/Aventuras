/**
 * BE engine — the absolute growth rule (research/66, Ben's ruling 2026-08-22):
 * with a growth cosmology set, growth happens ONLY when the story's driving act
 * completes on the page. The classifier reports `growthTriggers` with a
 * verbatim `evidence` quote; this module verifies the quote against the
 * finalized narration so the classifier cannot assert growth without the text
 * actually containing it (the same whitelist-and-verify spirit as research/57:
 * template pleading loses to model variance, a verifiable artifact does not).
 *
 * Verification is deliberately punctuation- and markup-insensitive (the
 * narration is HTML with <em>/<span> abutting commas; an honest quote must not
 * fail on that) and deliberately strict about WHAT counts as a quote: long
 * enough to be a sentence, about HER (her name or she/her), and not a line of
 * dialogue (talking about the act is not the act — the review's bypass).
 *
 * Pure: no store/database deps.
 */
import { stripThoughtTags } from '$lib/utils/thoughtTagParser'

import type { GrowthTrigger } from './types'

/** A quote shorter than this many normalized words cannot be the act's sentence. */
export const GROWTH_TRIGGER_MIN_EVIDENCE_WORDS = 5
/** …and shorter than this many normalized characters ("he came inside" is topic, not proof). */
export const GROWTH_TRIGGER_MIN_EVIDENCE_CHARS = 24
/** The quote must be about her: one of these, or a token of her name. */
const FEMALE_REFERENCE = new Set(['she', 'her', 'hers', 'herself'])
/** Name tokens shorter than this ("de", "la") do not count as naming her. */
const NAME_TOKEN_MIN = 3

/** The gate is on exactly when the story states a cosmology (the absolute rule IS the cosmology). */
export function growthGateRequired(
  settings: { beGrowthCosmology?: unknown } | null | undefined,
): boolean {
  const cosmology = settings?.beGrowthCosmology
  return typeof cosmology === 'string' && cosmology.trim() !== ''
}

/** Case/whitespace-insensitive character key, the same way the apply site resolves names. */
export const normalizeTriggerName = (name: string): string => name.trim().toLowerCase()

// Attribute-aware tag shapes: a `>` inside a quoted attribute must not end the tag.
const ATTRS = `(?:"[^"]*"|'[^']*'|[^>"'])*`
const PIC_TAG = new RegExp(`<pic\\b${ATTRS}/?>|</pic\\s*>`, 'gi')
const DROPPED_BLOCKS = new RegExp(`<(style|script)\\b${ATTRS}>[\\s\\S]*?</\\1\\s*>`, 'gi')
const ANY_TAG = new RegExp(`<${ATTRS}>`, 'g')
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g
const NAMED_ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&nbsp;/gi, ' '],
  [/&quot;|&ldquo;|&rdquo;/gi, '"'],
  [/&#39;|&apos;|&lsquo;|&rsquo;/gi, "'"],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&hellip;/gi, '...'],
  [/&mdash;|&ndash;/gi, '-'],
  // Last, so `&amp;lt;` stays the literal text `&lt;` rather than double-decoding.
  [/&amp;/gi, '&'],
]

function decodeEntities(text: string): string {
  let out = text
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code) || 0xfffd))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16) || 0xfffd),
    )
  for (const [pattern, replacement] of NAMED_ENTITIES) out = out.replace(pattern, replacement)
  return out
}

/**
 * Narration and quote are compared in the same normalized space: <pic> tags
 * (the description is not the act), inner voices, style/script blocks removed,
 * HTML stripped, entities decoded, zero-width characters dropped, typographic
 * quotes/dashes/ellipses flattened, whitespace collapsed, lowercased.
 */
export function normalizeEvidenceText(text: string): string {
  const withoutBlocks = stripThoughtTags(text.replace(DROPPED_BLOCKS, ' ').replace(PIC_TAG, ' '))
  return decodeEntities(withoutBlocks.replace(ANY_TAG, ' '))
    .replace(ZERO_WIDTH, '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Matching projection: letters, digits and single spaces only. A tag stripped
 * to a space before a comma, a dropped period, a straight-vs-curly quote — none
 * of it can fail an honest quote, and none of it can be used to dodge the check.
 */
export function projectForMatch(normalized: string): string {
  return normalized
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The quoted-dialogue spans of a normalized narration, projected — a quote
 * living entirely inside one is talk, not the act. Pairs quotes in document
 * order (odd segments of a split on `"`), so a short utterance cannot make a
 * span bridge into the prose after it.
 */
function dialogueSpans(normalized: string): string[] {
  return normalized
    .split('"')
    .filter((_segment, index) => index % 2 === 1)
    .map(projectForMatch)
    .filter((span) => span !== '')
}

/** True when the projected quote names her (a ≥3-char token of her name) or refers to her (she/her). */
function refersToHer(projectedQuote: string, character: string): boolean {
  const words = projectedQuote.split(' ')
  const nameTokens = projectForMatch(normalizeTriggerName(character))
    .split(' ')
    .filter((t) => t.length >= NAME_TOKEN_MIN)
  return words.some((w) => FEMALE_REFERENCE.has(w) || nameTokens.includes(w))
}

export type GrowthTriggerRejection =
  | 'empty_name'
  | 'too_short'
  | 'not_about_her'
  | 'not_on_page'
  | 'dialogue_only'

export interface GrowthTriggerVerification {
  /** Normalized (trim+lowercase) names whose evidence is really on the page. */
  verified: Set<string>
  /** Every discarded trigger, with why — for the dev log. */
  rejected: Array<{ character: string; reason: GrowthTriggerRejection }>
}

/**
 * Verify the classifier's triggers against the finalized narration. A trigger
 * is discarded — and with it the growth — when its quote is too short, is not
 * about her, is not a literal (projection-level) substring of the page, or sits
 * entirely inside a line of dialogue.
 */
export function verifyGrowthTriggers(
  triggers: ReadonlyArray<GrowthTrigger>,
  narrative: string,
): GrowthTriggerVerification {
  const verified = new Set<string>()
  const rejected: GrowthTriggerVerification['rejected'] = []
  if (triggers.length === 0) return { verified, rejected }
  const normalizedNarrative = normalizeEvidenceText(narrative)
  const haystack = projectForMatch(normalizedNarrative)
  const dialogue = haystack === '' ? [] : dialogueSpans(normalizedNarrative)
  for (const trigger of triggers) {
    const name = normalizeTriggerName(trigger.character)
    if (name === '') {
      rejected.push({ character: trigger.character, reason: 'empty_name' })
      continue
    }
    const quote = projectForMatch(normalizeEvidenceText(trigger.evidence))
    if (
      quote.length < GROWTH_TRIGGER_MIN_EVIDENCE_CHARS ||
      quote.split(' ').length < GROWTH_TRIGGER_MIN_EVIDENCE_WORDS
    ) {
      rejected.push({ character: trigger.character, reason: 'too_short' })
      continue
    }
    if (!refersToHer(quote, trigger.character)) {
      rejected.push({ character: trigger.character, reason: 'not_about_her' })
      continue
    }
    if (haystack === '' || !haystack.includes(quote)) {
      rejected.push({ character: trigger.character, reason: 'not_on_page' })
      continue
    }
    if (dialogue.some((span) => span.includes(quote))) {
      rejected.push({ character: trigger.character, reason: 'dialogue_only' })
      continue
    }
    verified.add(name)
  }
  return { verified, rejected }
}
