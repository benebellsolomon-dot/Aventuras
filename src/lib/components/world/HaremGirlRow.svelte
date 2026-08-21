<script lang="ts">
  // Collapsed harem roster row (research/53). Every body-state girl gets one —
  // present or not. Leads with cup · bust · mass (the glance data Ben wants);
  // tier is a tiny faint tag. Click toggles the expanded card. Present girls
  // carry an "in scene" heart and sort first (owned by HaremPanel).
  import { ChevronRight, Heart, UserRound } from 'lucide-svelte'
  import { bondOf, bondStance, cupLetter, measurements, type BodyState } from '$lib/services/be'
  import type { Character } from '$lib/types'
  import { createGirlSprite } from './girlSprite.svelte'

  interface Props {
    character: Character
    state: BodyState
    present: boolean
    expanded: boolean
    onToggle: () => void
  }

  let { character, state, present, expanded, onToggle }: Props = $props()

  const asImageUrl = (raw: string): string =>
    raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`

  const sprite = createGirlSprite(
    () => character,
    () => state,
  )
  const portrait = $derived(character.portrait ? asImageUrl(character.portrait) : null)

  const cup = $derived(cupLetter(state.tier))
  const m = $derived(measurements(state))
  const bond = $derived(bondOf(state))
</script>

<button
  type="button"
  class="border-border bg-card hover:border-border/70 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors"
  onclick={onToggle}
  aria-expanded={expanded}
>
  <!-- thumbnail: sprite cell → portrait → placeholder -->
  <div class="bg-muted relative h-[52px] w-10 shrink-0 overflow-hidden rounded-lg">
    {#if sprite.url}
      {#key sprite.cellKey}
        <img
          src={sprite.url}
          alt={character.name}
          class="absolute inset-0 h-full w-full object-cover object-top"
        />
      {/key}
    {:else if portrait}
      <img
        src={portrait}
        alt={character.name}
        class="absolute inset-0 h-full w-full object-cover object-top"
      />
    {:else}
      <div class="text-muted-foreground flex h-full w-full items-center justify-center">
        <UserRound class="h-5 w-5" />
      </div>
    {/if}
  </div>

  <div class="min-w-0 flex-1">
    <div class="flex items-baseline justify-between gap-2">
      <span class="flex items-center gap-1.5 font-medium">
        {character.name}
        {#if present}
          <Heart class="h-3 w-3 fill-rose-400/80 text-rose-400" aria-label="in scene" />
        {/if}
      </span>
      <span class="text-muted-foreground/70 text-[10px] whitespace-nowrap">tier {state.tier}</span>
    </div>
    <div class="mt-0.5 text-[12px]">
      <span class="font-medium text-rose-300">{cup}-cup</span>
      <span class="text-muted-foreground"
        >· {Math.round(m.bustCm)} cm · {m.nowTotalKg.toFixed(1)} kg</span
      >
    </div>
    <div class="mt-1">
      <span
        class="rounded-full border px-2 py-0.5 text-[10px] {bond < 0
          ? 'border-red-700/60 text-red-400'
          : 'border-emerald-700/60 text-emerald-400'}"
      >
        bond {bondStance(bond)} · {bond > 0 ? '+' : ''}{bond}
      </span>
    </div>
  </div>

  <ChevronRight
    class="text-muted-foreground/60 h-4 w-4 shrink-0 transition-transform {expanded
      ? 'rotate-90'
      : ''}"
  />
</button>
