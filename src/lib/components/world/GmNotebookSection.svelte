<script lang="ts">
  // E5 GM's Notebook, read-only view (research/65 deferred UI): the notes the
  // classifier keeps on the protagonist's metadata and the narrator sees as
  // [GM NOTES]. Markup only — reading/sanitizing lives in worldsim/notebook.ts.
  // No edit/pin: the engine owns the notebook; the player steers it by playing.
  import { ChevronDown, NotebookPen, Pin, Waypoints } from 'lucide-svelte'
  import { story } from '$lib/stores/story.svelte'
  import { readGmNotebook, type GmNote } from '$lib/services/worldsim'

  const enabled = $derived(story.currentStory?.settings?.gmNotebook === true)
  const protagonist = $derived(story.characters.find((c) => c.relationship === 'self') ?? null)
  const notes = $derived.by<ReadonlyArray<GmNote>>(() => {
    if (!enabled || !protagonist) return []
    return readGmNotebook(protagonist.metadata)?.notes ?? []
  })
  let open = $state(false)

  const ageLabel = (age: number) =>
    age <= 0 ? 'this turn' : age === 1 ? '1 turn ago' : `${age} turns ago`
</script>

{#if enabled}
  <div class="border-border/50 mt-4 border-t pt-3">
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 text-xs tracking-wide uppercase transition-colors"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <NotebookPen class="h-3.5 w-3.5" />
      <span>GM's notebook</span>
      <span class="font-normal normal-case">({notes.length})</span>
      <ChevronDown class="ml-auto h-3.5 w-3.5 transition-transform {open ? 'rotate-180' : ''}" />
    </button>
    {#if open}
      {#if notes.length === 0}
        <p class="text-muted-foreground mt-2 text-xs">
          Empty — the engine jots continuity notes here as you play (read-only).
        </p>
      {:else}
        <ul class="mt-2 space-y-1.5">
          {#each notes as note (note.id)}
            <li class="flex items-start gap-1.5 text-xs" title={note.kind}>
              {#if note.kind === 'reminder'}
                <Pin class="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
              {:else}
                <Waypoints class="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
              {/if}
              <span class="min-w-0 flex-1">
                <span class="text-foreground">{note.text}</span>
                <span class="text-muted-foreground/70"> · {ageLabel(note.age)}</span>
              </span>
            </li>
          {/each}
        </ul>
        <p class="text-muted-foreground/70 mt-2 text-[11px]">
          Pinned = standing reminder; waypoints = open thread. Read-only — the narrator sees these
          every turn; steer them by playing.
        </p>
      {/if}
    {/if}
  </div>
{/if}
