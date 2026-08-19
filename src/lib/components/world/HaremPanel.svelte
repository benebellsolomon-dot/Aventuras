<script lang="ts">
  // Harem sidebar tab (research/48 Step 9; research/53 gallery). EVERY girl with
  // body state renders as a visual row — present or not. Presence is a badge +
  // present-first sort, NOT a gate (the V2d card was invisible because it gated
  // the visual card on scene-presence, and the classifier returns empty present
  // names). Rows expand in place into the full portrait card.
  import { SvelteSet } from 'svelte/reactivity'
  import { readBodyState } from '$lib/services/be'
  import { story } from '$lib/stores/story.svelte'
  import GirlStatusCard from './GirlStatusCard.svelte'
  import HaremGirlRow from './HaremGirlRow.svelte'
  import TurnLogList from './TurnLogList.svelte'

  const presentNames = $derived.by(() => {
    for (let i = story.entries.length - 1; i >= 0; i--) {
      const delta = story.entries[i].worldStateDelta
      const result = delta?.classificationResult as
        | { scene?: { presentCharacterNames?: string[] } }
        | undefined
      const names = result?.scene?.presentCharacterNames
      if (names) return new Set(names.map((n) => n.trim().toLowerCase()))
    }
    return new Set<string>()
  })

  const girls = $derived(
    story.characters
      .filter((c) => c.relationship !== 'self')
      .map((c) => ({ character: c, state: readBodyState(c.metadata) }))
      .filter((g) => g.state !== null)
      .map((g) => ({ ...g, present: presentNames.has(g.character.name.toLowerCase()) }))
      // Present girls first; original order preserved within each group (stable sort).
      .sort((a, b) => Number(b.present) - Number(a.present)),
  )

  const expanded = new SvelteSet<string>()
  function toggle(id: string) {
    if (expanded.has(id)) expanded.delete(id)
    else expanded.add(id)
  }
</script>

<div class="space-y-3">
  {#if girls.length === 0}
    <p class="text-muted-foreground text-sm">
      No tracked girls yet — body state seeds on a character's first transformation event.
    </p>
  {:else}
    <div class="space-y-2">
      {#each girls as girl (girl.character.id)}
        {#if expanded.has(girl.character.id)}
          <GirlStatusCard
            character={girl.character}
            state={girl.state!}
            present={girl.present}
            onCollapse={() => toggle(girl.character.id)}
          />
        {:else}
          <HaremGirlRow
            character={girl.character}
            state={girl.state!}
            present={girl.present}
            expanded={false}
            onToggle={() => toggle(girl.character.id)}
          />
        {/if}
      {/each}
    </div>
  {/if}

  <TurnLogList />
</div>
