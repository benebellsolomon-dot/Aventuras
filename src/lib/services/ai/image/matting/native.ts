/**
 * Native matte: the Rust `sprite_finish` Tauri command (ort + isnet-anime).
 *
 * The command reports unavailable when the model file is absent from
 * <app-data>/models/isnet-anime.onnx — the caller (index.ts) then falls back
 * to the pass-through. The model lives in app-data, NOT bundle resources, so
 * it survives redeploys and never bloats the .app.
 */

import { invoke } from '@tauri-apps/api/core'
import type { BackgroundMatte, SpriteFinishResult } from './types'

export const nativeMatte: BackgroundMatte = {
  async available(): Promise<boolean> {
    try {
      return await invoke<boolean>('sprite_matting_available')
    } catch {
      // Command not registered (older build) or backend error — treat as absent.
      return false
    }
  },

  async finish(pngBase64: string): Promise<SpriteFinishResult> {
    const webpBase64 = await invoke<string>('sprite_finish', { pngBase64 })
    return { dataUrl: `data:image/webp;base64,${webpBase64}`, matted: true }
  },
}
