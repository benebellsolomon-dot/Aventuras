<script lang="ts">
  // RPG Phase 4 spellbook (research/50). Reads story/ui directly like the
  // sibling sheet sections. The engine + persistence are done; this surface
  // lists known spells, researches new ones, and casts them at a target girl.
  import { Sparkles } from 'lucide-svelte'
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { aiService } from '$lib/services/ai'
  import { sheetOrDefault, buildPlayerSheetSummary } from '$lib/services/rpg'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import * as Select from '$lib/components/ui/select'
  import type { Entry, SpellEntryState } from '$lib/types'
  import type { ActionChoice } from '$lib/services/ai/sdk/schemas/actionchoices'

  type SpellEntry = Entry & { state: SpellEntryState }

  const protagonist = $derived(story.characters.find((c) => c.relationship === 'self') ?? null)
  const girls = $derived(story.characters.filter((c) => c.relationship !== 'self'))

  const spells = $derived.by<SpellEntry[]>(() => {
    if (!protagonist) return []
    const known = sheetOrDefault(protagonist.metadata).knownSpells
    return known
      .map((id) => story.lorebookEntries.find((e) => e.id === id))
      .filter((e): e is SpellEntry => e?.type === 'spell' && e.state?.type === 'spell')
  })

  const effectSummary = (spell: SpellEntry) => spell.state.effects.map((ef) => ef.kind).join(' · ')

  // Per-spell target selection, keyed by spell id; defaults to the first girl.
  let targets = $state<Record<string, string>>({})
  const targetFor = (spellId: string) => targets[spellId] ?? girls[0]?.name ?? ''

  let brief = $state('')
  let researching = $state(false)
  let fizzled = $state(false)

  function cast(spell: SpellEntry) {
    const targetName = targetFor(spell.id)
    if (!targetName) return
    const tag: ActionChoice = {
      text: `Cast ${spell.name} on ${targetName}`,
      type: 'action',
      skill: spell.state.school as ActionChoice['skill'],
      dc: spell.state.dc,
      essenceCost: spell.state.essenceCost,
      spellId: spell.id,
      targetCharacter: targetName,
    }
    ui.setPendingActionChoice(tag.text, story.currentStory?.id, tag)
  }

  async function research() {
    if (!protagonist || researching) return
    const sheet = sheetOrDefault(protagonist.metadata)
    fizzled = false
    researching = true
    try {
      const gen = await aiService.researchSpell(brief, buildPlayerSheetSummary(sheet))
      if (gen) {
        await story.learnSpell(gen)
        brief = ''
      } else {
        fizzled = true
      }
    } catch (err) {
      // learnSpell rejects on a failed sheet write and (D-11) on a stored sheet
      // that fails validation. Without this the rejection was unhandled and the
      // player saw nothing at all.
      ui.showToast(err instanceof Error ? err.message : 'Learning the spell failed', 'warning')
    } finally {
      researching = false
    }
  }
</script>

<div>
  <div class="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs uppercase">
    <Sparkles class="h-3.5 w-3.5" />
    <span>Spellbook</span>
  </div>

  {#if spells.length === 0}
    <p class="text-muted-foreground text-xs">No spells learned yet — research one below.</p>
  {:else}
    <div class="space-y-1.5">
      {#each spells as spell (spell.id)}
        <div class="border-border bg-card rounded border px-2 py-1.5">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-foreground text-sm font-medium">{spell.name}</span>
            <span class="text-muted-foreground shrink-0 font-mono text-xs">
              <span class="text-amber-400">⬡{spell.state.essenceCost}</span>
              <span class="text-primary">DC {spell.state.dc}</span>
            </span>
          </div>
          <div class="text-muted-foreground text-xs">
            {spell.state.school}
            {#if effectSummary(spell)}
              <span class="text-muted-foreground/70">· {effectSummary(spell)}</span>
            {/if}
          </div>
          <div class="mt-1.5 flex items-center gap-1.5">
            <Select.Root
              type="single"
              value={targetFor(spell.id)}
              onValueChange={(v) => (targets[spell.id] = v)}
              disabled={girls.length === 0}
            >
              <Select.Trigger class="h-7 flex-1 text-xs">
                <span class="truncate">{targetFor(spell.id) || 'No target'}</span>
              </Select.Trigger>
              <Select.Content class="max-h-50">
                {#each girls as girl (girl.id)}
                  <Select.Item value={girl.name} label={girl.name}>{girl.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <Button
              variant="secondary"
              size="sm"
              class="h-7 text-xs"
              disabled={girls.length === 0}
              onclick={() => cast(spell)}
            >
              Cast
            </Button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <div class="mt-2 space-y-1.5">
    <Input
      bind:value={brief}
      placeholder="Research a new spell…"
      class="h-7 text-xs"
      disabled={researching || !protagonist}
    />
    <div class="flex items-center justify-between gap-2">
      {#if fizzled}
        <span class="text-muted-foreground text-xs">The research led nowhere.</span>
      {:else}
        <span></span>
      {/if}
      <Button
        variant="secondary"
        size="sm"
        class="h-7 gap-1 text-xs"
        disabled={researching || !protagonist}
        onclick={research}
      >
        <Sparkles class="h-3.5 w-3.5" />
        {researching ? 'Researching…' : 'Research'}
      </Button>
    </div>
  </div>
</div>
