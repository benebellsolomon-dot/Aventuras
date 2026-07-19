/**
 * Background matting boundary (Spec 4 V2b Task 1).
 *
 * The concrete matter is swappable behind this interface: the native Rust
 * `sprite_finish` command (ort + isnet-anime, matte → resize → WEBP) when its
 * model file is present, else a pass-through that leaves sprites opaque —
 * V2b works end-to-end either way.
 */

export interface SpriteFinishResult {
  /** Data URL of the finished sprite (webp when matted natively, else png). */
  dataUrl: string
  /** Whether a real matte was applied (false = pass-through, opaque). */
  matted: boolean
}

export interface BackgroundMatte {
  /** True when a real matting backend is loaded. */
  available(): Promise<boolean>
  /** PNG bytes in → finished sprite out. Pass-through returns the input re-wrapped. */
  finish(pngBase64: string): Promise<SpriteFinishResult>
}
