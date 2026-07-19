<script lang="ts">
  /**
   * Visual Novel view (research/37 Part III V1): a presentation layer over the
   * existing generation pipeline — sharp background, present-NPC portrait
   * standees, paragraph-level ADV click-through with streaming hold-back, and
   * the unmodified choice/input components. The prose feed stays the canonical
   * log; this view renders only the latest beat.
   */
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { settings, STORY_WIDTH_OPTIONS } from '$lib/stores/settings.svelte'
  import { parseMarkdown } from '$lib/utils/markdown'
  import ActionChoices from './ActionChoices.svelte'
  import ActionInput from './ActionInput.svelte'
  import { fade } from 'svelte/transition'
  import { ChevronDown, Loader2 } from 'lucide-svelte'
  import type { Character } from '$lib/types'

  const asImageUrl = (raw: string): string =>
    raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`

  const bgImageUrl = $derived.by(() => {
    const raw = story.currentBgImage
    if (!raw) return null
    return `url(${asImageUrl(raw)})`
  })

  const latestNarration = $derived.by(() => {
    for (let i = story.entries.length - 1; i >= 0; i--) {
      const entry = story.entries[i]
      if (entry.type === 'narration') return entry
    }
    return null
  })

  // Presence from the newest delta-carrying narration (deltas lag streaming by
  // one classification pass, so we keep showing the previous scene's cast).
  const presentCharacters = $derived.by(() => {
    for (let i = story.entries.length - 1; i >= 0; i--) {
      const entry = story.entries[i]
      if (entry.type !== 'narration' || !entry.worldStateDelta) continue
      const result = entry.worldStateDelta.classificationResult as
        | { scene?: { presentCharacterNames?: string[] } }
        | undefined
      const names = result?.scene?.presentCharacterNames
      if (!names) continue
      const resolved: Character[] = []
      for (const name of names) {
        const character = story.characters.find(
          (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
        )
        // The protagonist is the camera in this second-person view — no standee.
        // Dedupe by id: the classifier can repeat a name.
        if (
          character &&
          character.relationship !== 'self' &&
          !resolved.some((c) => c.id === character.id)
        ) {
          resolved.push(character)
        }
      }
      return resolved
    }
    return []
  })

  const MAX_STANDEES = 3
  const standees = $derived(presentCharacters.slice(0, MAX_STANDEES))
  const overflowCount = $derived(Math.max(0, presentCharacters.length - MAX_STANDEES))
  const standeeWidth = $derived(
    standees.length <= 1 ? '50%' : standees.length === 2 ? '42%' : '32%',
  )

  // ---- ADV paragraphs with streaming hold-back (pixelsaga display loop) ----
  const stripPicTags = (html: string): string =>
    html
      .replace(/<pic\b[^>]*>([\s\S]*?)<\/pic>/gi, '$1')
      .replace(/<pic\b[^>]*\/?>/gi, '')
      // A partial <pic … tag truncated at a stream-chunk boundary would swallow
      // trailing text if injected via @html — drop the fragment.
      .replace(/<pic\b[^>]*$/i, '')

  /**
   * Split rendered HTML into displayable blocks via the DOM (a regex mis-groups
   * nested wrappers and silently drops text between blocks). Descends through a
   * single outer wrapper (the visual-prose entry div) and wraps loose top-level
   * text so nothing the model wrote is lost.
   */
  function splitHtmlBlocks(html: string): string[] {
    if (typeof DOMParser === 'undefined') return [html]
    const doc = new DOMParser().parseFromString(html, 'text/html')
    let nodes = Array.from(doc.body.childNodes)
    for (
      let onlyChild = nodes.length === 1 && nodes[0].nodeType === 1 ? (nodes[0] as Element) : null;
      onlyChild && onlyChild.children.length > 1;
      onlyChild = nodes.length === 1 && nodes[0].nodeType === 1 ? (nodes[0] as Element) : null
    ) {
      nodes = Array.from(onlyChild.childNodes)
    }
    const blocks: string[] = []
    for (const node of nodes) {
      if (node.nodeType === 1) {
        blocks.push((node as Element).outerHTML)
      } else if (node.textContent && node.textContent.trim()) {
        blocks.push(`<p>${node.textContent.trim()}</p>`)
      }
    }
    return blocks.length > 0 ? blocks : html.trim() ? [html] : []
  }

  const isHtmlContent = (text: string): boolean => /<(p|div|h[1-6]|blockquote|ul|ol)\b/i.test(text)

  const paragraphs = $derived.by(() => {
    if (ui.isStreaming) {
      // Visual-prose streams arrive as ONE growing repaired-HTML wrapper — no
      // blank-line seams to split on. Render it live instead of holding back.
      if (ui.isVisualProseStreaming()) {
        const html = ui.streamingContent
        return html.trim() ? [html] : []
      }
      const parts = stripPicTags(ui.streamingContent)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => (isHtmlContent(p) ? p : parseMarkdown(p)))
      // The partial last paragraph is held back until the next one begins.
      return parts.slice(0, Math.max(0, parts.length - 1))
    }
    const entry = latestNarration
    const content = entry?.translatedContent ?? entry?.content ?? ''
    const cleaned = stripPicTags(content)
    if (!cleaned.trim()) return []
    // Standard-mode entries store markdown — render it before splitting.
    const html = isHtmlContent(cleaned) ? cleaned : parseMarkdown(cleaned)
    return splitHtmlBlocks(html)
  })

  let paraIndex = $state(0)
  let beatKey = $state<string | null>(null)

  // Reset the click-through position when a genuinely NEW beat begins (stream
  // start or a different finalized entry). The streaming→finalized transition
  // of the SAME beat keeps the reader's place (clamped by shownIndex).
  $effect(() => {
    const key = ui.isStreaming ? '__streaming__' : (latestNarration?.id ?? null)
    if (key !== beatKey) {
      const wasStreamingSameBeat = beatKey === '__streaming__' && key !== null
      beatKey = key
      if (!wasStreamingSameBeat) paraIndex = 0
    }
  })

  const shownIndex = $derived(Math.min(paraIndex, Math.max(0, paragraphs.length - 1)))
  const currentParagraph = $derived(paragraphs[shownIndex] ?? '')
  const hasMore = $derived(shownIndex < paragraphs.length - 1)
  const awaitingStream = $derived(ui.isStreaming && !hasMore)

  function advance() {
    // Don't advance away from text the user is selecting to copy.
    if (typeof window !== 'undefined' && window.getSelection()?.toString()) return
    if (hasMore) paraIndex = shownIndex + 1
  }

  function handleViewportKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      advance()
    }
  }

  const showChoices = $derived(
    !ui.isStreaming &&
      !ui.isGenerating &&
      story.storyMode === 'adventure' &&
      !settings.uiSettings.disableSuggestions,
  )

  // Respect the user's configured story column width (mirrors StoryView).
  const storyMaxWidthStyle = $derived.by(() => {
    const maxWidth =
      STORY_WIDTH_OPTIONS.find((o) => o.key === settings.uiSettings.storyMaxWidth)?.maxWidth ??
      '48rem'
    return `max-width: ${maxWidth}`
  })
</script>

<div class="relative flex h-full flex-col overflow-hidden bg-black">
  <!-- Viewport: background + standees + textbox -->
  <div
    class="relative min-h-0 flex-1 cursor-pointer overflow-hidden"
    role="button"
    tabindex="0"
    onclick={advance}
    onkeydown={handleViewportKeydown}
    aria-label="Advance story"
  >
    <!-- Background (sharp — the VN view bypasses the blur setting) -->
    {#if bgImageUrl}
      {#key story.currentBgImage}
        <div
          class="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style="background-image: {bgImageUrl};"
          in:fade={{ duration: 600 }}
          out:fade={{ duration: 600 }}
        ></div>
      {/key}
    {:else}
      <div class="from-background absolute inset-0 z-0 bg-gradient-to-b to-black"></div>
    {/if}

    <!-- Character standees (bottom-aligned, centered) -->
    <div
      class="pointer-events-none absolute inset-0 z-[1] flex items-end justify-center gap-0 pb-0"
    >
      {#each standees as character (character.id)}
        <div
          class="flex h-[92%] items-end justify-center"
          style="max-width: {standeeWidth};"
          in:fade={{ duration: 300 }}
          out:fade={{ duration: 300 }}
        >
          {#if character.portrait}
            <img
              src={asImageUrl(character.portrait)}
              alt={character.name}
              class="max-h-full max-w-full object-contain object-bottom drop-shadow-[0_0_12px_rgba(0,0,0,0.8)]"
            />
          {:else}
            <div
              class="text-muted-foreground mb-16 flex flex-col items-center gap-2 rounded-lg bg-black/50 px-4 py-3 text-sm"
            >
              <Loader2 class="h-5 w-5 animate-spin" />
              {character.name.split(' ')[0]}
            </div>
          {/if}
        </div>
      {/each}
      {#if overflowCount > 0}
        <div
          class="text-muted-foreground absolute top-3 right-3 rounded bg-black/60 px-2 py-1 text-xs"
        >
          +{overflowCount} more present
        </div>
      {/if}
    </div>

    <!-- ADV textbox -->
    {#if currentParagraph || awaitingStream}
      <div
        class="border-primary/60 absolute inset-x-0 bottom-0 z-[2] max-h-[45%] overflow-y-auto border-t-2 bg-gradient-to-b from-black/75 to-black/95 px-5 py-4"
      >
        {#if currentParagraph}
          <div class="vn-text text-base leading-relaxed sm:text-lg">
            <!-- eslint-disable-next-line svelte/no-at-html-tags — model content, same trust model as the feed -->
            {@html currentParagraph}
          </div>
        {/if}
        {#if awaitingStream}
          <div class="text-muted-foreground mt-1 text-sm italic">…</div>
        {/if}
      </div>
      {#if hasMore}
        <div
          class="text-primary absolute right-4 bottom-2 z-[3] animate-bounce text-lg"
          aria-hidden="true"
        >
          <ChevronDown class="h-5 w-5" />
        </div>
      {/if}
    {:else if !latestNarration && !ui.isStreaming}
      <div
        class="text-muted-foreground absolute inset-x-0 bottom-0 z-[2] bg-black/80 px-5 py-6 text-center text-sm"
      >
        Take an action below to begin — the scene will render here.
      </div>
    {/if}
  </div>

  <!-- Choices + input (reused, unchanged) -->
  <div class="relative z-[4] shrink-0 px-3 pt-1 pb-2 sm:px-6">
    <div class="mx-auto w-full" style={storyMaxWidthStyle}>
      {#if showChoices}
        <ActionChoices />
      {/if}
      <ActionInput />
    </div>
  </div>
</div>

<style>
  .vn-text :global(p) {
    margin-bottom: 0.5rem;
  }
  .vn-text :global(p:last-child) {
    margin-bottom: 0;
  }
</style>
