# Production Tier-Ladder Validation + Hyper-Band Recalibration

**Date:** 2026-06-20 · **Model:** WAI-illustrious-SDXL v17 · **Seed/scene:** locked (fixed blonde, fitted ribbed tank, front cowboy shot, plain bg, matte skin)

## What this tested

The standalone cup-calibration (`CUP-CALIBRATION-REPORT.md`) validated the **slider-only**
size control (slider 0→3.5 → cup D…J/K). But production (comic-continuer + Vellum) uses a
**different** strategy — the *cup tag* carries the band and the slider is only a fine-tune in
a small range, with the hyper-concept LoRA stacked at tier 40+. That production ladder
(`be_prompt.py` / `illustrious-prompt-builder.ts`, kept bit-exact in lockstep) had never been
swept end-to-end as a unit. This effort rendered the real production mapping through the real
production preset graph (`illustrious_image.json`: clip-skip 2, smooth_booster 0.5,
LoRA-model-only slider+hyper, euler_a/normal, 28/18 steps, latent-upscale ×1.5 hires 0.4),
varying only the tier.

Harnesses: `gen_tier_ladder_sweep.py` (imports the live `be_prompt.py` so the mapping is
bit-exact), `gen_hyper_band_study.py` (seam + fix probe), `make_tier_montage.py` /
`make_hyper_montage.py` (labeled contact sheets).

## Findings

**Healthy across tiers 0–39.** Monotonic, well-separated, coherent. Tier 0 reads genuinely
flat (slider −1.5 + `flat chest`); the default tier 14 (large) is clean; flat→small→medium→
large→huge→gigantic each clearly distinct. No reversal at the large→huge (21→22) or
huge→gigantic (29→30) seams — the cup-tag jump dominates the slider reset.

**Two defects at the top (both fixed):**

1. **Non-monotonic dip at the gigantic→hyper seam (39→40).** v2.1 reset the slider to 0.3 at
   tier 40 while hyper only reached 0.3, so the band's *new* size driver (hyper LoRA) under-
   compensated the slider drop (0.70→0.30). Result: **tier 40 rendered SMALLER than the
   gigantic peak (tier 39, slider 0.70)** — size fell exactly when the tier rose.
2. **Top-band compression.** Tiers 30–50 (gigantic + hyper, 20 tiers) collapsed into nearly
   one apparent size; the hyper band barely exceeded gigantic. Hyper LoRA was capped at 0.5,
   leaving headroom (growth-sequence work had used 0.7).

## Hyper-band study (fix probe)

Same locked scene/seed; drove (cup, slider, hyper) explicitly. CUR = v2.1 values, FIX = candidate.

| Probe | slider / hyper | Result |
|---|---|---|
| t39 gigantic (CUR) | 0.70 / 0 | large — the bar to clear |
| t40 hyper (CUR) | 0.30 / 0.30 | **smaller than t39 → the dip** |
| **t40 hyper (FIX)** | **0.50 / 0.50** | **≥ t39 → dip eliminated** |
| t50 hyper (CUR) | 0.50 / 0.50 | barely > gigantic |
| **t50 hyper (FIX)** | **0.60 / 0.85** | **dramatically larger, still coherent** |
| t50 stress (FIX2) | 0.70 / 1.00 | **no extra size — saturated**; render character drifts |

Conclusion: hold the slider elevated through the hyper band and push the hyper LoRA to 0.85.
0.85/0.60 sits just under the saturation knee — (1.0/0.70) adds nothing.

## The change (v2.2 — applied in lockstep)

Only the **hyper band (tier ≥ 40)** changed; tiers 0–39 untouched.

| | v2.1 | v2.2 |
|---|---|---|
| slider anchors | `(40,0.3),(49,0.5),(50,0.5),(100,0.5)` | `(40,0.5),(50,0.6),(100,0.6)` |
| hyper ramp | `0.3 + (t−40)·0.02` → 0.3@40, 0.5@50 | `0.5 + (t−40)·0.035` → 0.5@40, 0.85@50 |

Corrected top of ladder: t39 `gigantic 0.70/0` → t40 `hyper 0.50/0.50` → t45 `0.55/0.68` →
t50 `0.60/0.85`. Monotonic at the seam (hyper onset clears the gigantic peak) and within the
band (both drivers rise together).

### Files touched (must stay bit-exact in lockstep)
- `comic-continuer/comic_continuer/art/be_prompt.py` — `_SLIDER_ANCHORS`, `tier_to_hyper_concept_weight`, docstring
- `vellum/src/server/engine/illustrious-prompt-builder.ts` — `anchors`, `tierToHyperConceptWeight`, header table
- `comic-continuer/tests/test_be_prompt.py` — anchors, 500-clamp (0.5→0.6), hyper parametrize
- `vellum/tests/server/engine/test-illustrious-prompt-builder.ts` — anchor asserts (40→0.5, +50), 500-clamp, hyper ramp test

### Validation
- Tests green: comic-continuer **270 passed**, vellum engine **686 passed**.
- Renders: hyper-band study confirmed the fix at the exact new anchor values; full ladder
  re-swept with the corrected mapping (`tier_ladder_montage.png` / `tier_ladder_torso.png`).
- Bounds OK: bridge `ImageGenRequest.lora_strengths` allows slider ≤3.5, hyper ≤1.5 — 0.60/0.85 well inside.

## Still open / next
- **Slider-only cup table (`CUP-CALIBRATION-REPORT.md`) is unchanged** — it documents a
  different (slider-only) control surface and remains valid for that use.
- Coherence at the very top (t50 0.60/0.85) is good for a clean cowboy shot; full-body and
  multi-char framing at hyper tiers may still want the FaceDetailer pass enabled (per playbook).
- Side-lying lateral-pool gravity remains the open structural item (needs recline-plane ControlNet).
