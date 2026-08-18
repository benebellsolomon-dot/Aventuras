<script lang="ts">
  // RPG Sheet tab v1 (research/47 Step 12): attributes, essence, skills,
  // point spend, manual Rest. Spells arrive in Phase 4. All derivations are
  // pure helpers from $lib/services/rpg; this file is markup + dispatch.
  import { BedDouble } from 'lucide-svelte'
  import { story } from '$lib/stores/story.svelte'
  import {
    ATTRIBUTE_IDS,
    ATTRIBUTE_LABELS,
    attributeMod,
    checkBonus,
    essenceMax,
    sheetOrDefault,
    SKILLS,
    skillRanks,
    spendPoint,
    writeRpgSheet,
    type RpgSheet,
    type SpendTarget,
  } from '$lib/services/rpg'
  import { Button } from '$lib/components/ui/button'

  const protagonist = $derived(story.characters.find((c) => c.relationship === 'self') ?? null)
  const sheet = $derived.by<RpgSheet | null>(() => {
    if (!protagonist) return null
    return sheetOrDefault(protagonist.metadata)
  })

  let showAllSkills = $state(false)

  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

  // User-initiated writes: the same explicit pattern BeStatePanel uses — the
  // engine owns turn-time writes; the panel owns deliberate player edits.
  async function persist(next: RpgSheet) {
    if (!protagonist) return
    await story.updateCharacter(protagonist.id, {
      metadata: writeRpgSheet(protagonist.metadata, next),
    })
  }

  async function spend(target: SpendTarget) {
    if (!sheet) return
    const next = spendPoint(sheet, target)
    if (next) await persist(next)
  }

  async function rest() {
    if (!sheet) return
    await persist({
      ...sheet,
      essence: { ...sheet.essence, current: essenceMax(sheet.level) },
    })
  }
</script>

{#if !sheet || !protagonist}
  <p class="text-muted-foreground text-sm">No protagonist in this story yet.</p>
{:else}
  {@const essencePct = Math.round((sheet.essence.current / sheet.essence.max) * 100)}
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-baseline justify-between">
      <h3 class="text-foreground font-semibold">{protagonist.name}</h3>
      <span class="text-muted-foreground text-sm">Level {sheet.level}</span>
    </div>

    <!-- Essence -->
    <div>
      <div class="text-muted-foreground mb-1 flex items-center justify-between text-xs uppercase">
        <span>Catalytic Essence</span>
        <span class="text-amber-400 normal-case">{sheet.essence.current}/{sheet.essence.max}</span>
      </div>
      <div class="bg-muted h-2 overflow-hidden rounded">
        <div class="h-full rounded bg-amber-500/80" style="width: {essencePct}%"></div>
      </div>
      <Button variant="secondary" size="sm" class="mt-2 h-7 gap-1 text-xs" onclick={rest}>
        <BedDouble class="h-3.5 w-3.5" /> Rest (full restore)
      </Button>
    </div>

    <!-- Attributes -->
    <div>
      <div class="text-muted-foreground mb-1 flex items-center justify-between text-xs uppercase">
        <span>Attributes</span>
        {#if sheet.unspentPoints.attribute > 0}
          <span class="text-amber-400 normal-case">{sheet.unspentPoints.attribute} pts</span>
        {/if}
      </div>
      <div class="grid grid-cols-3 gap-1.5">
        {#each ATTRIBUTE_IDS as id (id)}
          <button
            class="border-border bg-card hover:bg-muted/40 rounded border px-1 py-1.5 text-center font-mono text-xs transition-colors disabled:cursor-default disabled:hover:bg-transparent"
            disabled={sheet.unspentPoints.attribute < 1}
            title={sheet.unspentPoints.attribute > 0
              ? `Spend a point on ${ATTRIBUTE_LABELS[id]}`
              : ''}
            onclick={() => spend({ kind: 'attribute', id })}
          >
            <div class="text-muted-foreground">{ATTRIBUTE_LABELS[id]}</div>
            <div class="text-foreground">
              {sheet.attributes[id]}
              <span class="text-primary">{signed(attributeMod(sheet.attributes[id]))}</span>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Skills -->
    <div>
      <div class="text-muted-foreground mb-1 flex items-center justify-between text-xs uppercase">
        <span>Skills</span>
        {#if sheet.unspentPoints.skill > 0}
          <span class="text-amber-400 normal-case">{sheet.unspentPoints.skill} pts</span>
        {/if}
      </div>
      <div class="space-y-0.5">
        {#each SKILLS.filter((s) => showAllSkills || skillRanks(sheet, s.id) > 0) as skill (skill.id)}
          <button
            class="hover:bg-muted/40 flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-xs transition-colors disabled:cursor-default disabled:hover:bg-transparent"
            disabled={sheet.unspentPoints.skill < 1}
            title={sheet.unspentPoints.skill > 0 ? `Spend a point on ${skill.label}` : ''}
            onclick={() => spend({ kind: 'skill', id: skill.id })}
          >
            <span class="text-foreground"
              >{skill.label}
              <span class="text-muted-foreground">({ATTRIBUTE_LABELS[skill.attribute]})</span></span
            >
            <span class="font-mono">
              <span class="text-muted-foreground">r{skillRanks(sheet, skill.id)}</span>
              <span class="text-primary">{signed(checkBonus(sheet, skill.id))}</span>
            </span>
          </button>
        {/each}
        {#if !showAllSkills && SKILLS.some((s) => skillRanks(sheet, s.id) === 0)}
          <button
            class="text-muted-foreground hover:text-foreground w-full px-1.5 py-1 text-left text-xs"
            onclick={() => (showAllSkills = true)}>▸ show all 18 skills</button
          >
        {:else if showAllSkills}
          <button
            class="text-muted-foreground hover:text-foreground w-full px-1.5 py-1 text-left text-xs"
            onclick={() => (showAllSkills = false)}>▾ show trained only</button
          >
        {/if}
      </div>
    </div>
  </div>
{/if}
