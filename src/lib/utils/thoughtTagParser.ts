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
const THOUGHT_TAG_REGEX = /<thought\b([^>]*)>([\s\S]*?)<\/thought>/gi
/** An opening tag left dangling with no close (streaming tail, malformed output). */
const DANGLING_THOUGHT_REGEX = /<thought\b[^>]*>[\s\S]*$/i
/** A half-written opening tag at the very end of a stream. */
const PARTIAL_THOUGHT_REGEX = /<thought\b[^>]*$/i

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

    const who = (matchAttribute(match[1] ?? '', 'who') ?? '').trim()
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
 * Remove every `<thought>` tag — well-formed, `who`-less, or left dangling by a
 * truncated stream — from content.
 *
 * @param content - Narrative content that may carry `<thought>` tags
 * @returns The content with all inner-voice markup removed
 */
export function stripThoughtTags(content: string): string {
  return content
    .replace(new RegExp(THOUGHT_TAG_REGEX.source, 'gi'), '')
    .replace(DANGLING_THOUGHT_REGEX, '')
    .replace(PARTIAL_THOUGHT_REGEX, '')
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
  // Case-insensitive "last index of <thought".
  const opens = content.matchAll(/<thought\b/gi)
  let lastOpen = -1
  for (const open of opens) lastOpen = open.index

  if (lastOpen === -1) {
    return { incomplete: false, safeEnd: content.length }
  }

  const afterOpen = content.slice(lastOpen)
  if (/<\/thought>/i.test(afterOpen)) {
    return { incomplete: false, safeEnd: content.length }
  }

  return { incomplete: true, safeEnd: lastOpen }
}
