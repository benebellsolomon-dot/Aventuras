/** Matte selection: native when its model is loaded, else pass-through. Cached per session. */

import type { BackgroundMatte } from './types'
import { nativeMatte } from './native'
import { passthroughMatte } from './passthrough'

let cached: BackgroundMatte | null = null

export async function getBackgroundMatte(): Promise<BackgroundMatte> {
  if (cached) return cached
  cached = (await nativeMatte.available()) ? nativeMatte : passthroughMatte
  return cached
}

/** Test/dev hook: forget the cached choice (e.g. after the model file appears). */
export function resetBackgroundMatteCache(): void {
  cached = null
}

export type { BackgroundMatte, SpriteFinishResult } from './types'
