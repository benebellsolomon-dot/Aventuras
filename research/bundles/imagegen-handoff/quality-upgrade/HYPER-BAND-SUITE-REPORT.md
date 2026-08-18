# v2.2 Hyper-Band Full Testing Suite — Report

**Date:** 2026-06-20 · **Model:** WAI-illustrious-SDXL v17 · **Path:** production preset graph
(`illustrious_image.json` node structure) driven by the live `be_prompt.py` mapping, rendered
direct-to-ComfyUI. **No face/hand detailer** (the honest production path — the production preset
has none). 26 cells, drained in ~6.4 min.

Purpose: the v2.2 hyper-band recalibration (tiers 40/45/50 → slider 0.5→0.6, hyper 0.5→0.85)
was originally proved on ONE clean cowboy shot at ONE seed. This suite stresses it across the
conditions production actually generates. Harness: `gen_hyper_band_suite.py`; montages:
`make_suite_montage.py` → `hyper_suite_{framing,pose,seed,manga,monoton}.png`.

## Result: ALL GROUPS PASS — v2.2 hyper band is robust

| Group | Cells | Verdict |
|---|---|---|
| **framing** | cowboy / full-body / portrait / two-char × t40,t50 | ✅ all 4 monotonic (t40<t50) + coherent |
| **pose** | arms-up / supine / hand-on-breast × t40,t50 | ✅ coherent; hands rough (preset has no detailer) |
| **seed** | t50 cowboy × seeds 222–777 | ✅ **6/6, zero failures** (7/7 with seed 111) |
| **manga** | real comic-continuer prompt × cowboy,full-body × t40,t50 | ✅ correct monochrome/screentone register, monotonic |
| **monoton** | full-body & two-char t45 | ✅ t45 sits between t40 and t50 off-scene |

### Highlights
- **Full-body holds.** The big worry — coherence when the body is small-in-frame — is fine:
  proportions good, feet visible, faces acceptable even without a detailer.
- **Two-char de-fusion holds at hyper size.** Two distinct characters, both hyper, no
  cross-character fusion, sizes grow t40→t50.
- **Robust across seeds.** 7/7 coherent at the extreme (t50); size consistent, no fusion /
  extra-breast / anatomy breaks.
- **Manga register works** — the actual comic-continuer output (monochrome line-art +
  screentone) renders the hyper band cleanly and monotonically.
- **Supine** spreads laterally and reads correctly at hyper volume (flatten-at-apex is muted by
  sheer volume but physically plausible).

## Findings (none are v2.2 regressions — all pre-existing production-preset gaps)

1. **No hand-detailer / HandRefiner in the production preset.** Hands at contact (hand-on-breast)
   and raised-arm poses are rough. The hand-detailer + HandRefiner passes that fixed this in the
   quality work live only in the standalone `…_QUALITY` / `…_INTIMATE` ComfyUI presets, NOT in the
   bridge's `illustrious_image.json`. Orthogonal to the tier ladder.
2. **No FaceDetailer in the production preset.** Full-body / multi-char faces are slightly soft
   (small-in-frame). Playbook recommends enabling FaceDetailer when the face is <~12–15% of frame.
3. **Supine flatten muted** at hyper volume — acceptable, not a defect.

### Recommendation (separate change, optional)
Consider adding a hand-detailer (and conditional FaceDetailer) node to the bridge's production
image preset(s) — per the playbook it's "the biggest single quality fix," and the suite shows the
gap is most visible exactly at hyper tiers (large hands-on-breast contact, full-body faces). This
is a preset/quality change independent of the tier-ladder calibration.

## What this does NOT cover
- Live `/image` endpoint smoke (FastAPI token-substitution + job queue) — already unit-tested in
  both repos; credential read for a live POST was not authorized this session. Runnable by the
  user via the bridge with its X-API-Key.
- Explicit/nude rating interaction with hyper size (suite used clothed/suggestive — the harder
  garment-strain coherence test).
