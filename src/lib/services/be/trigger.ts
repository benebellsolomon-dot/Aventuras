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
/** Block boundaries become a sentinel so a quote can never straddle two paragraphs (review F4). */
const BLOCK_BREAK = new RegExp(
  `</(?:p|div|li|h[1-6]|blockquote|tr|td|th)\\s*>|<(?:br|hr)\\b${ATTRS}/?>`,
  'gi',
)
const ANY_TAG = new RegExp(`<${ATTRS}>`, 'g')
const BLOCK_SENTINEL = '␟'
const ZERO_WIDTH = /[​-‍⁠﻿­]/g
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  lt: '<',
  gt: '>',
  hellip: '...',
  mdash: '-',
  ndash: '-',
}

/** One pass, one regex — a decoded `&amp;lt;` stays the literal text `&lt;` (no double decoding). */
function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1]?.toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

/**
 * Narration and quote are compared in the same normalized space: NFC, <pic>
 * tags (the description is not the act), inner voices, style/script blocks
 * removed, block boundaries marked, HTML stripped, entities decoded, zero-width
 * characters dropped, typographic quotes/dashes/ellipses flattened, whitespace
 * collapsed, lowercased.
 */
export function normalizeEvidenceText(text: string): string {
  const withoutBlocks = stripThoughtTags(
    text
      .normalize('NFC')
      .replace(DROPPED_BLOCKS, ' ')
      .replace(PIC_TAG, ' ')
      .replace(BLOCK_BREAK, ` ${BLOCK_SENTINEL} `),
  )
  return decodeEntities(withoutBlocks.replace(ANY_TAG, ' '))
    .replace(ZERO_WIDTH, '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:␟ ?)+|(?: ?␟)+$/g, '')
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

/** Space-anchored containment: a truncated word at either end is not a quote (review F10). */
const containsPhrase = (haystack: string, phrase: string): boolean =>
  ` ${haystack} `.includes(` ${phrase} `)

/** The blocks (paragraphs) of a normalized narration. */
const blocksOf = (normalized: string): string[] =>
  normalized
    .split(BLOCK_SENTINEL)
    .map((block) => block.trim())
    .filter((block) => block !== '')

/**
 * The dialogue spans of one normalized block, projected: CLOSED double-quote
 * pairs and word-bounded single-quote pairs only — an unpaired inch mark or a
 * paragraph-spanning quotation can neither create nor destroy a span (review
 * F1/F2/F3). A quote living entirely inside one is talk, not the act.
 */
function dialogueSpans(block: string): string[] {
  const spans: string[] = []
  for (const match of block.matchAll(/"([^"]*)"/g)) spans.push(projectForMatch(match[1]))
  for (const match of block.matchAll(/(?:^|\s)'([^']*)'(?=[\s,.;:!?]|$)/g)) {
    spans.push(projectForMatch(match[1]))
  }
  return spans.filter((span) => span !== '')
}

/** Honorifics/particles that are part of a name but never identify her on their own. */
const NAME_NOISE = new Set([
  'lady',
  'lord',
  'sir',
  'miss',
  'mrs',
  'mr',
  'ms',
  'madame',
  'madam',
  'mistress',
  'master',
  'queen',
  'king',
  'princess',
  'prince',
  'sister',
  'brother',
  'mother',
  'father',
  'aunt',
  'uncle',
  'doctor',
  'dr',
  'captain',
  'the',
  'of',
  'von',
  'van',
  'de',
  'la',
  'le',
  'du',
  'da',
])

/** The tokens of a character's name that identify her: a single-token name counts whole (≥2 chars, "Io"); multi-token names drop honorifics/particles and tokens under 3 chars. */
export function nameTokensOf(character: string): string[] {
  const tokens = projectForMatch(normalizeTriggerName(character)).split(' ').filter(Boolean)
  if (tokens.length === 1) return tokens[0].length >= 2 ? tokens : []
  return tokens.filter((t) => t.length >= NAME_TOKEN_MIN && !NAME_NOISE.has(t))
}

export type GrowthTriggerRejection =
  | 'empty_name'
  | 'too_short'
  | 'not_about_her'
  | 'names_another'
  | 'not_on_page'
  | 'dialogue_only'

export interface GrowthTriggerVerification {
  /** Normalized (trim+lowercase) names whose evidence is really on the page. */
  verified: Set<string>
  /** Every discarded trigger, with why — for the dev log. */
  rejected: Array<{ character: string; reason: GrowthTriggerRejection }>
}

export interface VerifyGrowthTriggersOptions {
  /** Names of the OTHER tracked characters in the story: a quote that names one of them and not her is rejected (review F5 — a name slip must not grow the wrong girl). */
  cast?: ReadonlyArray<string>
}

/**
 * Verify the classifier's triggers against the finalized narration. A trigger
 * is discarded — and with it the growth — when its quote is too short, is not
 * about her, names another girl instead, is not a literal (projection-level,
 * word-anchored) substring of ONE block of the page, or sits entirely inside a
 * line of dialogue.
 */
export function verifyGrowthTriggers(
  triggers: ReadonlyArray<GrowthTrigger>,
  narrative: string,
  options: VerifyGrowthTriggersOptions = {},
): GrowthTriggerVerification {
  const verified = new Set<string>()
  const rejected: GrowthTriggerVerification['rejected'] = []
  if (triggers.length === 0) return { verified, rejected }
  const blocks = blocksOf(normalizeEvidenceText(narrative)).map((block) => ({
    projected: projectForMatch(block),
    dialogue: dialogueSpans(block),
  }))
  for (const trigger of triggers) {
    const name = normalizeTriggerName(trigger.character)
    if (name === '') {
      rejected.push({ character: trigger.character, reason: 'empty_name' })
      continue
    }
    const quote = projectForMatch(
      normalizeEvidenceText(trigger.evidence).replace(BLOCK_SENTINEL, ' '),
    )
    const words = quote.split(' ').filter(Boolean)
    if (
      quote.length < GROWTH_TRIGGER_MIN_EVIDENCE_CHARS ||
      words.length < GROWTH_TRIGGER_MIN_EVIDENCE_WORDS
    ) {
      rejected.push({ character: trigger.character, reason: 'too_short' })
      continue
    }
    const herTokens = nameTokensOf(trigger.character)
    const namesHer = words.some((w) => herTokens.includes(w))
    if (!namesHer && !words.some((w) => FEMALE_REFERENCE.has(w))) {
      rejected.push({ character: trigger.character, reason: 'not_about_her' })
      continue
    }
    if (
      !namesHer &&
      (options.cast ?? []).some(
        (other) =>
          normalizeTriggerName(other) !== name &&
          nameTokensOf(other).some((t) => !herTokens.includes(t) && words.includes(t)),
      )
    ) {
      rejected.push({ character: trigger.character, reason: 'names_another' })
      continue
    }
    const block = blocks.find((b) => containsPhrase(b.projected, quote))
    if (!block) {
      rejected.push({ character: trigger.character, reason: 'not_on_page' })
      continue
    }
    if (block.dialogue.some((span) => containsPhrase(span, quote))) {
      rejected.push({ character: trigger.character, reason: 'dialogue_only' })
      continue
    }
    verified.add(name)
  }
  return { verified, rejected }
}
