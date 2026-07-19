/** Pass-through matte: no model available — sprites stay opaque but everything works. */

import type { BackgroundMatte, SpriteFinishResult } from './types'

export const passthroughMatte: BackgroundMatte = {
  async available(): Promise<boolean> {
    return false
  },
  async finish(pngBase64: string): Promise<SpriteFinishResult> {
    return { dataUrl: `data:image/png;base64,${pngBase64}`, matted: false }
  },
}
