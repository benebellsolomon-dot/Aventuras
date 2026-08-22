/**
 * NPC inner-voice tag parser (E6, research/65).
 *
 * When the `npcThoughts` story setting is on, the narrator may close a response
 * with up to three `<thought who="Name">…</thought>` tags carrying a named NPC's
 * raw private monologue. The tags live in the stored entry content exactly like
 * `<pic>` tags do: every consumption surface strips them, and only the reader's
 * "Inner voices" panel renders them.
 *
 * Deliberately NOT engine state — a thought is never read back into any reducer.
 */

import { matchAttribute } from './inlineImageParser'

/** Maximum inner voices rendered for one entry. */
export const THOUGHT_MAX_PER_TURN = 3
/** Maximum length of the `who` attribute. */
export const THOUGHT_WHO_MAX = 60
/** Maximum length of the monologue text. */
export const THOUGHT_TEXT_MAX = 600

/** One parsed inner voice. Plain text — callers escape before rendering. */
export interface ParsedThoughtTag {
  /** Character the thought belongs to. */
  who: string
  /** The monologue itself. */
  text: string
}

/** Paired `<thought …>…</thought>`, any case, attributes optional. */
const THOUGHT_TAG_REGEX = /<thought\b([^>]*)>([\s\S]*?)<\/\s*thought\b[^>]*>/gi
/** Close tag, tolerant of whitespace and stray attributes (`</thought >`, `</thought foo>`). */
const THOUGHT_CLOSE_REGEX = /<\/\s*thought\b[^>]*>/i
/** An opening tag that carries a `who=` — the only shape the engine treats as a thought (a literal "<thought for later>" is prose). */
const THOUGHT_OPEN_WHO_REGEX = /<thought\b[^>]*\bwho\s*=[^>]*>/gi
/** A half-written opening tag at the very end of a stream. */
const PARTIAL_THOUGHT_REGEX = /<thought\b[^>]*$/i
/** A dangling OPEN tag (with `who=`, no close after it) is stripped only when
 * it sits in the tail — within one monologue's length of the end — i.e. a
 * cut-off thought, not prose after it. Measured from the LAST such open. */
const DANGLING_TAIL_WINDOW = THOUGHT_TEXT_MAX + 80

/** Index of the last `<thought … who=…>` open with no close after it, or -1. */
function lastDanglingOpen(content: string): number {
  let last = -1
  for (const open of content.matchAll(THOUGHT_OPEN_WHO_REGEX)) {
    if (!THOUGHT_CLOSE_REGEX.test(content.slice(open.index + open[0].length))) last = open.index
  }
  return last
}

/** `<t`, `<th`, … `<though` at the very end of a chunk (review finding 9). */
const TRAILING_PREFIX_REGEX = /<(?:t|th|tho|thou|thoug|though)$/i

/**
 * Extract the inner voices from an entry's content.
 *
 * Tags without a usable `who` are dropped (they are still stripped from prose).
 * `who` and `text` are trimmed and truncated to their caps, and at most
 * {@link THOUGHT_MAX_PER_TURN} tags are returned.
 *
 * @param content - Narrative content that may carry `<thought>` tags
 * @returns The parsed inner voices in document order
 */
export function extractThoughtTags(content: string): ParsedThoughtTag[] {
  const thoughts: ParsedThoughtTag[] = []
  const regex = new RegExp(THOUGHT_TAG_REGEX.source, 'gi')

  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (thoughts.length >= THOUGHT_MAX_PER_TURN) break

    const attrs = match[1] ?? ''
    // Quoted first (the documented form); an unquoted `who=Mira` is tolerated
    // rather than silently dropping the thought (review finding 13).
    const who = (
      matchAttribute(attrs, 'who') ??
      /\bwho\s*=\s*([^\s>"']+)/i.exec(attrs)?.[1] ??
      ''
    ).trim()
    const text = (match[2] ?? '').trim()
    if (!who || !text) continue

    thoughts.push({
      who: who.slice(0, THOUGHT_WHO_MAX),
      text: text.slice(0, THOUGHT_TEXT_MAX),
    })
  }

  return thoughts
}

/**
 * Remove every `<thought>` tag — well-formed or `who`-less — plus a half-written
 * opening tag at the very end of a stream. An UNCLOSED tag mid-content is
 * deliberately left alone: the first cut swallowed everything after it, which
 * truncated prose, narrator history and classifier input on one malformed
 * close tag (review finding 1). Streaming hold-back is `hasIncompleteThoughtTag`'s job.
 *
 * @param content - Narrative content that may carry `<thought>` tags
 * @returns The content with all inner-voice markup removed
 */
export function stripThoughtTags(content: string): string {
  return content
    .replace(new RegExp(THOUGHT_TAG_REGEX.source, 'gi'), '')
    .replace(PARTIAL_THOUGHT_REGEX, '')
    .replace(TRAILING_PREFIX_REGEX, '')
    .replace(/^[\s\S]*$/, (whole) => {
      const open = lastDanglingOpen(whole)
      return open !== -1 && whole.length - open <= DANGLING_TAIL_WINDOW
        ? whole.slice(0, open)
        : whole
    })
}

/**
 * Does the content carry at least one complete `<thought>` tag?
 *
 * @param content - The content to check
 * @returns True when a paired thought tag is present
 */
export function hasThoughtTags(content: string): boolean {
  return new RegExp(THOUGHT_TAG_REGEX.source, 'i').test(content)
}

/**
 * Streaming safety, mirroring `hasIncompletePicTag`: report whether the tail of
 * the buffer holds an unclosed `<thought` so a half-written tag never flashes in
 * the reader.
 *
 * @param content - The streamed content so far
 * @returns Whether a tag is mid-flight, and the last index safe to render
 */
export function hasIncompleteThoughtTag(content: string): {
  incomplete: boolean
  safeEnd: number
} {
  // Only a `who=` open counts (same shape rule as the strip path — a literal
  // "<thought for later>" in prose must never wedge the stream), and an open
  // older than one monologue's length is treated as resolved so a malformed
  // tag can never hold the whole rest of a response back (fix-diff F1).
  const open = lastDanglingOpen(content)
  if (open !== -1 && content.length - open <= DANGLING_TAIL_WINDOW) {
    return { incomplete: true, safeEnd: open }
  }
  const prefix = TRAILING_PREFIX_REGEX.exec(content) ?? PARTIAL_THOUGHT_REGEX.exec(content)
  return prefix
    ? { incomplete: true, safeEnd: prefix.index }
    : { incomplete: false, safeEnd: content.length }
}

/** The slice of a character the inner-voice resolver needs. */
export interface InnerVoiceCastMember {
  name: string
  relationship: string | null
}

/**
 * Inner voices ready for a panel: parsed straight off the stored content (like
 * `<pic>` tags — nothing is persisted separately), the protagonist's dropped
 * (the prompt forbids it; the filter enforces it), every other `who` rendered —
 * with the canonical cast name when known, the raw name otherwise (a character
 * the classifier missed must not make the monologue vanish, research/65 F11).
 * Shared by the feed entry panel and the VN reader.
 */
export function resolveInnerVoices(
  content: string,
  cast: ReadonlyArray<InnerVoiceCastMember>,
): ParsedThoughtTag[] {
  const canonical = new Map<string, string>()
  const selfNames = new Set<string>()
  for (const member of cast) {
    const key = member.name.trim().toLowerCase()
    if (member.relationship === 'self') selfNames.add(key)
    else canonical.set(key, member.name)
  }
  return extractThoughtTags(content).flatMap((voice) => {
    const key = voice.who.trim().toLowerCase()
    if (selfNames.has(key)) return []
    return [{ ...voice, who: canonical.get(key) ?? voice.who }]
  })
}
