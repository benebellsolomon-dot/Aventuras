<script lang="ts">
  import * as RadioGroup from '$lib/components/ui/radio-group'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import { Input } from '$lib/components/ui/input'
  import { Switch } from '$lib/components/ui/switch'
  import { BookOpen, User, Eye } from 'lucide-svelte'
  import type { POV, Tense } from '$lib/types'

  interface Props {
    selectedPOV: POV
    selectedTense: Tense
    tone: string
    visualProseMode: boolean
    imageGenerationEnabled: boolean
    imageGenerationMode: 'none' | 'agentic' | 'inline'
    backgroundImagesEnabled: boolean
    referenceMode: boolean
    beMode: boolean
    /** This story's transformation fluid (BE engine seed source). Input shown only when provided. */
    beFluidType?: string
    /** What drives growth in this world — threaded into classifier + narrator (research/41). */
    beGrowthCosmology?: string
    /** Free-text pacing note interpolated into the BE genre rules. */
    bePacingFlavor?: string
    /** Growth-eligible event kinds; empty = every kind may land growth. */
    beGrowthEligibleKinds?: string[]
    onPOVChange: (v: POV) => void
    onTenseChange: (v: Tense) => void
    onToneChange: (v: string) => void
    onVisualProseModeChange: (v: boolean) => void
    onImageGenerationModeChange: (v: 'none' | 'agentic' | 'inline') => void
    onBackgroundImagesEnabledChange: (v: boolean) => void
    onReferenceModeChange: (v: boolean) => void
    onBeModeChange: (v: boolean) => void
    onBeFluidTypeChange?: (v: string) => void
    onBeGrowthCosmologyChange?: (v: string) => void
    onBePacingFlavorChange?: (v: string) => void
    onBeGrowthEligibleKindsChange?: (v: string[]) => void
    disabledFields?: {
      pov?: boolean
      tense?: boolean
      visualProseMode?: boolean
    }
    disabledReason?: string
  }

  let {
    selectedPOV,
    selectedTense,
    tone,
    visualProseMode,
    imageGenerationEnabled,
    imageGenerationMode,
    backgroundImagesEnabled,
    referenceMode,
    beMode,
    beFluidType,
    beGrowthCosmology,
    bePacingFlavor,
    beGrowthEligibleKinds,
    onPOVChange,
    onTenseChange,
    onToneChange,
    onVisualProseModeChange,
    onImageGenerationModeChange,
    onBackgroundImagesEnabledChange,
    onReferenceModeChange,
    onBeModeChange,
    onBeFluidTypeChange,
    onBeGrowthCosmologyChange,
    onBePacingFlavorChange,
    onBeGrowthEligibleKindsChange,
    disabledFields,
    disabledReason,
  }: Props = $props()

  const GROWTH_KIND_CHOICES = [
    { value: 'catalyst', label: 'Catalyst', hint: "this world's growth driver" },
    { value: 'contact', label: 'Contact', hint: 'intimate escalation' },
    { value: 'attempt', label: 'Attempt', hint: 'explicit growth attempts' },
  ] as const

  // Local draft, not the prop: updateStorySettings resolves async, so a second
  // quick toggle would read a stale prop and clobber the first (the same
  // two-write-source shape customPromptDraft documents in story-settings).
  let growthKindsTouched = $state(false)
  let growthKindsDraft = $state<string[]>([])
  const growthKinds = $derived(
    growthKindsTouched ? growthKindsDraft : (beGrowthEligibleKinds ?? []),
  )

  // Silent dead-end guard: growth restricted to catalyst-only WITHOUT a cosmology
  // means the classifier never learns what a catalyst is, so no growth event ever
  // fires and characters stay frozen at their seed tier. (Contact/Attempt fire from
  // prose without a cosmology, so a set that includes them is safe.)
  const growthDeadEnd = $derived(
    beMode &&
      !(beGrowthCosmology ?? '').trim() &&
      growthKinds.length > 0 &&
      growthKinds.every((k) => k === 'catalyst'),
  )

  function toggleGrowthKind(kind: string, enabled: boolean) {
    if (!onBeGrowthEligibleKindsChange) return
    const known = growthKinds.filter((k) => GROWTH_KIND_CHOICES.some((c) => c.value === k))
    const next = enabled
      ? known.includes(kind)
        ? known
        : [...known, kind]
      : known.filter((k) => k !== kind)
    growthKindsTouched = true
    growthKindsDraft = next
    onBeGrowthEligibleKindsChange(next)
  }
</script>

<div class="space-y-4">
  <!-- Narrative Config -->
  <section class="grid gap-4 sm:gap-8 md:grid-cols-2">
    <!-- Perspective -->
    <div
      class="space-y-1"
      class:opacity-50={disabledFields?.pov}
      class:pointer-events-none={disabledFields?.pov}
    >
      <Label class="flex items-center gap-2 text-base font-semibold">
        <User class="h-4 w-4" />
        Perspective
      </Label>
      <RadioGroup.Root
        value={selectedPOV}
        onValueChange={(v) => onPOVChange(v as POV)}
        class="grid grid-cols-3 gap-2"
        disabled={disabledFields?.pov}
      >
        {#each ['first', 'second', 'third'] as pov (pov)}
          <Label
            for={`pov-${pov}`}
            class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 p-3 text-center"
          >
            <RadioGroup.Item
              value={pov}
              id={`pov-${pov}`}
              class="sr-only"
              disabled={disabledFields?.pov}
            />
            <span class="font-medium capitalize">{pov}</span>
          </Label>
        {/each}
      </RadioGroup.Root>
      <p class="text-muted-foreground h-4 text-xs">
        {#if selectedPOV === 'first'}
          "I draw my sword..."
        {:else if selectedPOV === 'second'}
          "You draw your sword..."
        {:else}
          "He/She/They draw their sword..."
        {/if}
      </p>
      {#if disabledFields?.pov && disabledReason}
        <p class="text-muted-foreground/70 text-xs italic">{disabledReason}</p>
      {/if}
    </div>

    <!-- Tense -->
    <div
      class="space-y-1"
      class:opacity-50={disabledFields?.tense}
      class:pointer-events-none={disabledFields?.tense}
    >
      <Label class="flex items-center gap-2 text-base font-semibold">
        <BookOpen class="h-4 w-4" />
        Tense
      </Label>
      <RadioGroup.Root
        value={selectedTense}
        onValueChange={(v) => onTenseChange(v as Tense)}
        class="grid grid-cols-2 gap-2"
        disabled={disabledFields?.tense}
      >
        {#each ['present', 'past'] as tense (tense)}
          <Label
            for={`tense-${tense}`}
            class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 p-3 text-center"
          >
            <RadioGroup.Item
              value={tense}
              id={`tense-${tense}`}
              class="sr-only"
              disabled={disabledFields?.tense}
            />
            <span class="font-medium capitalize">{tense}</span>
          </Label>
        {/each}
      </RadioGroup.Root>
      <p class="text-muted-foreground h-4 text-xs">
        {#if selectedTense === 'present'}
          Action happens now.
        {:else}
          Action happened in the past.
        {/if}
      </p>
      {#if disabledFields?.tense && disabledReason}
        <p class="text-muted-foreground/70 text-xs italic">{disabledReason}</p>
      {/if}
    </div>
  </section>

  <!-- Tone -->
  <section class="space-y-2 pt-1">
    <div class="grid w-full items-center gap-2">
      <Input
        label="Narrative Tone"
        id="tone"
        value={tone}
        oninput={(e) => onToneChange(e.currentTarget.value)}
        placeholder="e.g. Dark and gritty, Whimsical, Clinical"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      {#each ['Dark Fantasy', 'High Adventure', 'Cozy', 'Horror', 'Cyberpunk', 'Mystery'] as t (t)}
        <Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => onToneChange(t)}>
          {t}
        </Button>
      {/each}
    </div>
  </section>

  <!-- Visuals Configuration -->
  {#if imageGenerationEnabled}
    <section class="space-y-2 pt-1">
      <Label class="flex items-center gap-2 text-base font-semibold">
        <Eye class="h-4 w-4" />
        Visual Experience
      </Label>

      <RadioGroup.Root
        value={imageGenerationMode}
        onValueChange={(v) => onImageGenerationModeChange(v as 'none' | 'agentic' | 'inline')}
        class="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <!-- No Images -->
        <div class="relative">
          <Label
            for="img-none"
            class="border-muted bg-popover hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex h-full cursor-pointer flex-col justify-between rounded-xl border-2 p-4"
          >
            <div class="mb-2 flex w-full items-start justify-between">
              <span class="font-semibold">Text Only</span>
              <RadioGroup.Item value="none" id="img-none" class="sr-only" />
            </div>
            <div class="text-muted-foreground text-xs font-normal">
              Pure text adventure. No images will be generated.
            </div>
          </Label>
        </div>

        <!-- Agent Mode -->
        <div class="relative">
          <Label
            for="img-auto"
            class="border-muted bg-popover hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex h-full cursor-pointer flex-col justify-between rounded-xl border-2 p-4"
          >
            <div class="mb-2 flex w-full items-start justify-between">
              <span class="font-semibold">Agent Mode</span>
              <RadioGroup.Item value="agentic" id="img-auto" class="sr-only" />
            </div>
            <div class="text-muted-foreground text-xs font-normal">
              AI decides when to generate images based on the story.
            </div>
          </Label>
        </div>

        <!-- Inline Mode -->
        <div class="relative">
          <Label
            for="img-inline"
            class="border-muted bg-popover hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex h-full cursor-pointer flex-col justify-between rounded-xl border-2 p-4"
          >
            <div class="mb-2 flex w-full items-start justify-between">
              <span class="font-semibold">Inline Mode</span>
              <RadioGroup.Item value="inline" id="img-inline" class="sr-only" />
            </div>
            <div class="text-muted-foreground text-xs font-normal">
              Images are embedded directly in the text flow.
            </div>
          </Label>
        </div>
      </RadioGroup.Root>

      <!-- Extra Image Toggles -->
      <div class="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
        <div class="flex items-center space-x-2">
          <Switch
            id="bg-images"
            checked={backgroundImagesEnabled}
            onCheckedChange={onBackgroundImagesEnabledChange}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="bg-images">Background Images</Label>
            <p class="text-muted-foreground text-xs">
              Generate immersive background images for scenes.
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <Switch
            id="reference-mode"
            checked={referenceMode}
            onCheckedChange={onReferenceModeChange}
          />
          <div class="grid gap-1.5 leading-none">
            <Label for="reference-mode">Portrait Reference Mode</Label>
            <p class="text-muted-foreground text-xs">
              Use character portraits as visual references.
            </p>
          </div>
        </div>
      </div>
    </section>
  {/if}

  <!-- Body Transformation Engine -->
  <section class="space-y-2 pt-1">
    <div class="flex items-center space-x-2 py-4">
      <Switch id="be-mode" checked={beMode} onCheckedChange={onBeModeChange} />
      <div class="grid gap-1.5 leading-none">
        <Label for="be-mode">Body Transformation Engine</Label>
        <p class="text-muted-foreground text-xs">
          Track character body state mechanically: transformation events, deterministic growth
          resolution, and size-grounded narration and images.
        </p>
      </div>
    </div>
    {#if beMode && onBeFluidTypeChange}
      <div class="grid w-full items-center gap-2 pb-2">
        <Input
          label="Transformation Fluid"
          id="be-fluid-type"
          value={beFluidType ?? ''}
          oninput={(e) => onBeFluidTypeChange(e.currentTarget.value)}
          placeholder="milk (this story's fluid — used when seeding new body states)"
        />
      </div>
    {/if}
    {#if beMode && onBeGrowthCosmologyChange}
      <div class="grid w-full items-center gap-2 pb-2">
        <Input
          label="Growth Cosmology"
          id="be-growth-cosmology"
          value={beGrowthCosmology ?? ''}
          oninput={(e) => onBeGrowthCosmologyChange(e.currentTarget.value)}
          placeholder="what drives growth in this world (e.g. 'only her partner's climax inside her')"
        />
        <p class="text-muted-foreground text-xs">
          Teaches the classifier what counts as this story's growth catalyst and gives the narrator
          the mechanism to flavor growth scenes with.
        </p>
      </div>
    {/if}
    {#if beMode && onBePacingFlavorChange}
      <div class="grid w-full items-center gap-2 pb-2">
        <Input
          label="Pacing Flavor"
          id="be-pacing-flavor"
          value={bePacingFlavor ?? ''}
          oninput={(e) => onBePacingFlavorChange(e.currentTarget.value)}
          placeholder="e.g. 'slow-burn, savoring each stage' (optional narration pacing note)"
        />
      </div>
    {/if}
    {#if beMode && onBeGrowthEligibleKindsChange}
      <div class="grid w-full items-center gap-2 pb-2">
        <Label>Growth-Eligible Events</Label>
        <p class="text-muted-foreground text-xs">
          Which event kinds may land growth. Leave all off to let every kind roll; turn some on to
          restrict growth to those kinds (e.g. catalyst-only for strict-cosmology stories).
        </p>
        {#each GROWTH_KIND_CHOICES as choice (choice.value)}
          <div class="flex items-center space-x-2">
            <Switch
              id={`be-growth-kind-${choice.value}`}
              checked={growthKinds.includes(choice.value)}
              onCheckedChange={(v) => toggleGrowthKind(choice.value, v)}
            />
            <Label for={`be-growth-kind-${choice.value}`} class="font-normal">
              {choice.label}
              <span class="text-muted-foreground">— {choice.hint}</span>
            </Label>
          </div>
        {/each}
        {#if growthDeadEnd}
          <p class="pt-1 text-xs font-medium text-amber-500">
            ⚠ Growth is restricted to <strong>Catalyst</strong> events, but no Growth Cosmology is set
            above — the classifier won't know what counts as a catalyst, so growth will never fire and
            characters stay their starting size. Add a Growth Cosmology, or also enable Contact / Attempt.
          </p>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Visual Prose Styling -->
  <section class="space-y-2 pt-1">
    <div
      class="flex items-center space-x-2 py-4"
      class:opacity-50={disabledFields?.visualProseMode}
      class:pointer-events-none={disabledFields?.visualProseMode}
    >
      <Switch
        id="visual-prose"
        checked={visualProseMode}
        onCheckedChange={onVisualProseModeChange}
        disabled={disabledFields?.visualProseMode}
      />
      <div class="grid gap-1.5 leading-none">
        <Label for="visual-prose">Visual Prose Styling</Label>
        <p class="text-muted-foreground text-xs">
          Enable rich text formatting (colors, fonts) for dialogue and actions.
        </p>
        {#if disabledFields?.visualProseMode && disabledReason}
          <p class="text-muted-foreground/70 text-xs italic">{disabledReason}</p>
        {/if}
      </div>
    </div>
  </section>
</div>
