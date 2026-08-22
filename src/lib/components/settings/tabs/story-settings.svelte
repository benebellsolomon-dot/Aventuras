<script lang="ts">
  import { onDestroy } from 'svelte'
  import { story } from '$lib/stores/story.svelte'
  import { hasRequiredCredentials } from '$lib/services/ai/image'
  import { templateEngine } from '$lib/services/templates/engine'
  import { PROMPT_TEMPLATES } from '$lib/services/prompts/templates'
  import WritingStyleFields from '$lib/components/shared/WritingStyleFields.svelte'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import * as RadioGroup from '$lib/components/ui/radio-group'
  import { Switch } from '$lib/components/ui/switch'
  import type { ContentRating } from '$lib/types'

  // Static — defined at module scope so they aren't re-created per component instance
  const KNOWN_VARIABLES = new Set([
    'mode',
    'pov',
    'tense',
    'genre',
    'tone',
    'themes',
    'settingDescription',
    'visualProseMode',
    'inlineImageMode',
    'protagonistName',
    'protagonistDescription',
    'currentLocation',
    'storyTime',
    'tieredContextBlock',
    'retrievedChapterContext',
    'chapterSummaries',
    'styleGuidance',
    'inlineImageInstructions',
    'visualProseInstructions',
    'runtimeVars_characters',
    'runtimeVars_locations',
    'runtimeVars_items',
    'runtimeVars_storyBeats',
    'runtimeVars_protagonist',
    'contentRating',
    'contentGuidelines',
    'proseStyle',
    'responseLengthGuidance',
  ])

  const CONTENT_RATINGS: Array<{ value: ContentRating; label: string; desc: string }> = [
    { value: 'standard', label: 'Standard', desc: 'Default behavior, no extra content guidance' },
    { value: 'mature', label: 'Mature', desc: 'Adult themes on-page with scene discretion' },
    { value: 'explicit', label: 'Explicit', desc: 'Fully explicit scenes, no fade-to-black' },
  ]

  const PROSE_STYLES = [
    {
      value: 'cinematic',
      label: 'Cinematic',
      desc: 'Observable-only realism: show, never tell, no lyrical flourish',
    },
    {
      value: 'literary',
      label: 'Literary',
      desc: 'Evocative, atmospheric prose with emotional flourish',
    },
  ]

  const RESPONSE_LENGTHS = [
    { value: 'short', label: 'Short', desc: '~150 words' },
    { value: 'medium', label: 'Medium', desc: '~250 words' },
    { value: 'long', label: 'Long', desc: '400-600 words' },
  ]

  const NSFW_FLAVORS = [
    {
      value: 'scene',
      label: 'Scene-triggered',
      desc: 'Explicit delivery only when a scene turns intimate',
    },
    {
      value: 'always',
      label: 'Always on',
      desc: 'Sensual physical description woven into every scene',
    },
  ]

  const WORLD_SIM_FREQUENCIES = [
    { value: 'off', label: 'Off', desc: 'No background events' },
    { value: 'sparse', label: 'Sparse', desc: 'A background event on roughly a third of turns' },
    { value: 'lively', label: 'Lively', desc: 'A background event rolls every turn' },
  ]

  const VARIABLE_REFERENCE = [
    {
      group: 'Protagonist',
      vars: [
        { name: 'protagonistName', desc: "Protagonist's name as set in World" },
        { name: 'protagonistDescription', desc: "Protagonist's description from World" },
      ],
    },
    {
      group: 'World',
      vars: [
        { name: 'currentLocation', desc: 'Current location name' },
        { name: 'storyTime', desc: 'In-story time (Year, Day, Hour, Minute)' },
        { name: 'genre', desc: 'Story genre' },
        { name: 'tone', desc: 'Writing tone' },
        { name: 'settingDescription', desc: 'World description' },
      ],
    },
    {
      group: 'Memory & Context',
      vars: [
        { name: 'tieredContextBlock', desc: 'Recent story memory injected by the memory system' },
        { name: 'chapterSummaries', desc: 'Summaries of past chapters' },
        { name: 'retrievedChapterContext', desc: 'Retrieved chapter context from memory' },
        { name: 'styleGuidance', desc: 'Style review guidance (when style reviewer is active)' },
      ],
    },
    {
      group: 'Content',
      vars: [
        { name: 'contentRating', desc: "The story's content rating (standard/mature/explicit)" },
        { name: 'contentGuidelines', desc: 'Content guidance block for the current rating' },
        { name: 'proseStyle', desc: "The story's prose style (cinematic/literary)" },
        { name: 'responseLengthGuidance', desc: 'Length guidance text for the Format section' },
      ],
    },
    {
      group: 'Runtime Variables',
      vars: [
        { name: 'runtimeVars_characters', desc: 'Runtime variable values for all characters' },
        { name: 'runtimeVars_protagonist', desc: 'Runtime variable values for the protagonist' },
        { name: 'runtimeVars_locations', desc: 'Runtime variable values for all locations' },
        { name: 'runtimeVars_items', desc: 'Runtime variable values for all items' },
        { name: 'runtimeVars_storyBeats', desc: 'Runtime variable values for all story beats' },
      ],
    },
  ]

  // Defined as a plain const so Svelte doesn't parse {{ }} as template expressions
  const promptPlaceholder =
    'Leave empty to use the default pack template. Use {{ protagonistName }}, {{ currentLocation }}, etc.'

  // ── Reactive state ────────────────────────────────────────────────────────────

  const storySettings = $derived(story.currentStory?.settings ?? {})
  const imageGenEnabled = $derived(hasRequiredCredentials())

  // Track only customSystemPrompt so the effect below doesn't fire on unrelated
  // setting changes (tone, pov, etc.) and overwrite an unsaved draft.
  const savedCustomPrompt = $derived(story.currentStory?.settings?.customSystemPrompt)

  // Local draft — initialised and re-synced only when the saved value changes.
  // Two write sources (user input + external sync) make a writable $derived inapplicable.
  // eslint-disable-next-line svelte/prefer-writable-derived
  let customPromptDraft = $state('')
  $effect(() => {
    customPromptDraft = savedCustomPrompt ?? ''
  })

  let validationResult = $state<{ success: boolean; error?: string } | null>(null)
  let unknownVars = $state<string[]>([])
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let showVarReference = $state(false)

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  // ── Derived flags ─────────────────────────────────────────────────────────────

  const isActive = $derived(!!savedCustomPrompt)
  const isDirty = $derived(customPromptDraft !== (savedCustomPrompt ?? ''))
  const canSave = $derived(
    isDirty && (customPromptDraft.trim() === '' || (validationResult?.success ?? false)),
  )

  // ── Functions ─────────────────────────────────────────────────────────────────

  function validate(value: string) {
    if (!value.trim()) {
      validationResult = null
      unknownVars = []
      return
    }
    const result = templateEngine.parseTemplate(value)
    validationResult = result
    unknownVars = result.success
      ? templateEngine.extractVariableNames(value).filter((v) => !KNOWN_VARIABLES.has(v))
      : []
  }

  function onDraftInput(value: string) {
    customPromptDraft = value
    validationResult = null // clear stale result immediately so canSave goes false until debounce fires
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => validate(value), 300)
  }

  function loadCurrentTemplate() {
    if (debounceTimer) clearTimeout(debounceTimer)
    const mode = story.currentStory?.mode ?? 'adventure'
    const templateId = mode === 'creative-writing' ? 'creative-writing' : 'adventure'
    const template = PROMPT_TEMPLATES.find((t) => t.id === templateId)
    if (template) {
      customPromptDraft = template.content
      validate(template.content)
    }
  }

  async function savePrompt() {
    await story.updateStorySettings({ customSystemPrompt: customPromptDraft.trim() || undefined })
  }

  async function clearOverride() {
    customPromptDraft = ''
    validationResult = null
    unknownVars = []
    await story.updateStorySettings({ customSystemPrompt: undefined })
  }

  // ── Post-history instructions ────────────────────────────────────────────────

  const savedPostHistory = $derived(story.currentStory?.settings?.postHistoryInstructions)

  // eslint-disable-next-line svelte/prefer-writable-derived
  let postHistoryDraft = $state('')
  $effect(() => {
    postHistoryDraft = savedPostHistory ?? ''
  })

  let postHistoryError = $state<string | null>(null)
  const postHistoryDirty = $derived(postHistoryDraft !== (savedPostHistory ?? ''))

  async function savePostHistory() {
    const trimmed = postHistoryDraft.trim()
    if (trimmed) {
      const result = templateEngine.parseTemplate(trimmed)
      if (!result.success) {
        postHistoryError = result.error ?? 'Invalid Liquid template'
        return
      }
    }
    postHistoryError = null
    await story.updateStorySettings({ postHistoryInstructions: trimmed || undefined })
  }
</script>

<div class="space-y-6">
  <div>
    <h3 class="text-lg font-semibold">Story Settings</h3>
    <p class="text-muted-foreground text-sm">Configure settings for the current story.</p>
  </div>

  <WritingStyleFields
    allowHybridPov={(story.currentStory?.mode ?? 'adventure') === 'adventure'}
    selectedPOV={storySettings.pov ?? 'second'}
    selectedTense={storySettings.tense ?? 'present'}
    tone={storySettings.tone ?? ''}
    visualProseMode={storySettings.visualProseMode ?? false}
    imageGenerationEnabled={imageGenEnabled}
    imageGenerationMode={storySettings.imageGenerationMode ?? 'none'}
    backgroundImagesEnabled={storySettings.backgroundImagesEnabled ?? false}
    referenceMode={storySettings.referenceMode ?? false}
    beMode={storySettings.beMode ?? false}
    beFluidType={storySettings.beFluidType ?? ''}
    onPOVChange={(v) => story.updateStorySettings({ pov: v })}
    onTenseChange={(v) => story.updateStorySettings({ tense: v })}
    onToneChange={(v) => story.updateStorySettings({ tone: v })}
    onVisualProseModeChange={(v) => story.updateStorySettings({ visualProseMode: v })}
    onImageGenerationModeChange={(v) => story.updateStorySettings({ imageGenerationMode: v })}
    onBackgroundImagesEnabledChange={(v) =>
      story.updateStorySettings({ backgroundImagesEnabled: v })}
    onReferenceModeChange={(v) => story.updateStorySettings({ referenceMode: v })}
    onBeModeChange={(v) => story.updateStorySettings({ beMode: v })}
    onBeFluidTypeChange={(v) => story.updateStorySettings({ beFluidType: v })}
    beGrowthCosmology={storySettings.beGrowthCosmology ?? ''}
    bePacingFlavor={storySettings.bePacingFlavor ?? ''}
    beGrowthEligibleKinds={storySettings.beGrowthEligibleKinds ?? []}
    onBeGrowthCosmologyChange={(v) =>
      story.updateStorySettings({ beGrowthCosmology: v.trim() ? v : undefined })}
    onBePacingFlavorChange={(v) =>
      story.updateStorySettings({ bePacingFlavor: v.trim() ? v : undefined })}
    onBeGrowthEligibleKindsChange={(v) =>
      story.updateStorySettings({ beGrowthEligibleKinds: v.length > 0 ? v : undefined })}
    disabledFields={{ pov: true, tense: true, visualProseMode: true }}
    disabledReason="Cannot be changed mid-story. Set during story creation."
  />

  <!-- ── Prose Style ──────────────────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <Label class="text-sm font-medium">Prose Style</Label>
    <p class="text-muted-foreground mt-1 mb-3 text-xs">
      The narrative voice used by the story templates. Applies from the next generation.
    </p>
    <RadioGroup.Root
      value={storySettings.proseStyle ?? 'cinematic'}
      onValueChange={(v) =>
        story.updateStorySettings({ proseStyle: v === 'literary' ? 'literary' : undefined })}
      class="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {#each PROSE_STYLES as style (style.value)}
        <Label
          for={`prose-style-${style.value}`}
          class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-start justify-center gap-1 rounded-md border-2 p-3"
        >
          <RadioGroup.Item value={style.value} id={`prose-style-${style.value}`} class="sr-only" />
          <span class="font-medium">{style.label}</span>
          <span class="text-muted-foreground text-xs font-normal">{style.desc}</span>
        </Label>
      {/each}
    </RadioGroup.Root>
  </div>

  <!-- ── Response Length ──────────────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <Label class="text-sm font-medium">Response Length</Label>
    <p class="text-muted-foreground mt-1 mb-3 text-xs">
      Target narration length per response. Applies from the next generation.
    </p>
    <RadioGroup.Root
      value={storySettings.responseLength ?? 'medium'}
      onValueChange={(v) =>
        story.updateStorySettings({
          responseLength: v === 'short' || v === 'long' ? v : undefined,
        })}
      class="grid grid-cols-3 gap-2"
    >
      {#each RESPONSE_LENGTHS as len (len.value)}
        <Label
          for={`response-length-${len.value}`}
          class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-start justify-center gap-1 rounded-md border-2 p-3"
        >
          <RadioGroup.Item value={len.value} id={`response-length-${len.value}`} class="sr-only" />
          <span class="font-medium">{len.label}</span>
          <span class="text-muted-foreground text-xs font-normal">{len.desc}</span>
        </Label>
      {/each}
    </RadioGroup.Root>
  </div>

  <!-- ── Content Rating ───────────────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <Label class="text-sm font-medium">Content Rating</Label>
    <p class="text-muted-foreground mt-1 mb-3 text-xs">
      Controls the content guidance injected into narrative prompts. Applies from the next
      generation.
    </p>
    <RadioGroup.Root
      value={storySettings.contentRating ?? 'standard'}
      onValueChange={(v) => story.updateStorySettings({ contentRating: v as ContentRating })}
      class="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {#each CONTENT_RATINGS as rating (rating.value)}
        <Label
          for={`content-rating-${rating.value}`}
          class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-start justify-center gap-1 rounded-md border-2 p-3"
        >
          <RadioGroup.Item
            value={rating.value}
            id={`content-rating-${rating.value}`}
            class="sr-only"
          />
          <span class="font-medium">{rating.label}</span>
          <span class="text-muted-foreground text-xs font-normal">{rating.desc}</span>
        </Label>
      {/each}
    </RadioGroup.Root>

    {#if (storySettings.contentRating ?? 'standard') !== 'standard'}
      <div class="mt-3">
        <Label class="text-muted-foreground mb-2 block text-xs">Adult-content flavor</Label>
        <RadioGroup.Root
          value={storySettings.nsfwFlavor ?? 'scene'}
          onValueChange={(v) =>
            story.updateStorySettings({ nsfwFlavor: v === 'always' ? 'always' : undefined })}
          class="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {#each NSFW_FLAVORS as flavor (flavor.value)}
            <Label
              for={`nsfw-flavor-${flavor.value}`}
              class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-start justify-center gap-1 rounded-md border-2 p-3"
            >
              <RadioGroup.Item
                value={flavor.value}
                id={`nsfw-flavor-${flavor.value}`}
                class="sr-only"
              />
              <span class="font-medium">{flavor.label}</span>
              <span class="text-muted-foreground text-xs font-normal">{flavor.desc}</span>
            </Label>
          {/each}
        </RadioGroup.Root>
      </div>
    {/if}
  </div>

  <!-- ── World Liveliness (research/61) ───────────────────────────────────── -->
  <div class="border-t pt-4">
    <Label class="text-sm font-medium">World Events</Label>
    <p class="text-muted-foreground mt-1 mb-3 text-xs">
      Seeded background events (interruptions, mood shifts, off-screen ripples) woven into narration
      as advisory texture. Applies from the next generation.
    </p>
    <RadioGroup.Root
      value={storySettings.worldSimFrequency ?? 'off'}
      onValueChange={(v) =>
        story.updateStorySettings({
          worldSimFrequency: v === 'sparse' || v === 'lively' ? v : undefined,
        })}
      class="grid grid-cols-3 gap-2"
    >
      {#each WORLD_SIM_FREQUENCIES as freq (freq.value)}
        <Label
          for={`world-sim-${freq.value}`}
          class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-start justify-center gap-1 rounded-md border-2 p-3"
        >
          <RadioGroup.Item value={freq.value} id={`world-sim-${freq.value}`} class="sr-only" />
          <span class="font-medium">{freq.label}</span>
          <span class="text-muted-foreground text-xs font-normal">{freq.desc}</span>
        </Label>
      {/each}
    </RadioGroup.Root>

    <div class="mt-4 flex items-center justify-between gap-4">
      <div>
        <Label for="npc-agendas" class="text-sm font-medium">Off-screen NPC agendas</Label>
        <p class="text-muted-foreground mt-1 text-xs">
          Named characters pursue goals while off-screen and return changed by them. Applies from
          the next turn.
        </p>
      </div>
      <Switch
        id="npc-agendas"
        checked={storySettings.npcAgendas ?? false}
        onCheckedChange={(v) => story.updateStorySettings({ npcAgendas: v ? true : undefined })}
      />
    </div>

    <div class="mt-4 flex items-center justify-between gap-4">
      <div>
        <Label for="chekhov-gun" class="text-sm font-medium">Setups &amp; payoffs</Label>
        <p class="text-muted-foreground mt-1 text-xs">
          Chekhov's Gun: earlier details — planted objects, promises, secrets — are tracked and
          resurface later as deliberate payoffs. Quiet World Events beats also plant new details
          when both are on. Applies from the next turn.
        </p>
      </div>
      <Switch
        id="chekhov-gun"
        checked={storySettings.chekhovGun ?? false}
        onCheckedChange={(v) => story.updateStorySettings({ chekhovGun: v ? true : undefined })}
      />
    </div>

    <div class="mt-4 flex items-center justify-between gap-4">
      <div>
        <Label for="gm-notebook" class="text-sm font-medium">GM's notebook</Label>
        <p class="text-muted-foreground mt-1 text-xs">
          A short list of continuity notes the engine keeps and shows the narrator every turn — who
          knows what, standing pretenses, open threads. Applies from the next turn.
        </p>
      </div>
      <Switch
        id="gm-notebook"
        checked={storySettings.gmNotebook ?? false}
        onCheckedChange={(v) => story.updateStorySettings({ gmNotebook: v ? true : undefined })}
      />
    </div>

    <div class="mt-4 flex items-center justify-between gap-4">
      <div>
        <Label for="npc-thoughts" class="text-sm font-medium">NPC inner voices</Label>
        <p class="text-muted-foreground mt-1 text-xs">
          The narrator may close a response with up to three characters' private thoughts, shown
          under the entry instead of inside the prose. Flavor only — never engine state.
        </p>
      </div>
      <Switch
        id="npc-thoughts"
        checked={storySettings.npcThoughts ?? false}
        onCheckedChange={(v) => story.updateStorySettings({ npcThoughts: v ? true : undefined })}
      />
    </div>

    {#if storySettings.beMode}
      <div class="mt-4 flex items-center justify-between gap-4">
        <div>
          <Label for="rpg-titles" class="text-sm font-medium">Earned titles</Label>
          <p class="text-muted-foreground mt-1 text-xs">
            Clear accomplishments earn titles ("Charmer", "Slayer") on the sheet; each grants +1 on
            the skills it covers. At most one per turn, eight in all.
          </p>
        </div>
        <Switch
          id="rpg-titles"
          checked={storySettings.rpgTitles ?? false}
          onCheckedChange={(v) => story.updateStorySettings({ rpgTitles: v ? true : undefined })}
        />
      </div>
    {/if}
  </div>

  <!-- ── RPG Display (Phase 5 W3) ─────────────────────────────────────────── -->
  {#if storySettings.beMode}
    <div class="border-t pt-4">
      <Label class="text-sm font-medium">RPG Display</Label>
      <p class="text-muted-foreground mt-1 mb-3 text-xs">
        Display-only — how much detail the roll card and turn log show. Does not affect the story or
        prompts.
      </p>
      <div class="space-y-3">
        <div>
          <Label class="text-muted-foreground mb-2 block text-xs">Roll-card detail</Label>
          <RadioGroup.Root
            value={storySettings.rpgRollCardVerbosity ?? 'full'}
            onValueChange={(v) =>
              story.updateStorySettings({
                rpgRollCardVerbosity: v === 'compact' ? 'compact' : undefined,
              })}
            class="grid grid-cols-2 gap-2"
          >
            {#each [{ value: 'full', label: 'Full', desc: 'd20 + bonus math' }, { value: 'compact', label: 'Compact', desc: 'result vs DC only' }] as opt (opt.value)}
              <Label
                for={`rpg-verbosity-${opt.value}`}
                class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-start justify-center gap-1 rounded-md border-2 p-3"
              >
                <RadioGroup.Item
                  value={opt.value}
                  id={`rpg-verbosity-${opt.value}`}
                  class="sr-only"
                />
                <span class="font-medium">{opt.label}</span>
                <span class="text-muted-foreground text-xs font-normal">{opt.desc}</span>
              </Label>
            {/each}
          </RadioGroup.Root>
        </div>
        <div>
          <Label class="text-muted-foreground mb-2 block text-xs">Turn-log length</Label>
          <RadioGroup.Root
            value={String(storySettings.rpgTurnLogLength ?? 30)}
            onValueChange={(v) =>
              story.updateStorySettings({
                rpgTurnLogLength: Number(v) === 30 ? undefined : Number(v),
              })}
            class="grid grid-cols-4 gap-2"
          >
            {#each ['20', '30', '50', '100'] as n (n)}
              <Label
                for={`rpg-loglen-${n}`}
                class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer items-center justify-center rounded-md border-2 p-2 text-sm"
              >
                <RadioGroup.Item value={n} id={`rpg-loglen-${n}`} class="sr-only" />
                {n}
              </Label>
            {/each}
          </RadioGroup.Root>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Post-History Instructions ────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <Label class="text-sm font-medium">Post-History Instructions</Label>
    <p class="text-muted-foreground mt-1 mb-3 text-xs">
      Directives injected after the story history, immediately before generation — the strongest
      position for steering style and behavior. Supports Liquid template variables.
    </p>
    <Textarea
      value={postHistoryDraft}
      oninput={(e) => {
        postHistoryDraft = (e.currentTarget as HTMLTextAreaElement).value
        postHistoryError = null
      }}
      class="min-h-[100px] font-mono text-xs"
      placeholder="e.g. Keep responses grounded in the current scene. Escalate tension gradually."
    />
    {#if postHistoryError}
      <p class="text-destructive mt-2 text-xs">✕ Syntax error: {postHistoryError}</p>
    {/if}
    {#if postHistoryDirty}
      <div class="mt-3 flex items-center justify-between gap-2">
        <p class="text-muted-foreground text-xs">Unsaved changes</p>
        <Button size="sm" onclick={savePostHistory}>Save</Button>
      </div>
    {/if}
  </div>

  <!-- ── Custom System Prompt ─────────────────────────────────────────────── -->
  <div class="border-t pt-4">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Label class="text-sm font-medium">Custom System Prompt</Label>
        {#if isActive}
          <span
            class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
          >
            Active
          </span>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={loadCurrentTemplate}>
          Load default template
        </Button>
        {#if isActive || customPromptDraft}
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            onclick={clearOverride}
          >
            Clear override
          </Button>
        {/if}
      </div>
    </div>

    <p class="text-muted-foreground mb-3 text-xs">
      Replaces the default pack template for this story only. Supports Liquid template variables.
      Changes take effect on the next generation — no restart needed.
    </p>

    <Textarea
      value={customPromptDraft}
      oninput={(e) => onDraftInput((e.currentTarget as HTMLTextAreaElement).value)}
      class="min-h-[200px] font-mono text-xs"
      placeholder={promptPlaceholder}
    />

    <!-- Validation status -->
    {#if customPromptDraft.trim()}
      <div class="mt-2 space-y-1">
        {#if validationResult === null}
          <p class="text-muted-foreground text-xs">Validating…</p>
        {:else if validationResult.success}
          <p class="text-xs text-green-600 dark:text-green-400">✓ Template is valid</p>
        {:else}
          <p class="text-destructive text-xs">✕ Syntax error: {validationResult.error}</p>
        {/if}

        {#if unknownVars.length > 0}
          <p class="text-xs text-amber-600 dark:text-amber-400">
            ⚠ Unknown variables (will render empty):
            {#each unknownVars as v, i (v)}
              <code class="font-mono">{v}</code>{i < unknownVars.length - 1 ? ', ' : ''}
            {/each}
            — these may be custom pack variables.
          </p>
        {/if}
      </div>
    {/if}

    <!-- Save / status row -->
    {#if isDirty}
      <div class="mt-3 flex items-center justify-between gap-2">
        <p class="text-muted-foreground text-xs">Unsaved changes</p>
        <Button size="sm" onclick={savePrompt} disabled={!canSave}>Save</Button>
      </div>
    {/if}

    <!-- Variable reference (collapsible) -->
    <div class="mt-4">
      <button
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
        onclick={() => (showVarReference = !showVarReference)}
        type="button"
      >
        <span>{showVarReference ? '▾' : '▸'}</span>
        Available template variables
      </button>

      {#if showVarReference}
        <div class="border-border mt-2 rounded-md border p-3 text-xs">
          {#each VARIABLE_REFERENCE as group (group.group)}
            <div class="mb-3 last:mb-0">
              <p
                class="text-muted-foreground mb-1 text-[0.65rem] font-semibold tracking-wide uppercase"
              >
                {group.group}
              </p>
              <div class="space-y-1">
                {#each group.vars as v (v.name)}
                  <div class="flex gap-2">
                    <code class="text-primary min-w-0 shrink-0 font-mono">{`{{ ${v.name} }}`}</code>
                    <span class="text-muted-foreground">{v.desc}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tips -->
    <div class="border-border mt-4 space-y-2 rounded-md border border-dashed p-3 text-xs">
      <p class="font-medium">Tips</p>
      <ul class="text-muted-foreground list-disc space-y-1 pl-4">
        <li>
          This override applies to this story only. The default pack template is untouched and used
          by all other stories.
        </li>
        <li>
          Custom pack variables (defined in Vault → Prompts) are also available here. They will
          appear in the unknown variable warning below, but that's expected — they're resolved at
          generation time and will work correctly.
        </li>
        <li>
          For more advanced use cases — multiple template variants or sharing prompts across stories
          — consider creating a <strong>custom prompt pack</strong> in the Vault instead.
        </li>
      </ul>
    </div>
  </div>
</div>
