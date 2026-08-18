<script lang="ts">
  // Harem tab girl card (research/48 Step 9). Read-only glance surface — the
  // full editor stays BeStatePanel in the Characters tab (no duplicate writer).
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
    sizingString,
    supplyMeter,
    type BodyState,
  } from '$lib/services/be'
  import { ui } from '$lib/stores/ui.svelte'
  import type { Character } from '$lib/types'

  interface Props {
    character: Character
    state: BodyState
  }

  let { character, state }: Props = $props()

  const bond = $derived(bondOf(state))
  const dependence = $derived(dependenceOf(state))
  // Lactation is opt-in state: a girl who has never been induced shows nothing
  // at all here (research/49 Step 8 — no "not lactating" noise on every card).
  const lactation = $derived(lactationOf(state))
  // Straight from the engine (research/49 R6), not from the condition label:
  // the condition carries a TTL and lags her actual fill, so reading the label
  // let the card, the prompt block and the sprite disagree about one girl.
  const engorged = $derived(isEngorged(state))
  const milk = $derived(lactation?.active ? supplyMeter(lactation.supplyTier, engorged) : null)
  const quirks = $derived(
    readQuirks(state)
      .map((id) => QUIRK_BY_ID.get(id))
      .filter((def) => def !== undefined),
  )
</script>

<div class="border-border bg-card rounded-lg border px-3 py-2.5">
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
      {sizingString(state.tier)} · tier {state.tier}
      {#if state.lastGrowth}
        <TrendingUp class="inline h-3 w-3 text-emerald-400" />
      {/if}
      {#if state.locked}
        <Lock class="inline h-3 w-3 text-red-400" />
      {/if}
    </span>
  </div>

  <div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
    {#if state.attitude}<span class="italic">{state.attitude}</span>{/if}
    <span>bond <b class="text-emerald-400">{bondStance(bond)}</b> ({bond})</span>
    {#if dependence > 0}
      <span
        >dependence <b class="text-amber-400">{dependenceStage(dependence)}</b> ({dependence})</span
      >
    {/if}
  </div>

  <!-- Fluid fill meter -->
  <div class="bg-muted mt-1.5 h-1.5 overflow-hidden rounded">
    <div class="h-full rounded bg-pink-400/80" style="width: {state.fluids.fillPercent}%"></div>
  </div>
  <div class="text-muted-foreground mt-0.5 text-[10px]">
    {Math.round(state.fluids.fillPercent)}% full
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

  {#if quirks.length > 0 || state.conditions.length > 0}
    <div class="mt-1.5 flex flex-wrap gap-1">
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
    </div>
  {/if}
</div>
