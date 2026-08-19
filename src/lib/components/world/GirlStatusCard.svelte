<script lang="ts">
  // Expanded harem card (research/53). The full portrait + cup/measurements +
  // affection/BE meters view for one girl. Rendered when her row is expanded in
  // HaremPanel; the collapsed form is HaremGirlRow. Read-only glance surface —
  // the full editor stays BeStatePanel in the Characters tab.
  import { ChevronDown, Heart, Lock, TrendingUp, UserRound } from 'lucide-svelte'
  import {
    bondOf,
    bondStance,
    dependenceOf,
    dependenceStage,
    fluidPressureLabel,
    isEngorged,
    lactationOf,
    QUIRK_BY_ID,
    readQuirks,
    selectSprite,
    supplyMeter,
    type BodyState,
  } from '$lib/services/be'
  import type { Character } from '$lib/types'
  import { createGirlSprite } from './girlSprite.svelte'
  import SizeBlock from './SizeBlock.svelte'

  interface Props {
    character: Character
    state: BodyState
    present: boolean
    onCollapse: () => void
  }

  let { character, state, present, onCollapse }: Props = $props()

  const asImageUrl = (raw: string): string =>
    raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`

  const sprite = createGirlSprite(
    () => character,
    () => state,
  )
  const portrait = $derived(character.portrait ? asImageUrl(character.portrait) : null)

  const bond = $derived(bondOf(state))
  const dependence = $derived(dependenceOf(state))
  const engorged = $derived(isEngorged(state))
  const lactation = $derived(lactationOf(state))
  const milk = $derived(lactation?.active ? supplyMeter(lactation.supplyTier, engorged) : null)
  const firmness = $derived(fluidPressureLabel(state.fluids.fillPercent))
  // Same expression selection the sprite uses — the state caption never disagrees.
  const expression = $derived(selectSprite(state).expression)
  const quirks = $derived(
    readQuirks(state)
      .map((id) => QUIRK_BY_ID.get(id))
      .filter((def) => def !== undefined),
  )
</script>

<div class="border-border/80 bg-card overflow-hidden rounded-xl border">
  <div class="flex">
    <!-- Portrait: sprite cell → portrait → placeholder -->
    <div class="bg-muted border-border relative aspect-[3/4] w-[132px] shrink-0 border-r">
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
          <UserRound class="h-8 w-8" />
        </div>
      {/if}
      <span
        class="text-muted-foreground/90 absolute top-1.5 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9.5px]"
      >
        tier {state.tier}
        {#if state.locked}<Lock class="inline h-2.5 w-2.5 text-red-400" />{/if}
      </span>
      <span
        class="absolute bottom-1.5 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-neutral-200"
      >
        {expression}{#if engorged}
          · engorged{/if}
      </span>
    </div>

    <div class="min-w-0 flex-1 px-3 py-2">
      <button
        type="button"
        class="hover:text-primary flex w-full items-baseline justify-between gap-2 text-left transition-colors"
        onclick={onCollapse}
        aria-expanded="true"
      >
        <span class="flex items-center gap-1.5 font-medium">
          {character.name}
          {#if present}
            <Heart class="h-3 w-3 fill-rose-400/80 text-rose-400" aria-label="in scene" />
          {/if}
        </span>
        <ChevronDown class="text-muted-foreground/60 h-4 w-4 shrink-0" />
      </button>
      {#if state.attitude}
        <div class="text-muted-foreground -mt-0.5 text-[11px] italic">{state.attitude}</div>
      {/if}

      <SizeBlock {state} />
    </div>
  </div>

  <!-- Meters -->
  <div class="space-y-1.5 px-3 pt-1.5 pb-2">
    <div>
      <div class="text-muted-foreground flex justify-between text-[11px]">
        <span>bond</span><span class="text-foreground">{bondStance(bond)} · {bond}</span>
      </div>
      <div class="bg-muted mt-0.5 h-1.5 overflow-hidden rounded">
        <div class="h-full rounded bg-emerald-400" style="width: {bond}%"></div>
      </div>
    </div>

    {#if dependence > 0}
      <div>
        <div class="text-muted-foreground flex justify-between text-[11px]">
          <span>dependence</span><span class="text-foreground"
            >{dependenceStage(dependence)} · {dependence}</span
          >
        </div>
        <div class="bg-muted mt-0.5 h-1.5 overflow-hidden rounded">
          <div class="h-full rounded bg-amber-400" style="width: {dependence}%"></div>
        </div>
      </div>
    {/if}

    <div>
      <div class="text-muted-foreground flex justify-between text-[11px]">
        <span>fullness</span><span class="text-foreground"
          >{Math.round(state.fluids.fillPercent)}%{#if firmness}
            · {firmness}{/if}</span
        >
      </div>
      <div class="bg-muted mt-0.5 h-1.5 overflow-hidden rounded">
        <div class="h-full rounded bg-pink-400/80" style="width: {state.fluids.fillPercent}%"></div>
      </div>
    </div>

    {#if milk}
      <div>
        <div class="text-muted-foreground flex justify-between text-[11px]">
          <span>milk · {milk.label}</span>
          {#if engorged}<span class="text-amber-400">engorged</span>{/if}
        </div>
        <div class="bg-muted mt-0.5 h-1.5 overflow-hidden rounded">
          <div class="h-full rounded {milk.tint}" style="width: {milk.percent}%"></div>
        </div>
      </div>
    {/if}
  </div>

  {#if quirks.length > 0 || state.conditions.length > 0 || state.lastGrowth}
    <div class="border-border/70 flex flex-wrap items-center gap-1 border-t px-3 py-2">
      {#each quirks as quirk (quirk.id)}
        <span
          class="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]"
          title={quirk.blurb}>{quirk.label}</span
        >
      {/each}
      {#each state.conditions as condition (condition.label)}
        <span
          class="rounded-full border px-2 py-0.5 text-[10px] {condition.label.toLowerCase() ===
          'withdrawal'
            ? 'border-amber-500/50 text-amber-400'
            : 'border-border text-muted-foreground'}"
          title={condition.note ?? ''}>{condition.label}</span
        >
      {/each}
      {#if state.lastGrowth}
        <span class="ml-auto flex items-center gap-1 text-[11px] text-emerald-400">
          <TrendingUp class="h-3 w-3" /> grew this turn
        </span>
      {/if}
    </div>
  {/if}
</div>
