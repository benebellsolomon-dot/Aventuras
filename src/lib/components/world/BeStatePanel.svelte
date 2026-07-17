<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Lock, LockOpen, Sparkles } from 'lucide-svelte'
  import type { Character } from '$lib/types'
  import type { BodyState } from '$lib/services/be'
  import {
    bandWord,
    comparative,
    cupLetter,
    defaultBodyState,
    groundingFacts,
    readBodyState,
    sniffTierFromText,
    writeBodyState,
  } from '$lib/services/be'

  interface Props {
    character: Character
  }

  let { character }: Props = $props()

  const bodyState = $derived(readBodyState(character.metadata))
  let editingTier = $state(false)
  let tierInput = $state('')

  // Manual edits go through the be/ metadata helper — the helper is the writer,
  // preserving single-writer in spirit (research/31 §2.3, legible-RPG ruling).
  async function persist(next: BodyState) {
    await story.updateCharacter(character.id, {
      metadata: writeBodyState(character.metadata, next),
    })
  }

  async function toggleLock() {
    if (bodyState) await persist({ ...bodyState, locked: !bodyState.locked })
  }

  function startTierEdit() {
    if (!bodyState) return
    tierInput = String(bodyState.tier)
    editingTier = true
  }

  // Commit/cancel discipline: `editingTier` flips false synchronously FIRST, so a
  // blur fired by the input unmounting can neither double-commit (Enter) nor
  // commit a cancelled edit (Escape). An emptied field is a cancel, not tier 0.
  const MAX_TIER_INPUT = 9999

  async function commitTier() {
    if (!editingTier) return
    editingTier = false
    const raw = tierInput
    const tier = Math.floor(Number(raw))
    if (raw === '' || raw === null) return
    if (!bodyState || !Number.isFinite(tier) || tier < 0 || tier > MAX_TIER_INPUT) return
    if (tier === bodyState.tier) return
    await persist({ ...bodyState, tier, lastGrowth: undefined })
  }

  function cancelTier() {
    editingTier = false
  }

  async function seedState() {
    const sniffed = sniffTierFromText(
      [character.visualDescriptors?.build ?? '', character.description ?? ''].join('\n'),
    )
    await persist(defaultBodyState(sniffed ?? undefined))
  }
</script>

{#if bodyState}
  {@const facts = groundingFacts(bodyState.tier, bodyState.shape)}
  <div class="bg-muted/40 mt-2 space-y-1 rounded-md p-2">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold tracking-wide uppercase">Body State</span>
      <div class="flex items-center gap-1">
        {#if editingTier}
          <input
            class="border-muted bg-popover w-14 rounded border px-1 text-right text-xs"
            type="number"
            min="0"
            max={MAX_TIER_INPUT}
            bind:value={tierInput}
            onblur={commitTier}
            onkeydown={(e) => {
              if (e.key === 'Enter') commitTier()
              if (e.key === 'Escape') cancelTier()
            }}
          />
        {:else}
          <button
            class="text-primary text-xs font-medium hover:underline"
            title="Tier {bodyState.tier} — click to edit"
            onclick={startTierEdit}
          >
            {cupLetter(bodyState.tier)}-cup · tier {bodyState.tier}
          </button>
        {/if}
        <Button
          variant="text"
          size="icon"
          class="h-5 w-5 {bodyState.locked ? 'text-primary' : 'text-muted-foreground'}"
          title={bodyState.locked ? 'Size locked — growth muzzled. Click to unlock.' : 'Lock size'}
          onclick={toggleLock}
        >
          {#if bodyState.locked}<Lock class="h-3.5 w-3.5" />{:else}<LockOpen
              class="h-3.5 w-3.5"
            />{/if}
        </Button>
      </div>
    </div>
    <p class="text-muted-foreground text-xs leading-relaxed">
      {bandWord(bodyState.tier)} — {comparative(bodyState.tier)}
    </p>
    <p class="text-muted-foreground/80 text-xs">
      {facts.posture} · {facts.mobility} · {facts.clothing}
    </p>
    {#if bodyState.fluids.fillPercent > 0}
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground text-xs">{bodyState.fluids.fluidType}</span>
        <div class="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
          <div class="bg-primary h-full" style="width: {bodyState.fluids.fillPercent}%"></div>
        </div>
        <span class="text-muted-foreground text-xs"
          >{Math.round(bodyState.fluids.fillPercent)}%</span
        >
      </div>
    {/if}
    {#if bodyState.conditions.length > 0}
      <div class="flex flex-wrap gap-1">
        {#each bodyState.conditions as condition (condition.label)}
          <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
            {condition.label}{condition.ttl !== undefined ? ` (${condition.ttl})` : ''}
          </span>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="mt-2">
    <Button variant="outline" size="sm" class="h-6 gap-1 text-xs" onclick={seedState}>
      <Sparkles class="h-3 w-3" />
      Seed body state
    </Button>
  </div>
{/if}
