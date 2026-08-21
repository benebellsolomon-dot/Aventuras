/**
 * Narrative Service
 *
 * The core service that generates story responses.
 * This is the heart of the application - it handles narrative generation
 * both streaming and non-streaming.
 *
 * Unlike other services that use the preset system, NarrativeService uses
 * the main narrative profile directly (apiSettings.defaultModel, temperature, maxTokens).
 *
 * Uses ContextBuilder for prompt generation through the unified Liquid template pipeline.
 */

import { streamNarrative, generateNarrative } from '../sdk/generate'
import { ContextBuilder, responseLengthGuidance } from '$lib/services/context'
import { getContentGuidelines } from './contentGuidelines'
import { StyleReviewerService } from './StyleReviewerService'
import { templateEngine } from '$lib/services/templates/engine'
import { createLogger } from '$lib/log'
import { stripPicTags } from '$lib/utils/inlineImageParser'
import { settings } from '$lib/stores/settings.svelte'
import { detectPromptDialect } from '../image/dialect'
import {
  apparentTier,
  bandWord,
  cupLetter,
  imageSizeAnchor,
  imageStateCues,
  readBodyState,
} from '$lib/services/be'
import type { StreamChunk } from '../core/types'
import type {
  Story,
  StoryEntry,
  Entry,
  Character,
  Location,
  Item,
  StoryBeat,
  Chapter,
  TimeTracker,
} from '$lib/types'
import type { StyleReviewResult } from './StyleReviewerService'
import type { TimelineFillResult } from '../retrieval/TimelineFillService'
import { buildCheckResultBlock, type CheckRecord } from '$lib/services/rpg'

const log = createLogger('Narrative')

/**
 * Full instruction text for inline image generation via <pic> tags — PROSE
 * dialect (LLM-class text encoders: Krea, Flux, plain SDXL).
 * Injected into ContextBuilder when inlineImageMode is enabled on a story.
 * Templates reference this via {{ inlineImageInstructions }}.
 */
const INLINE_IMAGE_INSTRUCTIONS_PROSE = `<InlineImages>
You can embed images directly in your narrative using the <pic> tag. Images will be generated automatically where you place these tags.

**TAG FORMAT:**
<pic prompt="[detailed visual description]" characters="[character names]"></pic>

**ATTRIBUTES:**
- \`prompt\` (REQUIRED): A detailed visual description for image generation. Write as a complete scene description, NOT a reference to the text. **MUST ALWAYS BE IN ENGLISH** regardless of the narrative language.
- \`characters\` (optional): Comma-separated names of characters appearing in the image (for portrait reference).

**USAGE GUIDELINES:**
- Place <pic> tags AFTER the prose that describes the scene they illustrate
- Write prompts as vivid natural-language visual descriptions (the image backend uses an LLM-class text encoder — flowing descriptive English works best)
- Include character names in the "characters" attribute if they appear in the image
- CADENCE: include ONE <pic> tag in every response as a rule — illustrate the most visually notable moment, even in quiet scenes (a look, a location, a small gesture all qualify). Use 2-3 only for major set-pieces. Omit the tag only when the response contains nothing visual at all (pure abstract exposition). The detailed build order below is NOT a reason to skip an image — a routine moment still gets its full prompt

**PROMPT BUILD ORDER — every prompt follows these sections in this EXACT order. Do NOT rearrange or skip sections:**

SECTION 1 — Rating: the prompt's first words are always a content rating (see RATING AND BODY WORDS below).

SECTION 2 — Camera & framing: establish shot type and angle before describing anything else. Pick a shot type — wide shot / medium shot / close-up / over-the-shoulder — and add an angle when it strengthens the moment: low angle (imposing, heroic), high angle (vulnerability), dutch angle (tension, action), bird's-eye view (spatial overview). Match the camera to the emotional tone: action wants low or dutch angles, intimate or tense conversation wants close-ups, new locations and group scenes want wide shots.

SECTION 3 — Character count: a count phrase naming who is in frame — "one woman", "two women", "a man and a woman".

SECTION 4 — Characters: re-describe each character's physical appearance IN FULL in every prompt — the image model cannot see the story, previous images, or other prompts. Every character description must cover: age bracket (young woman, mature woman...), race/species if not human, skin tone, eye color, hair length/style/color, breast size band (females — see below), current clothing AND its state, facial expression, posture or action, and any held items.
  - MULTIPLE CHARACTERS (prevent feature-bleeding — this is where images fail): each person gets their OWN self-contained sentence with a spatial anchor ("on the left, ...", "on the right, ...", "behind her, ..."). Keep every trait inside its owner's sentence — never interleave two characters' traits, and never merge them into one shared description. Give each a distinguishing anchor (hair colour, outfit) so the model keeps them apart. Example: "two women — on the left, a tall mature woman with long wavy red hair, green eyes, and fair skin, wearing an emerald evening dress, smiling warmly; on the right, a petite young woman with a short black bob, dark eyes, and olive skin, in a rumpled white blouse, arms crossed, scowling"

SECTION 5 — Environment (always last): close every prompt with setting, time of day, lighting, and atmosphere in concrete visual terms — never stop at the characters. Name the light source and its quality: golden hour sunlight, volumetric light through windows, rim lighting, dramatic shadows, backlighting, soft overcast light, warm firelight, cold moonlight, neon glow. Add atmosphere details when they fit: dust motes, rain, mist, floating embers, depth of field.

**RATING AND BODY WORDS (required in every prompt):**
- The content rating opening SECTION 1 is one of: "general" (everyday scenes), "sensitive" (suggestive — cleavage, underwear, lingerie), or "explicit, uncensored, detailed anatomy" (nudity or sexual content)
- For every female character, ALWAYS state her current breast size using one of these bands, matching the story's canon: flat chest / small breasts / medium breasts / large breasts / huge breasts / gigantic breasts / hyper breasts — body-size continuity is critical
- Prefer concrete visual wording over abstractions: "torn apron, popped buttons, fabric straining across her chest" not "clothes in disarray"
- Do NOT add art-style words to prompts ("realistic art style", "anime style", "digital art", etc.) — the visual style is appended automatically and style words in the prompt contradict it

**EXAMPLES (note how every prompt walks the sections in order — rating, camera, count, characters, environment):**
The dragon descended from the storm clouds, its obsidian scales gleaming with each flash of lightning.
<pic prompt="general, wide shot from a dramatic low angle, a massive black dragon descending from dark storm clouds, wings fully spread, gleaming rain-wet obsidian scales, glowing amber eyes, jaws parted. Lightning splits the sky behind it, rain streaking through the frame, ruined battlements far below, dark oppressive storm atmosphere" characters=""></pic>

Elena drew her blade, firelight dancing along the steel edge as she faced the creature.
<pic prompt="sensitive, medium shot with a slight dutch angle, one woman, a young woman warrior with long braided red hair, green eyes, fair freckled skin, an athletic build and medium breasts, wearing fitted leather armor scuffed at the shoulder, jaw set in a determined expression, drawing a glowing sword in a low stance. Torch-lit medieval great hall behind her, warm firelight reflecting off the blade and her face, deep flickering shadows, embers drifting in the air" characters="Elena"></pic>

**CRITICAL RULES:**
- **PROMPTS MUST BE IN ENGLISH** - Image generation models only understand English prompts. Always write the prompt attribute in English, even if the surrounding narrative is in another language.
- The prompt must be a COMPLETE visual description - do not write "the dragon from the scene" or "as described above"
- Never place <pic> tags in the middle of a sentence - always after the descriptive prose
- Pick the single most striking moment of the response to illustrate: dramatic reveals, emotional peaks, action climaxes, new locations, character moments — or, failing those, the response's main visual beat
- Density target: a good prompt is DETAILED — roughly 400-700 characters for one character, 600-1000 for multiple characters. Never exceed 1200 characters
</InlineImages>`

/**
 * Full instruction text for inline image generation via <pic> tags — BOORU
 * dialect (anime tag models: Illustrious, Pony, NoobAI, ...). These models
 * follow comma-separated booru tags far more reliably than prose: count tags
 * control how many characters render, tag order controls emphasis.
 */
const INLINE_IMAGE_INSTRUCTIONS_BOORU = `<InlineImages>
You can embed images directly in your narrative using the <pic> tag. Images will be generated automatically where you place these tags. The image model is a booru-tag anime model: prompts are comma-separated Danbooru-style tags, NOT prose sentences.

**TAG FORMAT:**
<pic prompt="[comma-separated booru tags]" characters="[character names]"></pic>

**ATTRIBUTES:**
- \`prompt\` (REQUIRED): Comma-separated booru tags describing the full scene. **MUST ALWAYS BE IN ENGLISH** regardless of the narrative language.
- \`characters\` (optional): Comma-separated names of characters appearing in the image (for portrait reference).

**USAGE GUIDELINES:**
- Place <pic> tags AFTER the prose that describes the scene they illustrate
- CADENCE: include ONE <pic> tag in every response as a rule — illustrate the most visually notable moment, even in quiet scenes (a look, a location, a small gesture all qualify). Use 2-3 only for major set-pieces. Omit the tag only when the response contains nothing visual at all (pure abstract exposition). The detailed build order below is NOT a reason to skip an image — a routine moment still gets its full prompt

**PROMPT BUILD ORDER — every prompt follows these sections in this EXACT order. Do NOT rearrange or skip sections:**

SECTION 1 — Rating: the prompt's first words are always a content rating: "general" (everyday scenes), "sensitive" (suggestive — cleavage, underwear, lingerie), or "explicit, uncensored, detailed anatomy" (nudity or sexual content).

SECTION 2 — Camera: shot-type tags — wide shot / cowboy shot / upper body / close-up / portrait — plus an angle tag when it strengthens the moment: from below, from above, from behind, from side, dutch angle, pov. Match the camera to the emotional tone.

SECTION 3 — Character count: the booru count tag for exactly who is in frame — "1girl, solo", "2girls", "1boy, 1girl", "3girls". This tag CONTROLS how many people render — never omit it, never contradict it.

SECTION 4 — Characters:
  - SINGLE character: a flat comma-separated tag run covering age bracket (mature female, young woman...), race/species if not human, hair length/style/color, eye color, skin tone, body type, breast size band (females — see below), clothing tags AND their state (torn shirt, open jacket, straining buttons), facial expression tag, pose/action tags, held items.
  - MULTIPLE characters (prevent feature-bleeding — this is where images fail): do NOT merge everyone into one tag list. Each character gets their OWN short natural-language sentence with booru tags embedded and a spatial anchor. Format: "On the left, a [age/species tag] with [hair tags], [eye tags], [skin tag], wearing [clothing tags], [expression tag], [pose tag]." Keep every trait inside its owner's sentence.
- Re-describe each character IN FULL in every prompt — the image model cannot see the story, previous images, or other prompts.

SECTION 5 — Scene tags (always last): location tags (indoors, outdoors, bedroom, forest, castle interior, night city...), time-of-day tags (day, night, sunset, dawn), lighting tags (sunlight, golden hour, volumetric lighting, rim lighting, backlighting, dramatic shadow, moonlight, firelight, neon lights), atmosphere tags (rain, mist, dust particles, embers, depth of field, bokeh).

**RATING AND BODY WORDS (required in every prompt):**
- For every female character, ALWAYS state her current breast size using one of these bands, matching the story's canon: flat chest / small breasts / medium breasts / large breasts / huge breasts / gigantic breasts / hyper breasts — body-size continuity is critical
- Use concrete visual tags, not abstractions: "torn apron, popped buttons" not "clothes in disarray"
- Do NOT add art-style or quality tags ("masterpiece", "best quality", "anime style", "realistic") — quality tags are prepended automatically and duplicates hurt the result

**EXAMPLES (note the section order — rating, camera, count, characters, scene):**
The dragon descended from the storm clouds, its obsidian scales gleaming with each flash of lightning.
<pic prompt="general, wide shot, from below, no humans, dragon, black scales, glowing amber eyes, spread wings, open mouth, descending, storm clouds, lightning, rain, ruined castle, night, dark, dramatic shadow" characters=""></pic>

Elena drew her blade, firelight dancing along the steel edge as she faced the creature.
<pic prompt="sensitive, cowboy shot, dutch angle, 1girl, solo, young woman, long hair, braided ponytail, red hair, green eyes, fair skin, freckles, athletic build, medium breasts, leather armor, fingerless gloves, determined expression, clenched jaw, drawing sword, glowing sword, fighting stance, castle interior, great hall, night, firelight, torches, dramatic shadow, embers" characters="Elena"></pic>

The two women faced each other across the kitchen table, the argument hanging in the air between them.
<pic prompt="general, medium shot, 2girls. On the left, a tall mature woman with long wavy red hair, green eyes, fair skin, large breasts, wearing an emerald dress, angry expression, hands on hips. On the right, a petite young woman with short black bob, dark eyes, olive skin, small breasts, wearing a rumpled white blouse, scowling, arms crossed. kitchen, indoors, table, afternoon, window light, warm lighting" characters="Marta, Yuki"></pic>

**CRITICAL RULES:**
- **PROMPTS MUST BE IN ENGLISH** - Image generation models only understand English prompts.
- The prompt must be a COMPLETE scene description - never reference the story text
- Never place <pic> tags in the middle of a sentence - always after the descriptive prose
- Pick the single most striking moment of the response to illustrate
- Density target: 30-45 tags for a single character, more for multiple characters. Comma-separated tags ONLY except the per-character sentences in multi-character scenes
- Booru tags are for <pic> prompts ONLY — never let tag formatting leak into your narrative prose
</InlineImages>`

/**
 * Locked per-character identity tags (Kazuma-style): when a character has a
 * curated image-tag bank, the prompt-writing LLM copies it verbatim instead of
 * re-deriving appearance from prose — this is what keeps a character looking
 * like themselves across images.
 */
function buildCharacterIdentityTagBlock(characters: Character[]): string {
  const withTags = characters.filter((c) => (c.imageTags ?? '').trim().length > 0)
  if (withTags.length === 0) return ''
  const lines = withTags.map(
    (c) => `- ${c.name}: ${(c.imageTags ?? '').replace(/\s*\n+\s*/g, ', ').trim()}`,
  )
  return `
**CHARACTER IDENTITY TAGS (locked — copy verbatim):**
When any of these characters appears in a <pic> prompt, copy their tags into that prompt EXACTLY as written — never alter, paraphrase, or contradict them. Add clothing, expression, and pose on top. These tags are for <pic> prompts ONLY, never for narrative prose.
${lines.join('\n')}
`
}

/**
 * Current engine body-state per character — deterministic tier reinforcement
 * for the prompt writer. Without this the LLM guesses the band from story
 * memory; with it the exact current band/cup is stated per character, so the
 * grounding pass's replace branch fires on an already-correct word.
 */
function buildBodyStateReinforcementBlock(characters: Character[]): string {
  const lines = characters
    .map((c) => {
      const state = readBodyState(c.metadata)
      if (!state) return null
      // Apparent tier (research/49 R6): while she is engorged the IMAGE reads a
      // size larger. Prompt-facing only — her engine tier is untouched, and the
      // [BODY STATE] block still states her real letter.
      const renderTier = apparentTier(state)
      const parts = [`${bandWord(renderTier)} (${cupLetter(renderTier)}-cup)`]
      const anchor = imageSizeAnchor(renderTier)
      if (anchor) parts.push(anchor)
      parts.push(...imageStateCues(state))
      return `- ${c.name}: ${parts.join('; ')}`
    })
    .filter(Boolean)
  if (lines.length === 0) return ''
  return `
**CURRENT BODY STATE (canonical — overrides story memory):**
Use EXACTLY these size bands and state cues for these characters in every <pic> prompt — copy each listed phrase into any prompt depicting that character. The engine tracks growth; the line below is always current. Match clothing to the size: at large sizes clothes strain, gape, or fail — show it.
${lines.join('\n')}
`
}

/**
 * Current clothing per character — deterministic reinforcement so the LLM
 * states each present character's actual outfit instead of re-inventing one.
 * Current-state wins over baseline (research/55 component E precedence fix):
 * `currentVisualDescriptors` reflects torn/removed/changed clothing from
 * story events, while `visualDescriptors` is the stable baseline outfit.
 */
export function buildCurrentClothingReinforcementBlock(characters: Character[]): string {
  const lines = characters
    .map((c) => {
      const clothing = c.currentVisualDescriptors?.clothing ?? c.visualDescriptors?.clothing
      const trimmed = clothing?.trim()
      if (!trimmed) return null
      return `- ${c.name}: ${trimmed}`
    })
    .filter(Boolean)
  if (lines.length === 0) return ''
  return `
**CURRENT CLOTHING (canonical — overrides story memory):**
Depict each listed character wearing EXACTLY this outfit, in its current state (torn, open, removed, disheveled, etc. as described), in every <pic> prompt showing them. Match the fit to their current body size — at large sizes clothes strain, gape, or fail.
${lines.join('\n')}
`
}

/**
 * Current location — name + description, so the LLM includes concrete
 * setting tags/prose instead of guessing or omitting the scene entirely.
 */
export function buildCurrentLocationReinforcementBlock(
  location: Location | null | undefined,
): string {
  if (!location) return ''
  const description = location.description?.trim()
  const line = description ? `${location.name} — ${description}` : location.name
  if (!line.trim()) return ''
  return `
**CURRENT LOCATION (canonical — include in every <pic> prompt):**
The scene is set here unless the narrative clearly moved elsewhere. Reflect this setting with concrete visual/scene tags.
${line}
`
}

/**
 * Select the dialect-appropriate inline-image instructions and append the
 * locked identity tags + current body state + current clothing/location for
 * the characters and location in the scene.
 */
export function buildInlineImageInstructions(
  dialect: 'prose' | 'booru',
  characters: Character[],
  location?: Location | null,
): string {
  const base =
    dialect === 'booru' ? INLINE_IMAGE_INSTRUCTIONS_BOORU : INLINE_IMAGE_INSTRUCTIONS_PROSE
  const extras = `${buildCharacterIdentityTagBlock(characters)}${buildBodyStateReinforcementBlock(characters)}${buildCurrentClothingReinforcementBlock(characters)}${buildCurrentLocationReinforcementBlock(location)}`
  if (!extras) return base
  return base.replace('</InlineImages>', `${extras}</InlineImages>`)
}

/**
 * Full instruction text for visual prose mode (HTML/CSS formatting).
 * Injected into ContextBuilder when visualProseMode is enabled on a story.
 * Templates reference this via {{ visualProseInstructions }}.
 */
const VISUAL_PROSE_INSTRUCTIONS = `<VisualProse>
You are also a visual artist with HTML5 and CSS3 at your disposal. Your entire response must be valid HTML.

**OUTPUT FORMAT (CRITICAL):**
Your response must be FULLY STRUCTURED HTML:
- Wrap ALL prose paragraphs in \`<p>\` tags
- Use \`<span>\` with inline styles for colored/styled text (dialogue, emphasis, actions)
- Use \`<div>\` with \`<style>\` blocks for complex visual elements (menus, letters, signs, etc.)
- NO plain text outside of HTML tags - everything must be wrapped

Example structure:
\`\`\`html
<p>She stepped into the tavern, the smell of smoke and ale washing over her.</p>

<p><span style="color: #8B4513;">"Welcome, stranger,"</span> the bartender said, sliding a mug across the counter.</p>

<style>
.tavern-sign { background: #2a1810; padding: 15px; border: 3px solid #8B4513; }
.tavern-sign h2 { color: #d4a574; text-align: center; }
</style>
<div class="tavern-sign">
  <h2>The Rusty Anchor</h2>
  <p>Est. 1847</p>
</div>

<p>She studied the sign, then turned back to her drink.</p>
\`\`\`

**STYLING CAPABILITIES:**
- **Layouts:** CSS Grid, Flexbox, block/inline positioning
- **Styling:** Backgrounds, gradients, typography, borders, colors - themed by scene and genre
- **Interactivity:** :hover, :focus, :active states for subtle effects
- **Animation:** @keyframes for movement, rotation, fading, opacity changes
- **Variables:** CSS Custom Properties (--variable) for theming

**FORBIDDEN:**
- Plain text without HTML tags (NO raw paragraphs - use \`<p>\`)
- Markdown syntax (\`*asterisks*\`, \`**bold**\`) - use \`<em>\`, \`<strong>\`, or \`<span>\` with styles instead
- \`position: fixed/absolute\` - breaks the interface
- \`<script>\` tags - only HTML and CSS
- Box-shadow animation - use border-color, background-color, or opacity instead

**PRINCIPLES:**
- Purpose over flash - every visual choice serves the narrative
- Readability is paramount - never sacrifice text clarity for effects
- Seamless integration - visuals feel like part of the story

Create atmospheric layouts, styled dialogue, themed visual elements. Match visual style to genre and mood.
</VisualProse>`

/**
 * World state context for prompt building
 */
export interface WorldStateContext {
  characters: Character[]
  locations: Location[]
  items: Item[]
  storyBeats: StoryBeat[]
  currentLocation?: Location
  chapters?: Chapter[]
}

/**
 * World state context for narrative generation.
 * Extends the base WorldStateContext with lorebook entries.
 */
export interface NarrativeWorldState extends WorldStateContext {
  lorebookEntries?: Entry[]
}

/**
 * This turn's pending player action — the same "last user_action" the user
 * prompt renders as `## Current Action`. Empty string when there is none.
 */
export function lastUserActionText(entries: ReadonlyArray<StoryEntry>): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === 'user_action') return entries[i].content ?? ''
  }
  return ''
}

/**
 * Format a TimeTracker into a human-readable string for the narrative prompt.
 * Always returns a value, defaulting to Year 1, Day 1, 0 hours 0 minutes if null.
 */
export function formatStoryTime(time: TimeTracker | null | undefined): string {
  const t = time ?? { years: 0, days: 0, hours: 0, minutes: 0 }
  const year = t.years + 1
  const day = t.days + 1
  return `Year ${year}, Day ${day}, ${t.hours} hours ${t.minutes} minutes`
}

/**
 * Build a block containing chapter summaries for injection into the system prompt.
 * Per design doc: summarized entries are excluded from direct context,
 * but their summaries provide narrative continuity.
 */
export function buildChapterSummariesBlock(
  chapters: Chapter[],
  timelineFillResult?: TimelineFillResult | null,
): string {
  if (chapters.length === 0) return ''

  let block = '\n\n<story_history>\n'
  block += '## Previous Chapters\n'
  block +=
    'The following chapters have occurred earlier in the story. Use them for continuity and context.\n\n'

  for (const chapter of chapters) {
    block += `### Chapter ${chapter.number}`
    if (chapter.title) {
      block += `: ${chapter.title}`
    }
    block += '\n'

    const startTime = formatStoryTime(chapter.startTime)
    const endTime = formatStoryTime(chapter.endTime)
    if (startTime && endTime) {
      block += `*Time: ${startTime} \u2192 ${endTime}*\n`
    } else if (startTime) {
      block += `*Time: ${startTime}*\n`
    }

    block += chapter.summary
    block += '\n'

    const metadata: string[] = []
    if (chapter.characters.length > 0) {
      metadata.push(`Characters: ${chapter.characters.join(', ')}`)
    }
    if (chapter.locations.length > 0) {
      metadata.push(`Locations: ${chapter.locations.join(', ')}`)
    }
    if (chapter.emotionalTone) {
      metadata.push(`Tone: ${chapter.emotionalTone}`)
    }
    if (metadata.length > 0) {
      block += `*${metadata.join(' | ')}*\n`
    }
    block += '\n'
  }

  if (timelineFillResult && timelineFillResult.responses.length > 0) {
    block += '## Retrieved Context\n'
    block +=
      'The following information was retrieved from past chapters and is relevant to the current scene:\n\n'

    for (const response of timelineFillResult.responses) {
      const chapterLabel =
        response.chapterNumbers.length === 1
          ? `Chapter ${response.chapterNumbers[0]}`
          : `Chapters ${response.chapterNumbers.join(', ')}`

      block += `**${chapterLabel}**\n`
      block += `Q: ${response.query}\n`
      block += `A: ${response.answer}\n\n`
    }
  }

  block += '</story_history>'
  return block
}

/**
 * Options for narrative generation.
 */
export interface NarrativeOptions {
  /** Pre-built tiered context block for injection */
  tieredContextBlock?: string
  /** Style review results for avoiding repetition */
  styleReview?: StyleReviewResult | null
  /** Retrieved chapter context from memory system */
  retrievedChapterContext?: string | null
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Timeline fill result for Q&A injection */
  timelineFillResult?: TimelineFillResult | null
  /** Resolved RPG check for this turn — rendered as the immutable [CHECK
   * RESULT] block dead last in the user prompt (research/47 Step 6). */
  pendingCheck?: CheckRecord | null
}

/**
 * Service for generating narrative responses.
 *
 * This service uses the main narrative profile from apiSettings directly,
 * rather than going through the preset system. This ensures narrative
 * generation uses the user's primary model and settings.
 *
 * Prompt generation flows through ContextBuilder + Liquid templates.
 */
export class NarrativeService {
  /**
   * Create a new NarrativeService.
   * No preset required - uses main narrative profile from settings.
   */
  constructor() {
    // No configuration needed - uses main profile directly
  }

  /**
   * Stream a narrative response.
   *
   * This is the primary method used by the UI for real-time narrative generation.
   * Yields StreamChunk objects as text arrives from the model.
   */
  async *stream(
    entries: StoryEntry[],
    worldState: NarrativeWorldState,
    story?: Story | null,
    options: NarrativeOptions = {},
  ): AsyncIterable<StreamChunk> {
    const {
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      signal,
      timelineFillResult,
      pendingCheck,
    } = options

    log('stream', {
      entriesCount: entries.length,
      hasTieredContext: !!tieredContextBlock,
      hasStyleReview: !!styleReview,
      hasRetrievedContext: !!retrievedChapterContext,
      hasTimelineFill: !!timelineFillResult,
    })

    // Build system prompt via ContextBuilder pipeline
    const { systemPrompt, primingMessage, postHistoryBlock } = await this.buildPrompts(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      timelineFillResult,
      lastUserActionText(entries),
    )

    // Build the user prompt from entries
    const mode = story?.mode ?? 'adventure'
    const inlineImageMode = story?.settings?.imageGenerationMode === 'inline'
    const userPrompt = this.buildUserPrompt(
      entries,
      mode,
      inlineImageMode,
      postHistoryBlock,
      pendingCheck ?? null,
    )

    try {
      // Stream using the main narrative profile
      const stream = streamNarrative({
        system: systemPrompt,
        prompt: `${primingMessage}\n\n${userPrompt}`,
        signal,
      })

      // Use fullStream to capture both text and reasoning
      // - Native reasoning providers (Anthropic, OpenAI) emit reasoning-delta parts
      // - Models using <think> tags have reasoning extracted by extractReasoningMiddleware
      for await (const part of stream.fullStream) {
        if (part.type === 'reasoning-delta') {
          // Reasoning delta from native providers or extracted from <think> tags
          yield { content: '', reasoning: (part as { text?: string }).text, done: false }
        } else if (part.type === 'text-delta') {
          // Regular text content
          yield { content: (part as { text?: string }).text || '', done: false }
        }
        // Ignore other part types (reasoning-start, reasoning-end, tool calls, finish, etc.)
      }

      yield { content: '', done: true }
    } catch (error) {
      log('stream error', error)
      // Re-throw to let caller handle the error
      throw error
    }
  }

  /**
   * Generate a complete narrative response (non-streaming).
   *
   * Used for scenarios where streaming is not needed or supported.
   */
  async generate(
    entries: StoryEntry[],
    worldState: NarrativeWorldState,
    story?: Story | null,
    options: Omit<NarrativeOptions, 'timelineFillResult'> = {},
  ): Promise<string> {
    const { tieredContextBlock, styleReview, retrievedChapterContext, signal } = options

    log('generate', { entriesCount: entries.length })

    // Build system prompt via ContextBuilder pipeline
    const { systemPrompt, primingMessage, postHistoryBlock } = await this.buildPrompts(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      null,
      lastUserActionText(entries),
    )

    const mode = story?.mode ?? 'adventure'
    const inlineImageMode = story?.settings?.imageGenerationMode === 'inline'
    const userPrompt = this.buildUserPrompt(entries, mode, inlineImageMode, postHistoryBlock)

    return generateNarrative({
      system: systemPrompt,
      prompt: `${primingMessage}\n\n${userPrompt}`,
      signal,
    })
  }

  /**
   * Build system and priming prompts through the ContextBuilder pipeline.
   *
   * Creates a ContextBuilder from the story, adds runtime variables
   * (tiered context, chapter summaries, style guidance), then renders
   * through the Liquid template for the story's mode.
   */
  private async buildPrompts(
    story: Story | null | undefined,
    worldState: NarrativeWorldState,
    tieredContextBlock?: string,
    styleReview?: StyleReviewResult | null,
    retrievedChapterContext?: string | null,
    timelineFillResult?: TimelineFillResult | null,
    actionText: string = '',
  ): Promise<{ systemPrompt: string; primingMessage: string; postHistoryBlock: string }> {
    const mode = story?.mode ?? 'adventure'

    // Create ContextBuilder -- forStory auto-populates mode, pov, tense, genre,
    // protagonistName, protagonistDescription, currentLocation, storyTime, etc.
    let ctx: ContextBuilder

    if (story?.id) {
      // The pending action goes in so scene presence can pin a character the
      // player just addressed — the previous narration's presence list cannot
      // know she is back yet.
      ctx = await ContextBuilder.forStory(story.id, undefined, actionText)
    } else {
      // Fallback for edge cases where story doesn't exist yet
      ctx = new ContextBuilder()
      ctx.add({
        mode,
        pov: story?.settings?.pov ?? 'second',
        tense: story?.settings?.tense ?? 'present',
        protagonistName: 'the protagonist',
      })
    }

    // Prose style + length guidance are narrative-template-only, so they are
    // scoped here (like contentGuidelines) rather than in forStory — which
    // also covers the no-story fallback branch above.
    ctx.add({
      proseStyle: story?.settings?.proseStyle ?? 'cinematic',
      responseLengthGuidance: responseLengthGuidance(story?.settings?.responseLength, mode),
    })

    // Add runtime variables for template rendering
    // These are pre-formatted blocks that templates inject via {{ variable }}

    if (tieredContextBlock) {
      ctx.add({ tieredContextBlock })
    }

    if (retrievedChapterContext) {
      ctx.add({ retrievedChapterContext })
    }

    // Build chapter summaries block
    if (worldState.chapters && worldState.chapters.length > 0) {
      const chapterSummaries = buildChapterSummariesBlock(worldState.chapters, timelineFillResult)
      if (chapterSummaries) {
        ctx.add({ chapterSummaries })
      }
    }

    // Build style guidance block
    if (styleReview && styleReview.phrases.length > 0) {
      const styleGuidance = StyleReviewerService.formatForPromptInjection(styleReview)
      if (styleGuidance) {
        ctx.add({ styleGuidance })
      }
    }

    // Inject feature instruction content when modes are enabled
    // These provide the actual instructions (not just boolean flags) that templates reference
    // via {{ inlineImageInstructions }} and {{ visualProseInstructions }}
    const preRenderContext = ctx.getContext()
    if (preRenderContext.inlineImageMode) {
      const imageSettings = settings.systemServicesSettings.imageGeneration
      const imageModel = settings.getImageProfile(imageSettings.profileId ?? '')?.model ?? ''
      ctx.add({
        inlineImageInstructions: buildInlineImageInstructions(
          detectPromptDialect(imageModel),
          worldState.characters,
          worldState.currentLocation,
        ),
      })
    }
    if (preRenderContext.visualProseMode) {
      ctx.add({ visualProseInstructions: VISUAL_PROSE_INSTRUCTIONS })
    }

    // Content guidelines based on the story's content rating.
    // Always set (empty string for 'standard') so templates can safely test it.
    ctx.add({
      contentGuidelines: getContentGuidelines(
        story?.settings?.contentRating,
        story?.settings?.nsfwFlavor,
      ),
    })

    // Render system prompt — use per-story override when set, otherwise fall back to pack template
    let systemPrompt: string
    const customPrompt = story?.settings?.customSystemPrompt
    if (customPrompt) {
      const rendered = templateEngine.render(customPrompt, ctx.getContext())
      if (rendered === null) {
        throw new Error(
          'Custom system prompt contains a Liquid syntax error. Edit it in Story Settings.',
        )
      }
      systemPrompt = rendered
    } else {
      const templateId = mode === 'creative-writing' ? 'creative-writing' : 'adventure'
      const { system } = await ctx.render(templateId)
      systemPrompt = system
    }

    // Build priming message based on mode/pov/tense
    const context = ctx.getContext()
    const primingMessage = this.buildPrimingMessage(
      mode,
      (context.pov as string) ?? 'second',
      (context.tense as string) ?? 'present',
      (context.protagonistName as string) ?? 'the protagonist',
    )

    // Render post-history instructions (Liquid-enabled) for injection at the
    // tail of the user prompt — the strongest steering position, applied after
    // all story history and immediately before generation.
    let postHistoryBlock = ''
    const postHistoryRaw = story?.settings?.postHistoryInstructions?.trim()
    if (postHistoryRaw) {
      const rendered = templateEngine.render(postHistoryRaw, ctx.getContext())
      if (rendered === null) {
        log('ERROR: post-history instructions render failed, using raw content')
      }
      postHistoryBlock = rendered ?? postHistoryRaw
    }

    log('buildPrompts complete', {
      mode,
      usingCustomPrompt: !!customPrompt,
      systemPromptLength: systemPrompt.length,
      primingMessageLength: primingMessage.length,
      hasPostHistory: postHistoryBlock.length > 0,
    })

    return { systemPrompt, primingMessage, postHistoryBlock }
  }

  /**
   * Build the user prompt from recent story entries.
   *
   * Formats entries as a conversation history with the current action highlighted.
   */
  private buildUserPrompt(
    entries: StoryEntry[],
    mode: 'adventure' | 'creative-writing',
    inlineImageMode: boolean = false,
    postHistoryBlock: string = '',
    pendingCheck: CheckRecord | null = null,
  ): string {
    // Use all entries passed - these are already the visible (non-summarized) entries
    // Truncation/context management happens upstream via the memory system

    // Format entries based on mode
    const historyParts: string[] = []
    for (const entry of entries) {
      // Strip <pic> tags if not in inline mode to prevent AI from immitating them
      const content = inlineImageMode ? entry.content : stripPicTags(entry.content)

      if (entry.type === 'user_action') {
        const prefix = mode === 'creative-writing' ? '[DIRECTION]' : '[ACTION]'
        historyParts.push(`${prefix} ${content}`)
      } else if (entry.type === 'narration') {
        historyParts.push(`[NARRATIVE]\n${content}`)
      }
    }

    // Get the last user action as the current input
    const lastUserAction = [...entries].reverse().find((e) => e.type === 'user_action')
    const currentAction = lastUserAction
      ? inlineImageMode
        ? lastUserAction.content
        : stripPicTags(lastUserAction.content)
      : ''

    // Build final prompt
    let prompt = ''

    if (historyParts.length > 1) {
      // Include history minus the last action (which becomes current)
      prompt += '## Recent Story:\n'
      prompt += historyParts.slice(0, -1).join('\n\n')
      prompt += '\n\n'
    }

    prompt += '## Current Action:\n'
    prompt += currentAction
    prompt += '\n\n'

    if (postHistoryBlock) {
      prompt += `[Narrative Directives]\n${postHistoryBlock}\n\n`
    }

    // Resolved-check block goes DEAD LAST (research/47 Step 6): the volatile,
    // authority-dominant fact the narration must honor sits closest to
    // generation, after every stable/cacheable block.
    if (pendingCheck) {
      prompt += `${buildCheckResultBlock(pendingCheck)}\n\n`
    }

    prompt += 'Continue the narrative:'

    return prompt
  }

  /**
   * Build a priming user message to establish the narrator role.
   * This helps models that expect user-first conversation format.
   */
  private buildPrimingMessage(
    mode: string,
    pov: string,
    tense: string,
    protagonistName: string,
  ): string {
    if (mode === 'creative-writing') {
      return this.buildCreativeWritingPriming(pov, tense, protagonistName)
    }
    return this.buildAdventurePriming(pov, tense, protagonistName)
  }

  private buildAdventurePriming(pov: string, tense: string, protagonistName: string): string {
    const tenseWord = tense === 'past' ? 'past' : 'present'
    const actionExample =
      tense === 'past' ? 'pushed open the heavy door' : 'pushes open the heavy door'
    const descWords =
      tense === 'past'
        ? 'saw, heard, and experienced as I explored'
        : 'see, hear, and experience as I explore'

    if (pov === 'third') {
      return `You are the narrator of this interactive adventure. Write in ${tenseWord} tense, third person (they/the character name).

Your role:
- Describe ${protagonistName}'s experiences and the world around them
- Control all NPCs and the environment
- NEVER write ${protagonistName}'s dialogue, decisions, or inner thoughts - I decide those
- When I say "I do X", describe the results in third person (e.g., "I open the door" -> "${protagonistName} ${actionExample}...")

I am the player controlling ${protagonistName}. You narrate what happens. Begin when I take my first action.`
    }

    if (pov === 'hybrid') {
      return `You are the narrator of this interactive adventure. Write in ${tenseWord} tense, hybrid POV: narrate the world, NPCs, and ${protagonistName}'s outward actions in third person, but describe every physical sensation ${protagonistName} feels in second person ("you").

Your role:
- Describe scenes and characters in third person; when I say "I do X", show ${protagonistName} doing it (e.g., "I open the door" -> "${protagonistName} ${actionExample}...")
- Whenever something touches, hurts, warms, or otherwise affects my character's body, shift to "you" for the sensation itself
- Control all NPCs and the environment
- NEVER write ${protagonistName}'s dialogue, decisions, or inner thoughts - I decide those

I am the player controlling ${protagonistName}. You narrate what happens. Begin when I take my first action.`
    }

    return `You are the narrator of this interactive adventure. Write in ${tenseWord} tense, second person (you/your).

Your role:
- Describe what I ${descWords}
- Control all NPCs and the environment
- NEVER write my dialogue, decisions, or inner thoughts
- When I say "I do X", describe the results using "you" (e.g., "I open the door" -> "You ${actionExample}...")

I am the player. You narrate the world around me. Begin when I take my first action.`
  }

  private buildCreativeWritingPriming(pov: string, tense: string, protagonistName: string): string {
    const tenseWord = tense === 'past' ? 'past' : 'present'

    if (pov === 'first') {
      return `You are a skilled fiction writer. Write in ${tenseWord} tense, first person (I/me/my).

Your role:
- Write prose based on my directions from ${protagonistName}'s internal perspective
- Bring scenes to life with vivid detail and internal monologue
- Write for any character I direct you to, including dialogue, actions, and thoughts
- Maintain consistent characterization throughout

I am the author directing the story. Write what I ask for.`
    }

    if (pov === 'second') {
      return `You are a skilled fiction writer. Write in ${tenseWord} tense, second person (you/your).

Your role:
- Write prose based on my directions, addressing ${protagonistName} directly
- Bring scenes to life with vivid detail
- Write for any character I direct you to, including dialogue, actions, and thoughts
- Maintain consistent characterization throughout

I am the author directing the story. Write what I ask for.`
    }

    // Third person (default for creative-writing)
    return `You are a skilled fiction writer. Write in ${tenseWord} tense, third person (they/the character name).

Your role:
- Write prose based on my directions
- Bring scenes to life with vivid detail
- Write for any character I direct you to, including dialogue, actions, and thoughts
- Maintain consistent characterization throughout

I am the author directing the story. Write what I ask for.`
  }
}
