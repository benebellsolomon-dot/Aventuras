<script lang="ts">
  // Harem sidebar tab (research/48 Step 9): present girls expanded, absent
  // girls as name rows, interleaved turn log below.
  import { readBodyState, bondOf, bondStance } from '$lib/services/be'
  import { story } from '$lib/stores/story.svelte'
  import GirlStatusCard from './GirlStatusCard.svelte'
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
      .filter((g) => g.state !== null),
  )

  const present = $derived(girls.filter((g) => presentNames.has(g.character.name.toLowerCase())))
  const absent = $derived(girls.filter((g) => !presentNames.has(g.character.name.toLowerCase())))
</script>

<div class="space-y-3">
  {#if girls.length === 0}
    <p class="text-muted-foreground text-sm">
      No tracked girls yet — body state seeds on a character's first transformation event.
    </p>
  {:else}
    {#each present as girl (girl.character.id)}
      <GirlStatusCard character={girl.character} state={girl.state!} />
    {/each}
    {#if absent.length > 0}
      <div>
        <div class="text-muted-foreground mb-1 text-xs tracking-wide uppercase">Elsewhere</div>
        {#each absent as girl (girl.character.id)}
          <div class="text-muted-foreground flex justify-between px-1 py-0.5 text-xs">
            <span>{girl.character.name}</span>
            <span>tier {girl.state!.tier} · {bondStance(bondOf(girl.state!))}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <TurnLogList />
</div>
