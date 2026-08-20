/**
 * Booru-dialect tag-string normalization (research/56 attention-window fix).
 *
 * SDXL booru finetunes (Illustrious / Pony / NoobAI) read the prompt through
 * CLIP, which attends most strongly to the first ~75 tokens. A measured failure:
 * a two-character bed scene rendered as a standing hallway shirt-lift with the
 * second subject as a background bystander, because the pose/interaction and
 * setting tags sat behind two long per-character clauses and never reached the
 * model's attention.
 *
 * Two shapes pushed the scene out of that window, and both are normalized here:
 *
 * 1. Pseudo-regional clauses — `(on the left, 1girl, blonde hair, …)`. Booru
 *    models have NO regional prompter; the parens are just a 1.1x emphasis on a
 *    comma glob, and the glob itself is what displaces the scene. Flattened to
 *    plain comma runs (`(tag:1.2)` weighting groups survive untouched).
 * 2. The engine's PROSE state cues — "breasts subtly swollen with Milk, skin
 *    gently taut". Booru models know none of that vocabulary, so it burns ~10
 *    tokens for nothing. Compressed to the real booru tags that carry the same
 *    signal (`lactation`, `breast expansion`, `blush`).
 *
 * The engine's own computation is untouched — this is a RENDERING layer for the
 * booru dialect only; the prose dialect keeps the engine's phrasing verbatim.
 */

/** Split a tag run into trimmed, non-empty tags (parenthesized globs flattened). */
export function toTags(text: string | null | undefined): string[] {
  return flattenTagGroups(text ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/** Re-join a tag list into a canonical `a, b, c` run. */
export function joinTags(tags: ReadonlyArray<string>): string {
  return tags.join(', ')
}

/**
 * Drop the parentheses around multi-tag globs, keeping their tags inline.
 *
 * Preserved deliberately:
 * - `(tag:1.2)` — real A1111 weighting on a single tag.
 * - `(tag)` — a single-tag 1.1x emphasis, which is a legitimate booru idiom.
 * - `\(…\)` — escaped parens, which are part of danbooru tag names
 *   (`hatsune miku \(append\)`).
 *
 * A weighted glob (`(on the left, 1girl:1.2)`) loses the now-meaningless weight
 * suffix along with its parens.
 */
export function flattenTagGroups(prompt: string): string {
  const flattened = prompt.replace(/(?<!\\)\(([^()]*)(?<!\\)\)/g, (match, inner: string) => {
    if (!inner.includes(',')) return match
    return inner.replace(/:\s*\d+(?:\.\d+)?\s*$/, '').trim()
  })
  return joinTags(
    flattened
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  )
}

/**
 * The engine's prose cue vocabulary → booru tags the model actually knows.
 * Ordered most-specific first; the first match wins for a given cue.
 */
const BOORU_CUE_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/breast expansion|breasts (?:rapidly )?expanding|breasts growing larger/i, 'breast expansion'],
  [/hugely engorged|visibly leaking|stretched shiny-taut/i, 'lactation, leaking milk'],
  [/engorged|swollen with|gently taut|taut and heavy/i, 'lactation'],
  [/flushed|aroused/i, 'blush, heavy breathing'],
]

/**
 * Render the engine's image state cues in booru dialect: each prose cue maps to
 * the booru tags carrying the same signal, lowercased (the engine interpolates
 * the fluid type verbatim, so "Milk" arrives capitalized) and de-duplicated. An
 * unrecognized cue — the engine gained vocabulary this table has not learned —
 * passes through lowercased rather than being silently dropped.
 */
export function compressStateCues(cues: ReadonlyArray<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const cue of cues) {
    const mapped = BOORU_CUE_TAGS.find(([pattern]) => pattern.test(cue))?.[1] ?? cue
    for (const tag of toTags(mapped.toLowerCase())) {
      if (seen.has(tag)) continue
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}
