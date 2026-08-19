<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { settings } from '$lib/stores/settings.svelte'
  import { hasDescriptors } from '$lib/utils/visualDescriptors'
  import { Sparkles, Loader2, Check, AlertTriangle, ArrowRight, GitBranch } from 'lucide-svelte'

  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Progress } from '$lib/components/ui/progress'
  import { extractIdentity } from '$lib/services/ai/image/identityExtraction'
  import {
    runIdentityBackfill,
    applyBaselineProposal,
    BASELINE_DIFF_FIELDS,
    type BaselineProposal,
    type BackfillResult,
  } from '$lib/services/ai/image/identityBackfill'
  import type { VisualDescriptors } from '$lib/services/ai/sdk/schemas/classifier'

  let { open = $bindable(false) }: { open?: boolean } = $props()

  type Phase = 'intro' | 'running' | 'done'
  let phase = $state<Phase>('intro')
  let progressDone = $state(0)
  let progressTotal = $state(0)
  let result = $state<BackfillResult | null>(null)
  // Proposals still awaiting a decision (applied/skipped ones are removed).
  let pending = $state<BaselineProposal[]>([])
  let appliedCount = $state(0)
  let applyingId = $state<string | null>(null)
  // FIX 6: cancels the in-flight run between characters.
  let abortController = $state<AbortController | null>(null)

  // Reset to the intro each time the modal is (re)opened.
  $effect(() => {
    if (open) {
      phase = 'intro'
      progressDone = 0
      progressTotal = 0
      result = null
      pending = []
      appliedCount = 0
      applyingId = null
      abortController = null
    }
  })

  const eligible = $derived(story.characters.filter((c) => hasDescriptors(c.visualDescriptors)))
  const eligibleCount = $derived(eligible.length)

  // FIX 4: eligible characters whose approved sprite anchor a tag-bank change would
  // invalidate (the bank feeds spriteAppearanceHash → the anchor needs re-approval).
  const approvedAnchorCount = $derived(
    eligible.filter((c) => c.spriteAnchorStatus === 'approved').length,
  )

  // FIX 5: running the backfill on a lightweight (COW) branch forks every character
  // it writes into a branch override.
  const onCowBranch = $derived(
    !!story.currentStory?.currentBranchId && settings.experimentalFeatures.lightweightBranches,
  )

  const FIELD_LABELS: Record<string, string> = {
    face: 'Face',
    hair: 'Hair',
    eyes: 'Eyes',
    build: 'Build',
    distinguishing: 'Distinguishing',
  }

  function field(vd: VisualDescriptors, key: keyof VisualDescriptors): string {
    return (vd[key] ?? '').trim()
  }

  const progressPct = $derived(progressTotal > 0 ? (progressDone / progressTotal) * 100 : 0)

  async function runBackfill() {
    phase = 'running'
    progressDone = 0
    progressTotal = eligibleCount
    const controller = new AbortController()
    abortController = controller
    try {
      const res = await runIdentityBackfill(story.characters, {
        extract: extractIdentity,
        persist: (id, updates) => story.updateCharacter(id, updates),
        onProgress: (done, total) => {
          progressDone = done
          progressTotal = total
        },
        signal: controller.signal,
      })
      result = res
      pending = res.proposals
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : 'Backfill failed', 'error')
    } finally {
      abortController = null
      phase = 'done'
    }
  }

  // FIX 6: stop the run before the next character; the backfill returns partial results.
  function cancelRun() {
    abortController?.abort()
  }

  async function applyOne(proposal: BaselineProposal) {
    applyingId = proposal.characterId
    try {
      await applyBaselineProposal(proposal, (id, updates) => story.updateCharacter(id, updates))
      pending = pending.filter((p) => p.characterId !== proposal.characterId)
      appliedCount += 1
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : 'Failed to apply', 'error')
    } finally {
      applyingId = null
    }
  }

  function skipOne(proposal: BaselineProposal) {
    pending = pending.filter((p) => p.characterId !== proposal.characterId)
  }

  async function applyAll() {
    for (const proposal of [...pending]) {
      await applyOne(proposal)
    }
  }

  function skipAll() {
    pending = []
  }

  function close() {
    open = false
  }
</script>

<ResponsiveModal.Root {open} onOpenChange={(v) => (open = v)}>
  <ResponsiveModal.Content class="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
    <ResponsiveModal.Header class="border-b px-6 py-4">
      <div class="flex items-center gap-2">
        <Sparkles class="text-primary h-5 w-5" />
        <ResponsiveModal.Title>Backfill Identity Tags</ResponsiveModal.Title>
      </div>
      <ResponsiveModal.Description>
        Derive locked identity tags and clean up appearance baselines for this story's characters.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex-1 space-y-4 overflow-y-auto px-6 py-6">
      {#if phase === 'intro'}
        {#if eligibleCount === 0}
          <div class="border-muted bg-muted/20 rounded-lg border border-dashed py-8 text-center">
            <p class="text-muted-foreground text-sm">
              No characters with appearance descriptors in this story.
            </p>
          </div>
        {:else}
          <p class="text-muted-foreground text-sm">
            This runs one AI extraction per character
            <strong class="text-foreground">({eligibleCount} in this story)</strong> and may take a moment.
          </p>
          <div class="space-y-2 rounded-lg border p-4 text-sm">
            <div class="flex items-start gap-2">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <p class="text-muted-foreground">
                <strong class="text-foreground">Identity tag banks</strong> are applied automatically
                — additive and safe, and any bank you've edited by hand is preserved.
              </p>
            </div>
            <div class="flex items-start gap-2">
              <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p class="text-muted-foreground">
                <strong class="text-foreground">Baseline rewrites</strong> touch your appearance
                text, so they are only <strong>proposed</strong> — you review and apply each one below.
              </p>
            </div>
          </div>

          {#if approvedAnchorCount > 0}
            <div
              class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p class="text-muted-foreground">
                <strong class="text-foreground"
                  >{approvedAnchorCount} character{approvedAnchorCount === 1 ? '' : 's'} have approved
                  sprite anchors</strong
                >
                — applying a tag bank changes their appearance hash and will require re-approving their
                sprites.
              </p>
            </div>
          {/if}

          {#if onCowBranch}
            <div
              class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
            >
              <GitBranch class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p class="text-muted-foreground">
                You're on a <strong class="text-foreground">lightweight branch</strong>. Running the
                backfill will fork every character it changes into a branch-local override.
              </p>
            </div>
          {/if}
        {/if}
      {:else if phase === 'running'}
        <div class="flex flex-col items-center gap-4 py-6 text-center">
          <Loader2 class="text-primary h-8 w-8 animate-spin" />
          <div class="w-full space-y-2">
            <Progress value={progressPct} />
            <p class="text-muted-foreground text-sm">
              Extracting identities… {progressDone} / {progressTotal}
            </p>
          </div>
        </div>
      {:else if phase === 'done' && result}
        <!-- Summary -->
        <div class="bg-muted/40 rounded-lg border p-4 text-sm">
          <p class="text-foreground font-medium">
            {result.banksApplied} tag bank{result.banksApplied === 1 ? '' : 's'} applied,
            {result.banksSkipped} skipped.
          </p>
          {#if result.errors > 0}
            <p class="text-destructive mt-1 text-xs">
              {result.errors} character{result.errors === 1 ? '' : 's'} failed and were skipped.
            </p>
          {/if}
        </div>

        {#if pending.length > 0}
          <div class="flex items-center justify-between">
            <p class="text-foreground text-sm font-medium">
              {pending.length} baseline proposal{pending.length === 1 ? '' : 's'} to review
            </p>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" onclick={skipAll}>Skip all</Button>
              <Button size="sm" onclick={applyAll} disabled={applyingId !== null}>Apply all</Button>
            </div>
          </div>

          <div class="space-y-3">
            {#each pending as proposal (proposal.characterId)}
              <div class="bg-card rounded-lg border p-3">
                <div class="mb-2 flex items-center justify-between">
                  <h4 class="text-foreground text-sm font-semibold">{proposal.name}</h4>
                  <div class="flex gap-2">
                    <Button
                      variant="text"
                      size="sm"
                      class="h-7"
                      onclick={() => skipOne(proposal)}
                      disabled={applyingId === proposal.characterId}
                    >
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      class="h-7"
                      onclick={() => applyOne(proposal)}
                      disabled={applyingId === proposal.characterId}
                    >
                      {#if applyingId === proposal.characterId}
                        <Loader2 class="h-3.5 w-3.5 animate-spin" />
                      {:else}
                        Apply
                      {/if}
                    </Button>
                  </div>
                </div>

                <div class="space-y-1.5">
                  {#each BASELINE_DIFF_FIELDS as key (key)}
                    {@const before = field(proposal.currentBaseline, key)}
                    {@const after = field(proposal.proposedBaseline, key)}
                    {#if before !== after}
                      <div class="grid grid-cols-[5rem_1fr] gap-2 text-xs">
                        <span class="text-muted-foreground pt-0.5 font-medium">
                          {FIELD_LABELS[key]}
                        </span>
                        <div class="flex flex-col gap-1">
                          <span class="text-muted-foreground/80 line-through">
                            {before || '(empty)'}
                          </span>
                          <span class="text-foreground flex items-start gap-1">
                            <ArrowRight class="text-primary mt-0.5 h-3 w-3 shrink-0" />
                            {after || '(empty)'}
                          </span>
                        </div>
                      </div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else if result.proposals.length > 0}
          <p class="text-muted-foreground text-center text-sm">
            All {appliedCount + result.proposals.length} proposals resolved.
          </p>
        {:else}
          <p class="text-muted-foreground text-center text-sm">
            No baseline rewrites needed — appearance data was already clean.
          </p>
        {/if}
      {/if}
    </div>

    <ResponsiveModal.Footer class="mt-auto border-t px-6 py-4">
      {#if phase === 'intro'}
        <Button variant="outline" onclick={close}>Cancel</Button>
        <Button onclick={runBackfill} disabled={eligibleCount === 0} class="gap-2">
          <Sparkles class="h-4 w-4" />
          Run Backfill
        </Button>
      {:else if phase === 'running'}
        <Button variant="outline" onclick={cancelRun} disabled={abortController === null}>
          Cancel
        </Button>
      {:else}
        <Button onclick={close}>Done</Button>
      {/if}
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
