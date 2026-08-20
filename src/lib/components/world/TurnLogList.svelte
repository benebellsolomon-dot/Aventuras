<script lang="ts">
  // Harem tab turn log (research/48 Step 9): interleaved checkLog + beLog rows,
  // ordering ruled in rpg/turnlog.ts. Markup only — logic stays testable.
  import {
    beLogStyle,
    buildTurnLog,
    checkOutcomeLabel,
    formatCheckMath,
    formatCheckMathCompact,
    unknownSpellNote,
  } from '$lib/services/rpg'
  import { story } from '$lib/stores/story.svelte'
  import type { CheckRecord } from '$lib/services/rpg'

  const rows = $derived(
    buildTurnLog(story.entries, story.currentStory?.settings?.rpgTurnLogLength ?? 30),
  )

  // Honor the roll-card verbosity here too, so the log matches (Phase 5 W3).
  const mathOf = $derived((record: CheckRecord) =>
    story.currentStory?.settings?.rpgRollCardVerbosity === 'compact'
      ? formatCheckMathCompact(record)
      : formatCheckMath(record),
  )

  const checkTint: Record<string, string> = {
    crit: 'border-l-emerald-400',
    success: 'border-l-emerald-500/70',
    partial: 'border-l-yellow-500/70',
    fail: 'border-l-red-500/70',
  }
</script>

<div>
  <div class="text-muted-foreground mb-1 text-xs tracking-wide uppercase">Turn log</div>
  {#if rows.length === 0}
    <p class="text-muted-foreground text-xs">Nothing yet — events land here as you play.</p>
  {:else}
    <div class="space-y-1">
      {#each rows as row, i (i)}
        {#if row.kind === 'check'}
          <div
            class="bg-card rounded border-l-2 px-2 py-1 font-mono text-[10px] {checkTint[
              row.record.band
            ]}"
          >
            <!-- No die glyph on a record that never rolled (its math line prints
                 the reason, not a nat/total). -->
            {row.record.insufficientEssence ? '⬡' : row.record.spellId ? '✨' : '🎲'}
            {mathOf(row.record)} → {checkOutcomeLabel(row.record)}
            {#if row.record.target}<span class="text-muted-foreground">· {row.record.target}</span
              >{/if}
            {#if unknownSpellNote(row.record)}<span class="text-muted-foreground"
                >· unknown spell</span
              >{/if}
          </div>
        {:else}
          {@const style = beLogStyle(row.record.kind)}
          <div class="bg-card rounded border-l-2 px-2 py-1 font-mono text-[10px] {style.tint}">
            {row.record.character}: {style.label} → {row.record.outcome}{row.record.delta > 0
              ? ` (+${row.record.delta} → ${row.record.tierAfter})`
              : ''}{row.record.note ? ` · ${row.record.note}` : ''}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
