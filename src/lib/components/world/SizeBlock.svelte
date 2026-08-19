<script lang="ts">
  // Cup + measurements block (research/53) — the headline of the expanded harem
  // card. Cup letter is the hero; tier is NOT shown here (it's a faint tag on the
  // portrait). Every value comes straight from the be engine, metric per Ben's
  // ruling; nothing invented.
  import {
    bwhCmString,
    comparative,
    cupLetter,
    measurements,
    type BodyState,
  } from '$lib/services/be'

  interface Props {
    state: BodyState
  }

  let { state }: Props = $props()

  const cup = $derived(cupLetter(state.tier))
  const cmp = $derived(comparative(state.tier))
  const m = $derived(measurements(state))
  const bwh = $derived(bwhCmString(state))
</script>

<div class="bg-background/60 border-border mt-2 rounded-lg border px-2.5 py-2">
  <div class="flex items-baseline gap-2">
    <span class="text-lg leading-none font-medium text-rose-300">{cup}-cup</span>
    <span class="text-muted-foreground text-[11px]">{cmp}</span>
  </div>

  <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
    <div class="flex justify-between text-[11px]">
      <span class="text-muted-foreground">bust</span><span>{Math.round(m.bustCm)} cm</span>
    </div>
    <div class="flex justify-between text-[11px]">
      <span class="text-muted-foreground">band</span><span>{Math.round(m.bandCm)} cm</span>
    </div>
    <div class="flex justify-between text-[11px]">
      <span class="text-muted-foreground">mass</span><span>{m.nowTotalKg.toFixed(1)} kg</span>
    </div>
    <div class="flex justify-between text-[11px]">
      <span class="text-muted-foreground">hang</span><span>{Math.round(m.droopCm)} cm</span>
    </div>
    <div class="border-border/60 col-span-2 mt-0.5 flex justify-between border-t pt-1 text-[11px]">
      <span class="text-muted-foreground">B·W·H</span><span class="tabular-nums">{bwh}</span>
    </div>
  </div>

  <div class="text-muted-foreground mt-1 text-[10px]">{m.weightFeel}</div>
</div>
