> ⚠️ **SUPERSEDED / PARTIALLY WRONG (2026-06-20).** The chained-img2img recipe below **holds the
> body but FAILS on growth** — per-step growth at d~0.5 is too small, so a full ladder reaches only
> ~large/huge (never hyper), and long chains degrade into grain/static. Verified by re-check
> (`growth_recheck.png`) and the sampler test (`chain_sampler_compare.png`; non-ancestral is worse).
> **Use OpenPose ControlNet + txt2img instead** — full growth + body-lock + clean quality. See
> **`OPENPOSE-BODY-HOLD-REPORT.md`**. The diagnosis below (why txt2img drifts; why the size LoRAs
> are global) remains valid; only the chained-img2img *fix* is wrong.

# Expansion Body-Hold — keep the body fixed while only the breasts grow

**Date:** 2026-06-20 · **Model:** WAI-illustrious-SDXL v17 · seed 111, locked petite body + outfit
+ pose. Harnesses: `gen_expansion_hold.py` (method/denoise comparison), `gen_expansion_chain.py`
(chained), montages `expansion_hold_compare.png`, `expansion_hold_dsweep.png`, `expansion_chain.png`.

## Problem
In breast-expansion scenes the rest of the body (build — petite vs curvy — hips, waist, pose,
identity) drifts between frames instead of staying fixed.

## Root cause
The size LoRAs (`Breast_Size_Slider_Illustrious_V2`, `hyper_breasts_ILXL_concept`) are **global
model modifiers**: changing their weight changes the whole denoising trajectory, so even at a fixed
seed the entire image diverges. The hyper/BE LoRAs additionally bias toward a curvier overall
figure (wider hips, thicker thighs). And nothing pins the body — so per-size **txt2img** can't hold
it. (This is why the tier-ladder sweeps and the old `gen_growth_sequence.py`, both pure txt2img,
show body drift.)

## What was tested (all on one locked petite body, tiers 14→22→30→40→50)
| Method | Body hold | Breast growth |
|---|---|---|
| txt2img, fixed seed, **+ body pin + anti-thick negatives** | ✗ still drifts (face/build/hips shift per frame) | strong (reaches hyper) |
| img2img from a single fixed base, d0.50 | ✓✓ excellent | modest (caps ~huge in one step) |
| img2img from base, d0.60 | ✓ good | more (sweet spot for one-shot regen) |
| img2img from base, d0.70 | ~ body softens/drifts at the extreme | most (≈hyper) |
| **chained img2img (each step from previous), d0.50/step** | ✓✓ **excellent across the whole sequence** | **accumulates to hyper** |

## Conclusion — the recipe
**Anchor every expansion frame to a previous render via img2img; never re-roll txt2img per size.**
Two production modes:

1. **Expansion SEQUENCE (multi-frame) → chained img2img.** Render the base once, then each frame is
   img2img **from the previous frame's latent** at **denoise ~0.5**, stepping the tier up a band at
   a time. Each step is a small breast increment, so a moderate denoise both preserves the
   (already-established) body and keeps growing the breasts; growth accumulates to hyper by the last
   frame. Body, pose, outfit, and identity stay locked. For a more extreme final frame, bump the
   last step to d0.55–0.6 or add a step.
2. **One-shot regen (single frame, bigger breasts, same body) → img2img from that frame.** denoise
   **0.5–0.6** (0.5 = max fidelity, 0.6 = more growth). This is exactly what the bridge editor
   already does (`illustrious_image_styled_ipa_img2img.json`, `INIT_DENOISE`) — note its default
   `INIT_DENOISE=0.55` sits right in this window.

### Necessary complements (both modes)
- **Pin the body build** in the prompt and keep it constant: e.g. `petite, slim, narrow waist,
  narrow hips, small frame` (or the curvy/athletic equivalent). This is how you choose AND lock
  "curvy vs petite."
- **Anti-thickness negatives** that target the figure, NOT the breasts:
  `wide hips, thick thighs, plump, fat, obese, thick waist, weight gain, curvy` (drop `curvy` from
  the negative when the chosen build IS curvy). Counters the BE/hyper LoRAs' figure-bulking bias.
- Keep pose / framing / outfit tags constant across frames.

## Product integration (recommended, separate change)
- `be_prompt.py` / Vellum `illustrious-prompt-builder.ts`: carry a per-character **body-build
  anchor** consistently across an expansion scene, and emit build-appropriate **anti-thick
  negatives** when the build is slim/petite. (Today the builder injects the cup tag + size but does
  not pin the body build or guard against figure-bulking.)
- For multi-panel expansion scenes, generate via **chained img2img** (panel N from panel N-1)
  rather than independent txt2img panels, so body/identity hold. The single-panel editor regen
  already uses img2img; the sequence path should reuse the same primitive chained.
