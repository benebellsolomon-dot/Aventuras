<script lang="ts">
  import type { PresetPack } from '$lib/services/packs/types'
  import { packService } from '$lib/services/packs/pack-service'
  import { BUNDLED_PACKS } from '$lib/services/packs/bundled'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import * as RadioGroup from '$lib/components/ui/radio-group'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'

  interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreated: (pack: PresetPack) => void
  }

  let { open, onOpenChange, onCreated }: Props = $props()

  let name = $state('')
  let description = $state('')
  let author = $state('')
  let creating = $state(false)
  // 'default' = blank copy of baseline templates; otherwise a bundleId
  let baseSelection = $state('default')

  let canCreate = $derived(name.trim().length > 0 && !creating)

  function resetForm() {
    name = ''
    description = ''
    author = ''
    creating = false
    baseSelection = 'default'
  }

  function onBaseChange(value: string) {
    baseSelection = value
    const bundle = BUNDLED_PACKS.find((b) => b.bundleId === value)
    // Prefill the name from the bundle if the user hasn't typed one
    if (bundle && !name.trim()) {
      name = bundle.name
    }
  }

  function handleOpenChange(value: boolean) {
    if (!value) {
      resetForm()
    }
    onOpenChange(value)
  }

  async function handleCreate() {
    if (!canCreate) return

    creating = true
    try {
      const pack =
        baseSelection === 'default'
          ? await packService.createPack(
              name.trim(),
              description.trim() || undefined,
              author.trim() || undefined,
            )
          : await packService.createBundledPack(baseSelection, name.trim())
      resetForm()
      onCreated(pack)
      onOpenChange(false)
    } catch (error) {
      console.error('[CreatePackDialog] Failed to create pack:', error)
      creating = false
    }
  }
</script>

<ResponsiveModal.Root {open} onOpenChange={handleOpenChange}>
  <ResponsiveModal.Content class="p-0 sm:max-w-md">
    <ResponsiveModal.Header class="border-b px-6 py-4">
      <ResponsiveModal.Title>Create Prompt Pack</ResponsiveModal.Title>
      <ResponsiveModal.Description>
        New packs start as a copy of the default templates. You can customize them after creation.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex flex-col gap-4 px-6 py-4">
      <div class="flex flex-col gap-2">
        <Label>Start from</Label>
        <RadioGroup.Root
          value={baseSelection}
          onValueChange={onBaseChange}
          class="flex flex-col gap-2"
        >
          <Label
            for="pack-base-default"
            class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col gap-1 rounded-md border-2 p-3"
          >
            <RadioGroup.Item value="default" id="pack-base-default" class="sr-only" />
            <span class="text-sm font-medium">Default Templates</span>
            <span class="text-muted-foreground text-xs font-normal">
              A clean copy of the built-in prompt templates
            </span>
          </Label>
          {#each BUNDLED_PACKS as bundle (bundle.bundleId)}
            <Label
              for={`pack-base-${bundle.bundleId}`}
              class="border-muted bg-popover hover:bg-accent hover:text-accent-foreground has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 flex cursor-pointer flex-col gap-1 rounded-md border-2 p-3"
            >
              <RadioGroup.Item
                value={bundle.bundleId}
                id={`pack-base-${bundle.bundleId}`}
                class="sr-only"
              />
              <span class="text-sm font-medium">{bundle.name}</span>
              <span class="text-muted-foreground text-xs font-normal">{bundle.description}</span>
            </Label>
          {/each}
        </RadioGroup.Root>
      </div>

      <div class="flex flex-col gap-2">
        <Label for="pack-name">Name <span class="text-destructive">*</span></Label>
        <Input id="pack-name" bind:value={name} placeholder="My Custom Pack" />
      </div>

      {#if baseSelection === 'default'}
        <div class="flex flex-col gap-2">
          <Label for="pack-description">Description</Label>
          <p class="text-muted-foreground text-xs">Supports Markdown and HTML</p>
          <Textarea
            id="pack-description"
            bind:value={description}
            placeholder="A brief description of this pack..."
            rows={3}
          />
        </div>

        <div class="flex flex-col gap-2">
          <Label for="pack-author">Author</Label>
          <Input id="pack-author" bind:value={author} placeholder="Your name" />
        </div>
      {:else}
        <p class="text-muted-foreground text-xs">
          Description and author come from the selected starter pack. You can edit everything after
          creation.
        </p>
      {/if}
    </div>

    <ResponsiveModal.Footer class="border-t px-6 py-4">
      <Button variant="outline" onclick={() => handleOpenChange(false)}>Cancel</Button>
      <Button onclick={handleCreate} disabled={!canCreate}>
        {#if creating}
          Creating...
        {:else}
          Create
        {/if}
      </Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
