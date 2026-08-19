<script lang="ts">
  import { Dices } from 'lucide-svelte'
  import {
    BAND_LABELS,
    formatCheckMath,
    formatCheckMathCompact,
    type CheckRecord,
  } from '$lib/services/rpg'
  import type { BeLogRecord } from '$lib/services/be'
  import { story } from '$lib/stores/story.svelte'

  interface Props {
    record: CheckRecord
    /** BE consequence rows from the same turn's delta (optional). */
    beLog?: BeLogRecord[]
  }

  let { record, beLog = [] }: Props = $props()

  // Display-only verbosity (Phase 5 W3) — compact hides the d20/bonus breakdown.
  // Never affects the prompt.
  const mathLine = $derived(
    story.currentStory?.settings?.rpgRollCardVerbosity === 'compact'
      ? formatCheckMathCompact(record)
      : formatCheckMath(record),
  )

  const bandClasses: Record<CheckRecord['band'], string> = {
    crit: 'border-l-emerald-400 text-emerald-300',
    success: 'border-l-emerald-500/70 text-emerald-400',
    partial: 'border-l-yellow-500/70 text-yellow-400',
    fail: 'border-l-red-500/70 text-red-400',
  }

  const consequences = $derived(
    beLog.filter((row) => row.kind !== 'seed' && (row.delta !== 0 || row.outcome !== 'none')),
  )
</script>

<div
  class="border-border bg-card/80 my-2 rounded-md border border-l-4 px-3 py-2 font-mono text-xs {bandClasses[
    record.band
  ].split(' ')[0]}"
>
  <div class="flex items-center gap-2">
    <Dices class="text-muted-foreground h-3.5 w-3.5 shrink-0" />
    <span class="text-foreground">{mathLine}</span>
    <span class="font-semibold {bandClasses[record.band].split(' ')[1]}"
      >{BAND_LABELS[record.band]}</span
    >
    {#if record.essenceSpent > 0}
      <span class="text-amber-400/90">⬡ −{record.essenceSpent}</span>
    {/if}
  </div>
  {#if consequences.length > 0}
    <div class="text-muted-foreground mt-1 space-y-0.5 pl-5">
      {#each consequences as row, i (i)}
        <div class="text-pink-300/80">
          {row.character}: {row.kind} → {row.outcome}{row.delta > 0
            ? ` (+${row.delta} tier → ${row.tierAfter})`
            : ''}
        </div>
      {/each}
    </div>
  {/if}
  {#if record.drift && record.drift.length > 0}
    <div class="mt-1 pl-5 text-amber-400/90">⚠ continuity corrected — {record.drift[0].note}</div>
  {/if}
</div>
