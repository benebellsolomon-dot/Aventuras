<script lang="ts">
  // Harem tab girl card (research/48 Step 9). Read-only glance surface — the
  // full editor stays BeStatePanel in the Characters tab (no duplicate writer).
  // research/52 (V2d): now leads with a body-state sprite thumbnail.
  import { Lock, TrendingUp, UserRound } from 'lucide-svelte'
  import {
    bondOf,
    bondStance,
    dependenceOf,
    dependenceStage,
    isEngorged,
    lactationOf,
    QUIRK_BY_ID,
    readQuirks,
    selectSprite,
    sizingString,
    supplyMeter,
    type BodyState,
  } from '$lib/services/be'
  import { spriteAnchorService } from '$lib/services/ai/image/SpriteService'
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import type { Character } from '$lib/types'

  interface Props {
    character: Character
    state: BodyState
  }

  // Bind the `state` prop as `bodyState`: the `$state` rune below collides with a
  // local binding literally named `state`. External prop name is unchanged, so
  // HaremPanel keeps passing `state={...}`.
  let { character, state: bodyState }: Props = $props()

  const asImageUrl = (raw: string): string =>
    raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`

  // ---- Visual companion (research/52 V2d): a body-state sprite reflecting her
  // current bust/body state, chosen by the SAME selectSprite the VN stage uses
  // so card/prompt/stage never disagree. Fallback chain mirrors VnView:
  // current cell → character.portrait → placeholder. The last complete cell is
  // held while a band lazily regenerates, so state swaps crossfade, not blank.
  let spriteUrl = $state<string | null>(null)
  let spriteCellKey = $state<string | null>(null)

  async function refreshSprite(): Promise<void> {
    if (story.currentStory?.settings?.beMode !== true || !story.currentStory) return
    const selection = selectSprite(bodyState)
    const sprite = await spriteAnchorService.ensureSprite(
      character,
      story.currentStory.id,
      selection,
    )
    if (sprite?.status === 'complete' && sprite.imageData) {
      const cellKey = `${sprite.bandIndex}:${sprite.expression}:${sprite.engorged}`
      if (spriteCellKey !== cellKey) {
        spriteUrl = sprite.imageData
        spriteCellKey = cellKey
      }
    }
  }

  // Re-runs when bodyState changes (tier/band, engorged, growth, arousal, attitude).
  $effect(() => {
    void refreshSprite()
  })

  // Completion push: a lazily-generated cell finishing for THIS girl swaps her in.
  $effect(() =>
    spriteAnchorService.subscribe((characterId) => {
      if (characterId === character.id) void refreshSprite()
    }),
  )

  const portrait = $derived(character.portrait ? asImageUrl(character.portrait) : null)

  const bond = $derived(bondOf(bodyState))
  const dependence = $derived(dependenceOf(bodyState))
  // Lactation is opt-in state: a girl who has never been induced shows nothing
  // at all here (research/49 Step 8 — no "not lactating" noise on every card).
  const lactation = $derived(lactationOf(bodyState))
  // Straight from the engine (research/49 R6), not from the condition label:
  // the condition carries a TTL and lags her actual fill, so reading the label
  // let the card, the prompt block and the sprite disagree about one girl.
  const engorged = $derived(isEngorged(bodyState))
  const milk = $derived(lactation?.active ? supplyMeter(lactation.supplyTier, engorged) : null)
  const quirks = $derived(
    readQuirks(bodyState)
      .map((id) => QUIRK_BY_ID.get(id))
      .filter((def) => def !== undefined),
  )
</script>

<div class="border-border bg-card flex gap-3 rounded-lg border px-3 py-2.5">
  <!-- Visual companion: body-state sprite (research/52). Bust/face crop of the
       bottom-anchored standee; crossfades on cell change; graceful fallback. -->
  <div class="bg-muted relative h-[74px] w-14 shrink-0 self-start overflow-hidden rounded-md">
    {#if spriteUrl}
      {#key spriteCellKey}
        <img
          src={spriteUrl}
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
        <UserRound class="h-6 w-6" />
      </div>
    {/if}
  </div>

  <div class="min-w-0 flex-1">
    <div class="flex items-baseline justify-between gap-2">
      <button
        class="text-foreground hover:text-primary flex items-center gap-1.5 font-medium transition-colors"
        title="Open in Characters"
        onclick={() => ui.setSidebarTab('characters')}
      >
        <UserRound class="text-muted-foreground h-3.5 w-3.5" />
        {character.name}
      </button>
      <span class="text-muted-foreground text-xs">
        {sizingString(bodyState.tier)} · tier {bodyState.tier}
        {#if bodyState.lastGrowth}
          <TrendingUp class="inline h-3 w-3 text-emerald-400" />
        {/if}
        {#if bodyState.locked}
          <Lock class="inline h-3 w-3 text-red-400" />
        {/if}
      </span>
    </div>

    <div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {#if bodyState.attitude}<span class="italic">{bodyState.attitude}</span>{/if}
      <span>bond <b class="text-emerald-400">{bondStance(bond)}</b> ({bond})</span>
      {#if dependence > 0}
        <span
          >dependence <b class="text-amber-400">{dependenceStage(dependence)}</b>
          ({dependence})</span
        >
      {/if}
    </div>

    <!-- Fluid fill meter -->
    <div class="bg-muted mt-1.5 h-1.5 overflow-hidden rounded">
      <div
        class="h-full rounded bg-pink-400/80"
        style="width: {bodyState.fluids.fillPercent}%"
      ></div>
    </div>
    <div class="text-muted-foreground mt-0.5 text-[10px]">
      {Math.round(bodyState.fluids.fillPercent)}% full
    </div>

    <!-- Milk meter — active girls only -->
    {#if milk}
      <div class="mt-1.5 flex items-center gap-2">
        <span class="text-muted-foreground text-[10px] whitespace-nowrap">milk · {milk.label}</span>
        <div class="bg-muted h-1.5 flex-1 overflow-hidden rounded">
          <div class="h-full rounded {milk.tint}" style="width: {milk.percent}%"></div>
        </div>
        {#if engorged}
          <span class="text-[10px] text-amber-400">engorged</span>
        {/if}
      </div>
    {/if}

    {#if quirks.length > 0 || bodyState.conditions.length > 0}
      <div class="mt-1.5 flex flex-wrap gap-1">
        {#each quirks as quirk (quirk.id)}
          <span
            class="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]"
            title={quirk.blurb}>{quirk.label}</span
          >
        {/each}
        {#each bodyState.conditions as condition (condition.label)}
          <span
            class="rounded-full border px-2 py-0.5 text-[10px] {condition.label.toLowerCase() ===
            'withdrawal'
              ? 'border-amber-500/50 text-amber-400'
              : 'border-border text-muted-foreground'}"
            title={condition.note ?? ''}>{condition.label}</span
          >
        {/each}
      </div>
    {/if}
  </div>
</div>
