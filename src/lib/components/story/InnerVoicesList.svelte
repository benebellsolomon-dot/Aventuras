<script lang="ts">
  // E6 inner voices list (research/65): one markup for the feed entry panel and
  // the VN textbox. Plain text — Svelte escapes it.
  import type { ParsedThoughtTag } from '$lib/utils/thoughtTagParser'

  let { voices, class: className = '' }: { voices: ParsedThoughtTag[]; class?: string } = $props()
</script>

<ul class="space-y-1.5 {className}">
  {#each voices as voice, i (i)}
    <li class="text-muted-foreground italic">
      <span class="text-foreground/80 font-medium not-italic">{voice.who}</span>
      <span class="text-muted-foreground/60"> — </span>{voice.text}
    </li>
  {/each}
</ul>
