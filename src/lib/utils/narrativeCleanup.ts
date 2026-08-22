/**
 * Narrative output cleanup shared by every seam that stores, streams or renders
 * a narration (research/66 follow-up, live 2026-08-22 21:52Z): the narrator
 * wrapped a whole visual-prose response in a markdown fence (```html … ```),
 * which then rendered literally. Template pleading loses to model variance —
 * strip it deterministically, at store time AND at render time (so already
 * stored turns heal too).
 */

/** A fence opener at the very start: ``` optionally followed by a language word and a newline. */
const LEADING_FENCE = /^\s*```[a-zA-Z0-9_-]*[ \t]*\r?\n/
/** A fence closer at the very end: newline(s) + ``` + optional whitespace. */
const TRAILING_FENCE = /\r?\n[ \t]*```[ \t]*\s*$/

/**
 * Remove a markdown code fence that wraps the WHOLE response. Inner fences
 * (a real code block inside prose) are untouched; a response that only
 * starts with a fence (stream cut mid-way) loses the opener only.
 */
export function stripMarkdownFence(content: string): string {
  if (!content || !LEADING_FENCE.test(content)) return content
  let out = content.replace(LEADING_FENCE, '')
  if (TRAILING_FENCE.test(out)) out = out.replace(TRAILING_FENCE, '')
  return out
}

/** Streaming variant: the opener can only be judged once its line has fully arrived. */
export function stripLeadingFenceIfComplete(content: string): {
  content: string
  /** False while the buffer could still be an unfinished fence line ("``", "```ht"). */
  settled: boolean
} {
  const head = content.replace(/^\s+/, '')
  if (head === '') return { content, settled: false }
  if (!head.startsWith('`')) return { content, settled: true }
  if (LEADING_FENCE.test(content))
    return { content: content.replace(LEADING_FENCE, ''), settled: true }
  // Starts with backticks but no newline yet: could still become a fence line.
  if (!/\n/.test(head) && head.length < 16 && /^`{1,3}[a-zA-Z0-9_-]*$/.test(head)) {
    return { content, settled: false }
  }
  return { content, settled: true }
}
