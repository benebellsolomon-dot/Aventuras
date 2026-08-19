/**
 * Shared harem-tab sprite state (research/53). The body-state sprite refresh +
 * completion-subscribe logic, extracted so the collapsed roster row and the
 * expanded card use ONE implementation instead of copy-pasting the effect
 * (it was inlined in the V2d GirlStatusCard and again in VnView).
 *
 * Call once from a component's <script> init, passing getters for the reactive
 * character + body state. Returns { url, cellKey } — the last COMPLETE cell,
 * held across lazy per-cell regeneration so state swaps crossfade, not blank.
 * beMode-gated and null-safe: with no sprite profile / not in beMode it simply
 * stays null and the caller falls back to portrait/placeholder.
 */
import { selectSprite, type BodyState } from '$lib/services/be'
import { spriteAnchorService } from '$lib/services/ai/image/SpriteService'
import { story } from '$lib/stores/story.svelte'
import type { Character } from '$lib/types'

export interface GirlSprite {
  readonly url: string | null
  readonly cellKey: string | null
}

export function createGirlSprite(
  getCharacter: () => Character,
  getState: () => BodyState,
): GirlSprite {
  let url = $state<string | null>(null)
  let cellKey = $state<string | null>(null)

  async function refresh(character: Character, state: BodyState): Promise<void> {
    if (story.currentStory?.settings?.beMode !== true || !story.currentStory) return
    const selection = selectSprite(state)
    const sprite = await spriteAnchorService.ensureSprite(
      character,
      story.currentStory.id,
      selection,
    )
    if (sprite?.status === 'complete' && sprite.imageData) {
      const key = `${sprite.bandIndex}:${sprite.expression}:${sprite.engorged}`
      if (cellKey !== key) {
        url = sprite.imageData
        cellKey = key
      }
    }
  }

  // Re-runs when the character or her body state changes (tracked synchronously).
  $effect(() => {
    void refresh(getCharacter(), getState())
  })

  // Completion push: a lazily-generated cell finishing for THIS girl swaps her in.
  $effect(() => {
    const character = getCharacter()
    return spriteAnchorService.subscribe((characterId) => {
      if (characterId === character.id) void refresh(character, getState())
    })
  })

  return {
    get url() {
      return url
    },
    get cellKey() {
      return cellKey
    },
  }
}
