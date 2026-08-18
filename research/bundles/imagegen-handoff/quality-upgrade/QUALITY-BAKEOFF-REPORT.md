# Maximum-Quality Bake-off + Art-Style Test — 2026-06-21

**Model:** WAI-illustrious-SDXL v17 · fixed scene (silver-hair solo, ribbed sweater, cafe — stresses
face/hands/fabric/hair/bg) · fixed seed 333. Greedy bake-off: each stage holds prior winners fixed.
Harnesses: `gen_quality_hires.py`, `gen_quality_sampler.py`, `gen_quality_finetune.py`,
`gen_quality_style.py`; montages `quality_*_face.png` / `quality_style_full.png`.

## Winning max-quality recipe
**`dpmpp_2m` / `karras` · CFG 5 · 28 base / 18 hires steps · hires = 4x-AnimeSharp model-upscale
1.5× → VAEEncode → KSampler denoise 0.4 · smooth_booster 0.5 · clip-skip 2.`**
Plus (known win, not re-tested): a **hand-detailer** (and FaceDetailer for full-body/multi-char).
Recommended **style block**: `(highly detailed:1.2), intricate details, sharp focus` always-on;
`(semi-realistic:1.15), realistic skin texture, volumetric lighting` or
`(ultra-detailed:1.3), 8k, intricate` for hero/showcase.

## Stage results

### 1. Hires method (biggest lever)
| variant | verdict |
|---|---|
| no hires | soft (floor) |
| **latent nearest-exact 1.5× (CURRENT production)** | sharper than base but **soft** vs model-upscale |
| latent bislerp 1.5× | ≈ nearest, still soft |
| **4x-AnimeSharp 1.5× d0.4 → WINNER** | **clearly crisper** — sharp fabric weave, hair strands, eyes; no over-sharpen |
| 4x-UltraSharp 1.5× | crisp but slightly over-sharp/haloing on anime |
| 4x-NMKD-Yandere 1.5× | ≈ AnimeSharp (anime-tuned; fine alternative) |
| 4x-AnimeSharp 2.0× | marginal extra detail, slower |
| 4x-AnimeSharp 1.5× d0.5 | more re-detail but risks composition drift |

**→ 4x-AnimeSharp model-upscale beats the production latent upscale. Biggest single quality win.**

### 2. Sampler / scheduler
euler_ancestral/normal (production default) and euler/normal render **softer/flatter**. The
**dpmpp_2m / karras** family (2m, 2m_sde, 3m_sde, res_multistep) is crisper. `dpmpp_2m_cfg_pp` is
**broken at CFG 5** (over-dark — cfg++ needs low CFG). `dpmpp_2m_sde/karras` gives slightly richer
detail but adds variance + is slower. **→ Winner: `dpmpp_2m / karras`** (reproducible; clear win
over euler_ancestral). `dpmpp_2m_sde/karras` = richer-detail option for one-off hero stills.

### 3. CFG / steps / smooth
CFG 5 balanced (cfg4 flat, cfg6 punchier, cfg7 harsh). **Steps 36 ≈ 28** (no gain — keep 28/18).
**smooth_booster 0.5** sweet spot (0.3 less depth, 0.7 softer). → existing core values confirmed.

### 4. Art style (10 anime styles on the locked recipe)
Highest quality: **S4 semi-realistic** (premium — realistic shading + depth + volumetric light;
shifts slightly toward realism) and **S9 ultra-detailed** (crispest *pure* anime). **S1 detailed**
= reliable low-risk always-on boost. **S5 cinematic** strong for atmospheric hero shots. Cel /
retro-90s / pastel are distinct but flatter; vibrant-modern introduces unwanted gloss.

## Production application
- **Sampler default → dpmpp_2m/karras** applied in comic-continuer `be_prompt.py`, Vellum
  `illustrious-prompt-builder.ts`, and bridge `ImageGenRequest` (+ tests). Immediate win for all
  renders (caller sets the `{{SAMPLER}}`/`{{SCHEDULER}}` tokens). Tier/body-hold mapping is
  cup-tag-driven so it's robust to the sampler change (suites were validated on euler_a;
  re-validation optional).
- **Hires latent→4x-AnimeSharp** + **detailer add** + **style-block default** = the remaining
  production application; needs preset-graph surgery across the bridge image presets, done as a
  focused tested unit (flagged task). Specs above are exact.

## New-tools bake-off — 2026-06-21 (post-install, ComfyUI restarted)
Tested the just-installed tools on the same fixed scene/seed (`gen_quality_newtools.py`,
`quality_newtools_face.png`): 2x-AnimeSharpV4 vs 4x-AnimeSharp, hires denoise 0.4 vs 0.3, Detail
Daemon, FreeU V2, and a combined max. All 7 rendered cleanly (V4 `.safetensors` loads; Detail
Daemon via SamplerCustomAdvanced + FreeU_V2 work).

| Tool | Verdict |
|---|---|
| **Detail Daemon** (detail_amount 0.15–0.2, SamplerCustomAdvanced) | **ADOPT** — real added crispness (knit/hair/face), ~free. Cost: hires sampler must be the custom-sampling chain + a custom-node dependency. |
| **2x-AnimeSharpV4** (RCAN, 2x→1.5x scale_by 0.75) | **Marginal** vs 4x-AnimeSharp on this scene — slightly cleaner edges but not a clear win. Keep 4x (already wired/validated); optional swap. |
| **FreeU V2** (b1 1.3/b2 1.4/s1 0.9/s2 0.2) | **Optional** — adds contrast/depth "pop" (visible in the combo). Core node (easy, no dep) but aesthetic + slight artifact risk; best as a hero-shot toggle, A/B before always-on. |
| denoise 0.3 vs 0.4 | ~equal with model-upscale; 0.4 fine (keep). |
| **combo (V4+DD+FreeU)** | crispest + punchiest; the max-quality hero config. |

**Adoption plan:** Detail Daemon is the worthwhile add (folded into the flagged rollout — it
restructures the hires sampler, so done as a tested unit; the `workflow_loader` test that asserts a
plain KSampler at 200:148 must be updated). V4 swap optional. FreeU as a hero toggle.
