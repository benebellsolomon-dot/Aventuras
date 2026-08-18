# BE Image-Quality Refinement — Progress Log

**System:** WAI-illustrious-SDXL v17 + ComfyUI (RTX 4090, embedded py3.13). **Goal:** maximize anime NSFW/BE image quality.
**Source of truth for settings:** `BE-PROMPT-PLAYBOOK.md`. This file tracks the round-by-round arc + current state.

## Presets (GUI-loadable, in `ComfyUI/user/default/workflows/`)
| Preset | Use | Pipeline |
|---|---|---|
| `illustrious_image__WAI_v17_QUALITY.json` (v3) | General BE | base → 4x-AnimeSharp hires-fix → hand-detailer → (face-detailer bypassed) |
| `illustrious_image__WAI_v17_INTIMATE_handrefiner.json` | Solo/intimate, contact-heavy | + contact hand-detailer (contact wildcard) → **HandRefiner** (MeshGraphormer → depth ControlNet → masked inpaint) |

## Round arc
| Round | Focus | Result |
|---|---|---|
| v1 | baseline | mean overall 5.69; hands 3.5 the floor |
| v2 | apply research findings | **+21%** (6.88); sampler→dpmpp_2m_karras CFG5, gloss off, hand-detailer, strain/gravity/separation blocks |
| v3 | residual fixes | failure-mode strain, separation-under-strain solved (P2), framing fix, tighter hand mask |
| v4 | the `between breasts` object prop | **solved** — drop `between breasts`, use `(deep cleavage:1.2)` |
| v5 | solo/intimate baseline | 6.1; faces/affect strong; contact + reclining gravity broken |
| v6 | solo/intimate fixes | contact deformation **works**, supine gravity reliable, arched pose works |
| v7 | HandRefiner (finger geometry) | fingers 4→7; contact deformation muted by re-render |
| v8 | HandRefiner tuning | denoise 0.5 + tight mask → fingers fixed **and** deformation preserved → **converged** |
| growth | growth/burst gap | **addressed** — multi-image slider sequence (`Breast_Size_Slider_Illustrious_V2` 0→4 + hyper): monotonic growth, identity holds, convincing burst at slider 4 |
| tier-ladder (2026-06-20) | validate the **production** cup-tag-primary tier ladder end-to-end (0→50) | tiers 0–39 healthy/monotonic; found + fixed a non-monotonic **dip at the gigantic→hyper seam** (t40 was smaller than t39) and **top-band compression** → v2.2 hyper-band recalibration (slider held 0.5→0.6, hyper ramp 0.5→0.85). Lockstep across be_prompt.py + Vellum TS + tests (270 + 686 green). See `TIER-LADDER-REPORT.md` |
| hyper-suite (2026-06-20) | **full testing suite** for the v2.2 hyper band across production conditions (26 cells) | **ALL PASS** — framing (cowboy/full-body/portrait/two-char), pose (arms-up/supine/hand-on-breast), seed robustness (7/7 at t50, zero failures), manga register, mid-band monotonicity. Only gaps are pre-existing production-preset limits (no hand/face detailer), NOT hyper-band regressions. See `HYPER-BAND-SUITE-REPORT.md` |
| nude-ladder (2026-06-20) | extend suite to the **nude (sensitive) path across ALL tiers** (0→50) | **ALL PASS** — monotonic on bare skin (no garment cue), no censoring (affirm sufficient; suppression is correctly explicit-only), **maturity guard holds at flat/small nude**, bare-anatomy coherent (nipples/separation, no fusion at hyper). Production rating logic needs no change. Minor: gloss on bare skin (smooth_booster vs matte). Explicit path still untested. See `NUDE-LADDER-REPORT.md` |
| body-hold attempt (2026-06-20) | keep the body fixed (petite/curvy) while only breasts grow | root cause: size LoRAs are global → txt2img drifts the body. First fix tried = **chained img2img** — **FAILED on growth** (holds body but per-step growth @ d~0.5 too small to reach hyper; long chains degrade to grain; non-ancestral worse). Re-check: `growth_recheck.png`, `chain_sampler_compare.png`. |
| body-hold SOLVED (2026-06-20) | full growth + body-lock | **OpenPose ControlNet + txt2img.** Skeleton (DWPose, xinsir SDXL CN) locks pose/framing; full-denoise txt2img per tier → breasts grow at full ladder magnitude (no breast keypoints). Validated 4 builds × clothed/nude: full flat→hyper growth + build-lock + clean quality + maturity-safe. Installed xinsir openpose CN + DWPose detectors (curl, not hf_hub — xet hangs). Harnesses `gen_openpose_growth.py`/`gen_openpose_suite.py`; report `OPENPOSE-BODY-HOLD-REPORT.md`. |
| identity (2026-06-20) | tight cross-tier face identity | IPAdapter **FaceID PLUS V2** (insightface) for both clothed+nude — installed (insightface cp313 wheel --no-deps + buffalo_l); fixes the plus-face nude washout. Wired into bridge preset `illustrious_image_openpose_faceid.json`. |
| max-quality bake-off (2026-06-21) | push recipe quality + find best anime style | Greedy bake-off: **hires 4x-AnimeSharp model-upscale** (>latent, biggest win), **dpmpp_2m/karras** (>euler_ancestral — now production default, lockstep applied + tests), cfg5/28-18/smooth0.5 confirmed. Best styles: semi-real / ultra-detailed / detailed. Report `QUALITY-BAKEOFF-REPORT.md`. Remaining: hires-preset upgrade + detailer + style-block (flagged). |

## Capability matrix
**Solved / shipped:** size ladder (huge ceiling), separation `(deep cleavage:1.2)`, failure-mode strain, supine gravity, arched pose + navel, expression/affect, matte skin, multi-subject de-fusion, hands (general + on-breast contact + finger geometry via HandRefiner).
**Recently added:** growth/burst (multi-image slider sequence — `gen_growth_sequence.py`); **cup-size calibration** — slider→cup dial (D=0.5, E=1.0, F=1.5 via 0.25 steps; G=2.0, H=3.0 via 0.5 steps), `CUP-CALIBRATION-REPORT.md`.
**Open (structural, not yet built):** side-lying lateral-pool gravity (needs recline-plane ControlNet).

## Environment setup (installed into embedded py3.13 this effort)
- ComfyUI custom nodes: `ComfyUI_DanTagGen` (patched; unreliable — prefer Autocomplete-Plus), `ComfyUI-Autocomplete-Plus`.
- pip: `tiktoken` (DanTagGen), `yacs timm trimesh` + `mediapipe absl-py flatbuffers sounddevice` (`--no-deps`, for HandRefiner/MeshGraphormer).
- Models: `hand_yolov8s.pt` (detailer detector). Already present: `illustriousXLDepth_v20` ControlNet, 4x-AnimeSharp, Impact Pack, controlnet_aux, IPAdapter.

## File index (`quality-upgrade/`)
- Reports: `BE-QUALITY-REPORT` (v1), `…v2-REPORT`, `…v3-REPORT`, `…v5-SOLO-INTIMATE-REPORT`, `…v6-SOLO-INTIMATE-REPORT`.
- Playbook: `BE-PROMPT-PLAYBOOK.md`. Change/test docs: `CHANGE-REPORT_2026-06-19.md`, `INSTALL-TEST-PLAN_2026-06-19.md`.
- Generators: `build_preset_v3.py`, `build_preset_intimate.py`; test harnesses `gen_test_suite_v*.py`, `gen_growth_sequence.py`.
- Tier-ladder (2026-06-20): `gen_tier_ladder_sweep.py` (imports live be_prompt.py), `gen_hyper_band_study.py`, `make_tier_montage.py`, `make_hyper_montage.py`; report `TIER-LADDER-REPORT.md`.
- Hyper-suite (2026-06-20): `gen_hyper_band_suite.py`, `make_suite_montage.py`; report `HYPER-BAND-SUITE-REPORT.md`. Reusable matrix harness (framing/pose/seed/manga/monoton groups).
- Nude-ladder (2026-06-20): `gen_nude_ladder_sweep.py` (+ `make_tier_montage.py` now takes a manifest-path arg); report `NUDE-LADDER-REPORT.md`.
- Body-hold img2img (2026-06-20, FAILED on growth): `gen_expansion_hold.py`, `gen_expansion_chain.py`, `gen_expansion_sequence.py`, `gen_tier_suite_img2img.py`, `gen_chain_sampler_test.py`; montages `make_expansion_montage.py`/`make_chain_montage.py`/`make_growth_recheck.py`/`make_sampler_compare.py`; report `EXPANSION-BODY-HOLD-REPORT.md` (superseded).
- Body-hold OpenPose (2026-06-20, SOLVED): `download_openpose_cn.py`, `gen_openpose_growth.py`, `gen_openpose_suite.py`, `make_openpose_montage.py`, `make_tier_suite_montage.py`; report `OPENPOSE-BODY-HOLD-REPORT.md`.

## Next steps
1. (Optional polish) Lock wardrobe + IPAdapter PLUS FACE across frames for tighter outfit/identity consistency in growth sequences.
2. (Open) Side-lying gravity via recline-plane ControlNet.
3. (Optional) Re-confirm hyper-tier coherence on full-body / multi-char framing (enable FaceDetailer there); the v2.2 hyper-band recal was swept on a clean cowboy shot.
