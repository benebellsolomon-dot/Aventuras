<script lang="ts">
  /**
   * Visual Novel view (research/37 Part III V1): a presentation layer over the
   * existing generation pipeline. v1.1 after Ben's first-contact feedback:
   * full-bleed viewport, inline images render as the SCENE layer (in inline
   * image mode they ARE the scene imagery — background generation is
   * suppressed), sticky presence across empty classifier reads, readable
   * text panel, and choices revealed only once the beat is read through.
   */
  import { onMount } from 'svelte'
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { settings, STORY_WIDTH_OPTIONS } from '$lib/stores/settings.svelte'
  import { parseMarkdown } from '$lib/utils/markdown'
  import { stripMarkdownFence } from '$lib/utils/narrativeCleanup'
  import {
    hasIncompleteThoughtTag,
    resolveInnerVoices,
    stripThoughtTags,
  } from '$lib/utils/thoughtTagParser'
  import { database } from '$lib/services/database'
  import { eventBus, type ImageQueuedEvent, type ImageReadyEvent } from '$lib/services/events'
  import ActionChoices from './ActionChoices.svelte'
  import InnerVoicesList from './InnerVoicesList.svelte'
  import ActionInput from './ActionInput.svelte'
  import { fade } from 'svelte/transition'
  import { ChevronDown, Loader2, MessageCircle } from 'lucide-svelte'
  import type { Character, EmbeddedImage } from '$lib/types'
  import { readBodyState, selectSprite } from '$lib/services/be'
  import { spriteAnchorService } from '$lib/services/ai/image/SpriteService'

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

  // ---- Scene layer: the newest completed inline image for the latest beat.
  // In inline image mode these ARE the scene imagery (background generation is
  // deliberately suppressed by the pipeline), so they take visual priority.
  let sceneImages = $state<EmbeddedImage[]>([])
  let sceneImagesEntryId = $state<string | null>(null)

  async function loadSceneImages(entryId: string | null) {
    if (!entryId) {
      sceneImages = []
      return
    }
    try {
      sceneImages = await database.getEmbeddedImagesForEntry(entryId)
    } catch {
      sceneImages = []
    }
  }

  $effect(() => {
    const id = latestNarration?.id ?? null
    if (id !== sceneImagesEntryId) {
      sceneImagesEntryId = id
      loadSceneImages(id)
    }
  })

  onMount(() => {
    const reload = (event: ImageQueuedEvent | ImageReadyEvent) => {
      if (event.entryId === sceneImagesEntryId) loadSceneImages(sceneImagesEntryId)
    }
    const unsubQueued = eventBus.subscribe<ImageQueuedEvent>('ImageQueued', reload)
    const unsubReady = eventBus.subscribe<ImageReadyEvent>('ImageReady', reload)
    return () => {
      unsubQueued()
      unsubReady()
    }
  })

  const sceneImage = $derived.by(() => {
    const complete = sceneImages.filter((img) => img.status === 'complete' && img.imageData)
    return complete.length > 0 ? complete[complete.length - 1] : null
  })
  const sceneGenerating = $derived(
    sceneImages.some((img) => img.status === 'pending' || img.status === 'generating'),
  )

  // ---- Presence: sticky across empty classifier reads (the classifier
  // intermittently returns [] mid-scene; people don't teleport out).
  const PRESENCE_LOOKBACK = 10
  const presentCharacters = $derived.by(() => {
    let checked = 0
    for (let i = story.entries.length - 1; i >= 0 && checked < PRESENCE_LOOKBACK; i--) {
      const entry = story.entries[i]
      if (entry.type !== 'narration' || !entry.worldStateDelta) continue
      checked += 1
      const result = entry.worldStateDelta.classificationResult as
        | { scene?: { presentCharacterNames?: string[] } }
        | undefined
      const names = result?.scene?.presentCharacterNames
      if (!names || names.length === 0) continue
      const resolved: Character[] = []
      for (const name of names) {
        const character = story.characters.find(
          (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
        )
        // The protagonist is the camera in this second-person view — no standee.
        if (
          character &&
          character.relationship !== 'self' &&
          !resolved.some((c) => c.id === character.id)
        ) {
          resolved.push(character)
        }
      }
      if (resolved.length > 0) return resolved
    }
    return []
  })

  const MAX_STANDEES = 3
  const standees = $derived(presentCharacters.slice(0, MAX_STANDEES))

  // ---- V2b sprite layer: banded cutout sprites for characters with engine
  // bodyState; the map keeps the LAST COMPLETE cell so band/expression swaps
  // crossfade instead of blanking during the lazy ~30s-per-cell generation.
  // Fallback chain: current cell → last-known sprite → portrait → spinner.
  let spriteUrls = $state<Record<string, string>>({})
  let spriteCellKeys = $state<Record<string, string>>({})

  async function refreshSprite(character: Character): Promise<void> {
    if (story.currentStory?.settings?.beMode !== true) return
    const bodyState = readBodyState(character.metadata)
    if (!bodyState || !story.currentStory) return
    const selection = selectSprite(bodyState)
    const sprite = await spriteAnchorService.ensureSprite(
      character,
      story.currentStory.id,
      selection,
    )
    if (sprite?.status === 'complete' && sprite.imageData) {
      const cellKey = `${sprite.bandIndex}:${sprite.expression}:${sprite.engorged}`
      if (spriteCellKeys[character.id] !== cellKey) {
        spriteUrls = { ...spriteUrls, [character.id]: sprite.imageData }
        spriteCellKeys = { ...spriteCellKeys, [character.id]: cellKey }
      }
    }
  }

  $effect(() => {
    for (const character of standees) void refreshSprite(character)
  })

  $effect(() => {
    return spriteAnchorService.subscribe((characterId) => {
      const character = standees.find((c) => c.id === characterId)
      if (character) void refreshSprite(character)
    })
  })
  const overflowCount = $derived(Math.max(0, presentCharacters.length - MAX_STANDEES))
  const standeeWidth = $derived(
    standees.length <= 1 ? '38%' : standees.length === 2 ? '34%' : '30%',
  )

  // ---- ADV paragraphs with streaming hold-back (pixelsaga display loop) ----
  // Also drops <thought> inner voices: the VN reader shows prose only (E6,
  // research/65) — the panel that renders them lives in StoryEntry.
  const stripPicTags = (html: string): string =>
    stripThoughtTags(
      html
        .replace(/<pic\b[^>]*>([\s\S]*?)<\/pic>/gi, '$1')
        .replace(/<pic\b[^>]*\/?>/gi, '')
        .replace(/<pic\b[^>]*$/i, ''),
    )

  /**
   * Split rendered HTML into displayable blocks via the DOM (a regex mis-groups
   * nested wrappers and silently drops text between blocks).
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
      // Visual-prose streams arrive as ONE growing repaired-HTML wrapper —
      // render it live instead of holding back.
      if (ui.isVisualProseStreaming()) {
        // Hold back from an unclosed <thought> so a hidden reveal never flashes.
        const raw = ui.streamingContent
        const { incomplete, safeEnd } = hasIncompleteThoughtTag(raw)
        const html = stripThoughtTags(incomplete ? raw.slice(0, safeEnd) : raw)
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
    const content = stripMarkdownFence(entry?.translatedContent ?? entry?.content ?? '')
    const cleaned = stripPicTags(content)
    if (!cleaned.trim()) return []
    const html = isHtmlContent(cleaned) ? cleaned : parseMarkdown(cleaned)
    return splitHtmlBlocks(html)
  })

  // Inner voices (E6, research/65) for the finished beat — the VN reader strips
  // them from the prose, so this is their only surface here. Closed per beat.
  const innerVoices = $derived(
    !ui.isStreaming && latestNarration
      ? resolveInnerVoices(latestNarration.content, story.characters)
      : [],
  )
  let voicesOpen = $state(false)

  let paraIndex = $state(0)
  let beatKey = $state<string | null>(null)
  // User toggled from the choice menu back to re-reading the beat.
  let choicesHidden = $state(false)

  // Reset the click-through position only on genuinely NEW beats; the
  // streaming→finalized transition of the same beat keeps the reader's place.
  $effect(() => {
    const key = ui.isStreaming ? '__streaming__' : (latestNarration?.id ?? null)
    if (key !== beatKey) {
      const wasStreamingSameBeat = beatKey === '__streaming__' && key !== null
      beatKey = key
      choicesHidden = false
      voicesOpen = false
      if (!wasStreamingSameBeat) paraIndex = 0
    }
  })

  const shownIndex = $derived(Math.min(paraIndex, Math.max(0, paragraphs.length - 1)))
  const currentParagraph = $derived(paragraphs[shownIndex] ?? '')
  const hasMore = $derived(shownIndex < paragraphs.length - 1)
  const awaitingStream = $derived(ui.isStreaming && !hasMore)

  // ADV pacing: the choice menu takes the textbox's place once the beat is
  // read through — never both at once, so the scene keeps the frame.
  const choicesReady = $derived(
    !ui.isStreaming &&
      !ui.isGenerating &&
      !hasMore &&
      story.storyMode === 'adventure' &&
      !settings.uiSettings.disableSuggestions,
  )
  const choicesVisible = $derived(choicesReady && !choicesHidden)

  function advance() {
    // Don't advance away from text the user is selecting to copy.
    if (typeof window !== 'undefined' && window.getSelection()?.toString()) return
    if (choicesVisible) {
      // Scene tap while the menu is up = go back to re-reading.
      choicesHidden = true
      return
    }
    if (hasMore) paraIndex = shownIndex + 1
  }

  function handleViewportKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      advance()
    }
  }

  const storyMaxWidthStyle = $derived.by(() => {
    const maxWidth =
      STORY_WIDTH_OPTIONS.find((o) => o.key === settings.uiSettings.storyMaxWidth)?.maxWidth ??
      '48rem'
    return `max-width: ${maxWidth}`
  })
</script>

<div class="bg-background relative h-full overflow-hidden">
  <!-- Full-bleed viewport: scene image > background > gradient -->
  <div
    class="absolute inset-0 cursor-pointer"
    role="button"
    tabindex="0"
    onclick={advance}
    onkeydown={handleViewportKeydown}
    aria-label="Advance story"
  >
    {#if sceneImage}
      {#key sceneImage.id}
        <img
          src={asImageUrl(sceneImage.imageData)}
          alt="Scene"
          class="absolute inset-0 z-0 h-full w-full object-contain"
          in:fade={{ duration: 500 }}
        />
      {/key}
      <!-- backdrop behind letterboxed scene art -->
      {#if bgImageUrl}
        <div
          class="absolute inset-0 z-[-1] bg-cover bg-center opacity-40 blur-md"
          style="background-image: {bgImageUrl};"
        ></div>
      {/if}
    {:else if bgImageUrl}
      {#key story.currentBgImage}
        <div
          class="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style="background-image: {bgImageUrl};"
          in:fade={{ duration: 600 }}
        ></div>
      {/key}
    {:else}
      <div class="from-background absolute inset-0 z-0 bg-gradient-to-b to-black"></div>
    {/if}

    {#if sceneGenerating}
      <div
        class="bg-background/80 text-muted-foreground absolute top-3 left-3 z-[3] flex items-center gap-2 rounded px-3 py-1.5 text-xs backdrop-blur-sm"
      >
        <Loader2 class="h-3.5 w-3.5 animate-spin" /> scene image generating…
      </div>
    {/if}

    <!-- Character standees (hidden while a scene CG owns the frame) -->
    {#if !sceneImage}
      <div class="pointer-events-none absolute inset-0 z-[1] flex items-end justify-center">
        {#each standees as character (character.id)}
          <div
            class="flex h-[88%] items-end justify-center"
            style="max-width: {standeeWidth};"
            in:fade={{ duration: 300 }}
            out:fade={{ duration: 300 }}
          >
            {#if spriteUrls[character.id]}
              <div class="relative h-full w-full">
                {#key spriteCellKeys[character.id]}
                  <img
                    src={spriteUrls[character.id]}
                    alt={character.name}
                    class="absolute inset-x-0 bottom-0 mx-auto max-h-full max-w-full object-contain object-bottom drop-shadow-[0_0_14px_rgba(0,0,0,0.85)]"
                    in:fade={{ duration: 350 }}
                    out:fade={{ duration: 350 }}
                  />
                {/key}
              </div>
            {:else if character.portrait}
              <img
                src={asImageUrl(character.portrait)}
                alt={character.name}
                class="max-h-full max-w-full object-contain object-bottom drop-shadow-[0_0_14px_rgba(0,0,0,0.85)]"
              />
            {:else}
              <div
                class="bg-background/70 text-muted-foreground mb-24 flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-sm backdrop-blur-sm"
              >
                <Loader2 class="h-5 w-5 animate-spin" />
                {character.name.split(' ')[0]}
              </div>
            {/if}
          </div>
        {/each}
        {#if overflowCount > 0}
          <div
            class="bg-background/70 text-muted-foreground absolute top-3 right-3 rounded px-2 py-1 text-xs"
          >
            +{overflowCount} more present
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Bottom overlay: textbox → choices → input -->
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex flex-col justify-end">
    <div class="pointer-events-auto mx-auto w-full px-2 sm:px-4" style={storyMaxWidthStyle}>
      {#if choicesVisible}
        <div
          class="vn-choices border-primary/50 bg-background/90 max-h-[44vh] overflow-y-auto rounded-t-lg border-t-2 px-2 pb-1 backdrop-blur-md"
        >
          <ActionChoices />
          <button
            class="text-muted-foreground hover:text-foreground mx-auto block py-1 text-xs"
            onclick={() => (choicesHidden = true)}
          >
            ↺ re-read the scene
          </button>
        </div>
      {:else if currentParagraph || awaitingStream}
        <!-- eslint-disable-next-line svelte/valid-compile -->
        <div
          class="border-primary/70 bg-background/90 relative cursor-pointer rounded-t-lg border-t-2 px-5 py-4 backdrop-blur-md"
          role="button"
          tabindex="-1"
          onclick={advance}
          onkeydown={handleViewportKeydown}
        >
          <div class="max-h-[32vh] overflow-y-auto">
            {#if currentParagraph}
              <div class="vn-text text-foreground text-base leading-relaxed sm:text-lg">
                <!-- eslint-disable-next-line svelte/no-at-html-tags — model content, same trust model as the feed -->
                {@html currentParagraph}
              </div>
            {/if}
            {#if awaitingStream}
              <div class="text-muted-foreground mt-1 text-sm italic">…</div>
            {/if}
            {#if voicesOpen && innerVoices.length > 0}
              <InnerVoicesList
                voices={innerVoices}
                class="border-border/50 mt-3 border-t pt-2 text-sm"
              />
            {/if}
          </div>
          {#if innerVoices.length > 0}
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground absolute bottom-1.5 left-3 flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase"
              aria-expanded={voicesOpen}
              title="Inner voices"
              onclick={(e) => {
                e.stopPropagation()
                voicesOpen = !voicesOpen
              }}
            >
              <MessageCircle class="h-3.5 w-3.5" />
              <span>Inner voices</span>
              <span class="font-normal normal-case">({innerVoices.length})</span>
            </button>
          {/if}
          {#if hasMore}
            <div class="text-primary absolute right-3 bottom-1.5 animate-bounce" aria-hidden="true">
              <ChevronDown class="h-5 w-5" />
            </div>
          {/if}
          {#if choicesReady && choicesHidden}
            <button
              class="text-primary hover:text-primary/80 absolute right-3 bottom-1.5 text-xs font-medium"
              onclick={(e) => {
                e.stopPropagation()
                choicesHidden = false
              }}
            >
              choices ▾
            </button>
          {/if}
        </div>
      {:else if !latestNarration && !ui.isStreaming}
        <div
          class="bg-background/85 text-muted-foreground rounded-t-lg px-5 py-5 text-center text-sm backdrop-blur-md"
        >
          Take an action below to begin — the scene will render here.
        </div>
      {/if}

      <div class="bg-background/85 px-2 pb-2 backdrop-blur-md">
        <ActionInput />
      </div>
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
  /* Compact the reused choice cards inside the VN menu. */
  .vn-choices :global(button.group) {
    min-height: 0;
    padding-top: 0.4rem;
    padding-bottom: 0.4rem;
  }
</style>
