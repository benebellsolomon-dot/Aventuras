/**
 * Inline Image Parser
 *
 * Parses and extracts <pic> tags from narrative content for inline image generation.
 * Similar to the st-image-auto-generation SillyTavern plugin approach.
 */

import {
  effectiveBeatRating,
  parseBeatRating,
  ratingFromPromptPrefix,
} from '$lib/services/ai/image/ratingRouting'

export interface ParsedPicTag {
  /** Full original tag text */
  originalTag: string
  /** Start position in content */
  startIndex: number
  /** End position in content */
  endIndex: number
  /** Image generation prompt */
  prompt: string
  /** Character names for portrait reference */
  characters: string[]
  /**
   * Beat content rating: the tag's `rating` attribute (or a booru rating tag
   * opening the prompt), upgraded by the prompt text's own explicit vocabulary.
   * Drives explicit-beat image routing.
   */
  rating: 'general' | 'sensitive' | 'explicit' | null
}

/**
 * Match a quoted attribute value inside a tag's attribute string.
 * Honors the opening quote style, so the other quote character may appear
 * inside the value (e.g. prompt="a man's chest" or prompt='she said "now"').
 *
 * @param attrs - The raw attribute section of a tag
 * @param name - The attribute name to extract
 * @returns The attribute value, or null if the attribute is absent
 */
export function matchAttribute(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match ? (match[1] ?? match[2] ?? '') : null
}

/**
 * Extract all <pic> tags from content.
 * Supports both self-closing (<pic ... />) and paired tags (<pic ...></pic>).
 *
 * @param content - The narrative content to parse
 * @returns Array of parsed pic tags with their positions and attributes
 */
export function extractPicTags(content: string): ParsedPicTag[] {
  const tags: ParsedPicTag[] = []

  // Match <pic ... /> or <pic ...></pic>
  // Handles multiline prompts and various attribute orders
  // Captures: full match, attributes section
  const regex = /<pic\s+([^>]*?)(?:\/>|>\s*<\/pic>)/gi

  let match
  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0]
    const attributes = match[1]

    // Extract prompt attribute (required)
    const prompt = matchAttribute(attributes, 'prompt') ?? ''

    // Extract characters attribute (optional)
    const characters = (matchAttribute(attributes, 'characters') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c)

    // Declared rating (attribute, else a booru rating tag opening the prompt),
    // upgraded by the prompt's own wording when the narrator omitted or
    // under-set it (routing fallback, research/64 option B).
    const declared =
      parseBeatRating(matchAttribute(attributes, 'rating')) ?? ratingFromPromptPrefix(prompt)
    const rating = effectiveBeatRating(declared, prompt)

    // Only include tags with valid prompts
    if (prompt && prompt.length >= 10) {
      tags.push({
        originalTag: fullMatch,
        startIndex: match.index,
        endIndex: match.index + fullMatch.length,
        prompt,
        characters,
        rating,
      })
    }
  }

  return tags
}

/**
 * Check if content contains incomplete <pic tags (for streaming buffer).
 * Used to determine safe render points during streaming.
 *
 * @param content - The content to check
 * @returns Object with incomplete flag and safe end position
 */
export function hasIncompletePicTag(content: string): { incomplete: boolean; safeEnd: number } {
  const lastPicOpen = content.lastIndexOf('<pic')

  if (lastPicOpen === -1) {
    return { incomplete: false, safeEnd: content.length }
  }

  // Check if there's a closing after the last open
  const afterOpen = content.slice(lastPicOpen)
  const hasClose = afterOpen.includes('/>') || afterOpen.includes('</pic>')

  if (hasClose) {
    return { incomplete: false, safeEnd: content.length }
  }

  return { incomplete: true, safeEnd: lastPicOpen }
}

/**
 * Escape HTML special characters for safe attribute values.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
// ─── Shared SVG fragments ───

const spinnerSvg = (extraClass = '') =>
  `<svg class="placeholder-spinner-svg ${extraClass}" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle></svg>`

const imageIconSvg = `<svg class="placeholder-image-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`

const errorIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`

const retryButton = (imageId: string) =>
  `<button class="inline-image-btn retry-btn" data-action="regenerate" data-image-id="${imageId}" title="Retry generation"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> Retry</button>`

// ─── Shared placeholder builder ───

function buildPlaceholder(
  status: 'generating' | 'failed' | 'pending',
  imageId: string,
  prompt: string,
  innerContent: string,
): string {
  const shimmer = status !== 'failed' ? '<div class="placeholder-shimmer"></div>' : ''
  return `<div class="inline-image-placeholder ${status}" data-image-id="${imageId}" data-prompt="${escapeHtml(prompt)}">
    ${shimmer}
    <div class="placeholder-content">${innerContent}</div>
  </div>`
}

function loaderWithInfo(statusText: string, shortPrompt: string, spinnerClass = ''): string {
  return `<div class="placeholder-loader">${spinnerSvg(spinnerClass)}${imageIconSvg}</div>
    <div class="placeholder-info">
      <span class="placeholder-status">${statusText}</span>
      <span class="placeholder-prompt">${escapeHtml(shortPrompt)}</span>
    </div>`
}

function errorWithInfo(errorMsg: string, shortPrompt: string, imageId: string): string {
  return `<div class="placeholder-error-icon">${errorIconSvg}</div>
    <div class="placeholder-info">
      <span class="placeholder-status error">${escapeHtml(errorMsg)}</span>
      <span class="placeholder-prompt">${escapeHtml(shortPrompt)}</span>
    </div>
    ${retryButton(imageId)}`
}

// ─── Completed image renderers ───

function renderCompleteImage(imageId: string, prompt: string, imageData: string): string {
  return `<div class="inline-generated-image" data-image-id="${imageId}" data-prompt="${escapeHtml(prompt)}" data-action="view" role="button" tabindex="0"><img src="data:image/png;base64,${imageData}" alt="${escapeHtml(prompt)}" loading="lazy" /></div>`
}

function renderRegeneratingImage(imageId: string, prompt: string, imageData: string): string {
  return `<div class="inline-generated-image regenerating" data-image-id="${imageId}" data-prompt="${escapeHtml(prompt)}">
    <img src="data:image/png;base64,${imageData}" alt="${escapeHtml(prompt)}" loading="lazy" class="regenerating-image" />
    <div class="regenerating-overlay">
      <div class="regenerating-content">
        <svg class="regenerating-spinner" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle></svg>
        <span class="regenerating-text">Regenerating...</span>
      </div>
    </div>
  </div>`
}

/**
 * Render HTML for a single <pic> tag match.
 * Handles all image states: complete, regenerating, generating, failed, pending, unknown.
 *
 * @param match - The full <pic> tag match string
 * @param imageMap - Map of original tag text to image info
 * @param regeneratingIds - Optional set of image IDs currently being regenerated
 * @returns HTML string for the image (or empty string if no image record found)
 */
export function renderSinglePicTag(
  match: string,
  imageMap: Map<string, ImageReplacementInfo>,
  regeneratingIds?: Set<string>,
): string {
  const attrMatch = match.match(/<pic\s+([^>]*?)(?:\/>|>\s*<\/pic>)/i)
  const attrs = attrMatch ? attrMatch[1] : ''
  const prompt = matchAttribute(attrs, 'prompt') ?? ''
  const shortPrompt = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt

  const imageInfo = imageMap.get(match)
  if (!imageInfo) return ''

  if (imageInfo.status === 'complete' && imageInfo.imageData) {
    return (regeneratingIds?.has(imageInfo.id) ?? false)
      ? renderRegeneratingImage(imageInfo.id, prompt, imageInfo.imageData)
      : renderCompleteImage(imageInfo.id, prompt, imageInfo.imageData)
  }

  if (imageInfo.status === 'generating') {
    return buildPlaceholder(
      'generating',
      imageInfo.id,
      prompt,
      loaderWithInfo('Generating image...', shortPrompt),
    )
  }

  if (imageInfo.status === 'failed') {
    const errorMsg = imageInfo.errorMessage || 'Generation failed'
    return buildPlaceholder(
      'failed',
      imageInfo.id,
      prompt,
      errorWithInfo(errorMsg, shortPrompt, imageInfo.id),
    )
  }

  // Pending
  return buildPlaceholder(
    'pending',
    imageInfo.id,
    prompt,
    loaderWithInfo('In queue...', shortPrompt, 'pending'),
  )
}

/**
 * Replace <pic> tags with loading placeholders during streaming.
 * Shows a visual placeholder while images are being generated.
 *
 * @param content - The content with <pic> tags
 * @returns Content with placeholders instead of <pic> tags
 */
export function replacePicTagsWithPlaceholders(content: string): string {
  return content.replace(/<pic\s+([^>]*?)(?:\/>|>\s*<\/pic>)/gi, (match, attrs) => {
    const prompt = matchAttribute(attrs, 'prompt') || 'Image'
    const shortPrompt = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt
    // No imageId during streaming — use empty string
    return buildPlaceholder(
      'generating',
      '',
      prompt,
      loaderWithInfo('Generating image...', shortPrompt),
    )
  })
}

/**
 * Image info for replacement mapping.
 */
export interface ImageReplacementInfo {
  imageData: string
  status: 'pending' | 'generating' | 'complete' | 'failed'
  id: string
  errorMessage?: string
}

/**
 * Replace <pic> tags with actual images or status placeholders.
 * Uses a map keyed by original tag text to match images to their tags.
 *
 * @param content - The content with <pic> tags
 * @param imageMap - Map of original tag text to image info
 * @param regeneratingIds - Optional set of image IDs currently being regenerated
 * @returns Content with images or placeholders instead of <pic> tags
 */
export function replacePicTagsWithImages(
  content: string,
  imageMap: Map<string, ImageReplacementInfo>,
  regeneratingIds?: Set<string>,
): string {
  return content.replace(/<pic\s+([^>]*?)(?:\/>|>\s*<\/pic>)/gi, (match) => {
    return renderSinglePicTag(match, imageMap, regeneratingIds)
  })
}

/**
 * Count the number of <pic> tags in content.
 * Useful for quick checks without full parsing.
 *
 * @param content - The content to check
 * @returns Number of <pic> tags found
 */
export function countPicTags(content: string): number {
  const regex = /<pic\s+[^>]*?(?:\/>|>\s*<\/pic>)/gi
  const matches = content.match(regex)
  return matches ? matches.length : 0
}

/**
 * Check if content contains any <pic> tags.
 *
 * @param content - The content to check
 * @returns True if at least one <pic> tag is found
 */
export function hasPicTags(content: string): boolean {
  return /<pic\s+[^>]*?(?:\/>|>\s*<\/pic>)/i.test(content)
}

/**
 * Strip all <pic> tags from content, leaving just the text.
 * Useful for word count or plain text extraction.
 *
 * @param content - The content with <pic> tags
 * @returns Content without <pic> tags
 */
export function stripPicTags(content: string): string {
  return content.replace(/<pic\s+[^>]*?(?:\/>|>\s*<\/pic>)/gi, '')
}
