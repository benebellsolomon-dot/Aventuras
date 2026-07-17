# 32 — Krea image accuracy: deployed-pipeline ground truth + A/B tuning

**Date:** 2026-07-16 · **Status:** EMPIRICAL — pipeline source-verified, prime suspect ruled out,
11-render seed-fixed A/B matrix + a 6-render controlled resolution test (all viewed & scored).
Recommendations are actionable; the top one is app-side-only.
**Scope:** image-generation ADHERENCE (identity/size/scene faithfulness), not prompt quality.
Domain = adult anime BE. All infra is Ben's own (tailnet bridge + 4090 ComfyUI).
**CLIENT — read this or you'll conflate two paths:** this analyzes the **Aventuras app** (Tauri fork,
DB `com.karelian.aventura`), which calls the bridge's **A1111 shim** (`/sdapi/v1/txt2img`, no auth on
the tailnet). This is NOT the path *this repo* (ambrosia-st) uses — ambrosia-st calls the **native
`POST /image`** with a `StructuredImageSpec` + X-API-Key (`scripts/gen-image.mjs`). Same bridge, same
krea graph, different entry point and feature surface. Findings about the krea GRAPH (steps/cfg,
rebal, size ceiling) apply to both; findings about the SHIM (param clamping, marker parsing,
txt2img-only) are Aventuras-specific.
**Sources:** fresh clone of `github.com/benebellsolomon-dot/si-animator-bridge` @ `main` (tip
`d288ac0`, the deployment-current krea2 branch — the local `~/dev` clone is stale); the live shim
at `http://100.100.142.29:8001`; the app DB `com.karelian.aventura/aventura.db` (read-only). Every
fact below is PNG-metadata-, source-, or live-render-verified.

---

## 0. TL;DR — the three headline verdicts

1. **PRIME SUSPECT IS WRONG (but not harmless): `steps`/`cfg`/`sampler`/`scheduler` are 100%
   INERT on the krea path.** The turbo model is NOT being over-stepped/over-guided — the app's
   `28 steps / cfg 5 / dpmpp_2m_sde_gpu / sgm_uniform` never reach the sampler. The krea preset
   graphs HARDCODE `steps: 8, cfg: 2.0` and expose no `{{STEPS}}`/`{{CFG}}` token, and nothing
   mutates the loaded graph. Proven from source AND empirically (a cfg-1/steps-10 render is
   pixel-identical to a cfg-12/steps-60 render at the same seed). Tuning these app-side does
   nothing. They are dead config.

2. **The single biggest accuracy lever available TODAY is app-side only: emit the
   `__betier_<N>__` marker.** The app sends it on 0 of 12 stored prompts, so it never triggers the
   dormant `krea2_image_rebal.json` adherence-amplifier (routes in at tier ≥ 30). Prepending
   `__betier_39__` to the prompt string — no bridge change needed — gave a clear one-notch size
   increase in an A/B at fixed seed (the dominant real-render failure is size undershoot).

3. **Size adherence is ultimately CEILINGED in the graph.** Even `betier` + the app's production
   1536² only *approaches* "each breast larger than her head"; it doesn't reach true hyper. The
   rebal amp buys exactly one notch (source-documented; A/B-confirmed). Breaking the ceiling needs
   a bridge-side deploy (the deferred BE-dial LoRA rework, or routing high-BE to the Illustrious
   tier-LoRA path). Do not expect an app-config setting to move size past ~gigantic.

---

## 1. Deployed pipeline — ground truth (with file paths)

**Repo state.** The GitHub repo HAS the krea2 code (the local `~/dev/si-animator-bridge` clone is
stale). `main` is default and deployment-current; `path-b-image-endpoint` is identical (same tip
`d288ac0`). The live shim's `GET /sdapi/v1/sd-models` returns title **`krea2`**, and
`GET /sdapi/v1/samplers` returns `[dpmpp_2m, dpmpp_2m_sde, euler, euler_ancestral]` — both match
this source, confirming **deployed == `main`@`d288ac0`**. Krea era spans `8776911` (Make Krea2 the
native default) → `d288ac0` (krea-tier rebalance x4).

**The txt2img graph** (`src/presets/krea2_image.json`, ~14 nodes):
- `UNETLoader` → `Krea2\krea2_turbo_fp8_scaled.safetensors`
- `ComfyUI-Krea2T-Enhancer` (`kt`) strength **1.5**  ← a turbo enhancer, baked
- `Power Lora Loader (rgthree)` (`lo`) — `lora_1 = Krea2\Krea2_Nikki_Style_Anime_...` strength
  **1.25** ← the anime STYLE is enforced by a baked LoRA, not the prompt
- `CLIPLoader` `Qwen3VL4B\qwen3vl-4b-abliterated_fp8_e4m3fn.safetensors` type `krea2` (LLM-class,
  prose-native) · `VAELoader` `qwen_image_vae.safetensors`
- **Two-pass sampler (RES4LYF `ClownsharKSampler_Beta`), fully hardcoded:**
  - main (`main`): `sampler_name "linear/euler"`, `scheduler "simple"`, **steps 8**, **cfg 2.0**,
    denoise 1.0, eta 0.0
  - polish (`pol`): `sampler_name "exponential/res_2s"`, `scheduler "bong_tangent"`,
    `steps_to_run 2`, denoise 0.2, **cfg 2.0**, eta 0.9 (ancestral) — chained off `main`
- `VAEDecode` → `LayerFilter: AddGrain` (grain_power **0.09**) → `Image Lucy Sharpen` → `SaveImage`

The **only** template tokens in the krea graph are `POSITIVE_PROMPT`, `NEGATIVE_PROMPT`, `WIDTH`,
`HEIGHT`, `SEED`, `JOB_ID`. `STEPS`/`CFG`/`SAMPLER`/`SCHEDULER` do not appear.

**Preset variants:**
- `krea2_image_tier.json` — adds `lora_2 = {{TIER_LORA_NAME}}` @ `{{TIER_LORA_STRENGTH}}` (BE dial
  LoRA slot). **Currently unused** — the per-tier concept LoRAs were pulled for quality (smooth/
  balloon breasts, broken anatomy; `src/main.py:1456` comment). Size is noun-only until a rework.
- `krea2_image_rebal.json` — adds `ConditioningKrea2Rebalance` (`rebal`, multiplier **4.0**,
  per_layer_weights `1,1,1,1,1,1,1,2.5,5,1.1,4,1`) feeding BOTH samplers. The "adherence amp."
  Source says x4 saturates; x8–x20 add nothing (`src/main.py:1466`).
- `krea2_image_img2img.json` — `LoadImage → ImageScale(lanczos) → VAEEncode` init latent, main
  pass denoise `{{INIT_DENOISE}}`. **An init-image path for krea EXISTS** but is unreachable from
  the txt2img shim (see §1.3).
- `krea_edit.json` — Qwen-Image-Edit instruct-edit (needs `input_image_b64`).
  `krea2_seedvr2_upscale.json` — optional second-stage upscale.

### 1.1 What the A1111 shim does with steps/cfg/sampler/seed/size (`compat_txt2img`, `src/main.py:1814`)
- `sampler`: `_A1111_SAMPLER_MAP.get(req.sampler_name, ("dpmpp_2m","karras"))`. The app's
  `dpmpp_2m_sde_gpu` is not a map key → default. **Then discarded** (no `SAMPLER` token in graph).
- `req.scheduler`: **never even read.**
- `steps`: `max(10, min(60, req.steps))` → 28 stays 28 → token `STEPS` → **discarded**.
- `cfg`: `max(1.0, min(12.0, req.cfg_scale))` → 5.0 → token `CFG` → **discarded**.
- `width/height`: `max(512, min(2048, ·))` → **live** (real `WIDTH`/`HEIGHT` tokens).
- `seed`: passed through (`>= 0`) → **live** (`SEED` token).
- `workflow` is hardcoded `"krea2_image"`; `be_tier_index` comes from the `__betier__` marker.

Airtight: a grep of `src/main.py`, `src/comfy_client.py`, `src/prompt_builder.py` finds **no
post-load write** of steps/cfg/sampler into a workflow dict. The only graph mutation is
`prompt_builder.inject_regional` (Illustrious regional path; touches `positive` conditioning only).
`comfy_client.submit_prompt` POSTs the graph unmodified.

### 1.2 Routing through the shim (`submit_image`, `src/main.py:1943` + `2049–2107`)
| Input from app | Preset selected | Size handling |
|---|---|---|
| no `__betier__` marker | `krea2_image.json` (base) | prose only; `be_tier_index=None` so no noun appended |
| `__betier_N__`, N < 30 | `krea2_image.json` (base) | `_KREA_TIER_NOUNS` phrase appended (`src/main.py:1472`) |
| `__betier_N__`, N ≥ 30 | **`krea2_image_rebal.json`** | noun appended + x4 adherence amp |

`_KREA_TIER_NOUNS`: 0 flat · 3 small · 13 medium · 21 large · 29 "huge breasts, heavy bust" ·
39 "gigantic breasts, each breast larger than her head" (rebal band) · ∞ "hyper … colossal"
(rebal band). `_KREA_REBAL_TIER_MIN = 30`.

### 1.3 Prompt/negative processing (krea path, `_build_image_token_dict` `src/main.py:1494`)
- `_krea_normalize_prompt` strips `embedding:…` textual-inversion refs (they crash the Qwen3VL
  encoder → whole job fails) and tidies commas. No other rewriting.
- Default negative when caller sends none = `_KREA2_STYLE_NEG` (photoreal/3D/realism/western-comic
  block). The app sends its own negative → normalized then used verbatim.
- **NOTE — empty negative does NOT disable the negative:** `negative = req.negative_prompt or
  _default_image_negative(...)` (`src/main.py:1562`), so `""` falls back to the style block.

### 1.4 Identity / reference / img2img — what exists vs what the app can reach
- Native `POST /image` (`ImageGenRequest`, `src/models.py:508`) supports `reference_image_b64`
  (IPAdapter), `init_image_b64` (img2img), `pose_face_anchor_b64` (OpenPose+FaceID),
  `input_image_b64` (colorize/edit), and a structured `spec` (`StructuredImageSpec`) that runs the
  centralized `prompt_builder`. For krea, a plain `init_image_b64` routes to
  `krea2_image_img2img.json` (`src/main.py:2080`).
- **The app uses the A1111 shim, which is txt2img-only** — it supplies none of those fields. So
  today there is NO identity-conditioning / reference / img2img path in effect. This is the
  structural reason identity drifts across a scene: every frame is an independent txt2img.

---

## 2. Real-render mismatch catalog (app DB, read-only)

`embedded_images`: 12 rows, all `status='complete'` (note: value is `complete`, not "completed"),
all `model='krea2'`, stored **1536×1536** (not 1024 — the brief's 1024 is wrong for production).
**0 of 12 prompts contain a `__betier__` marker** → the app drives size by PROSE only → the rebal
amp is never triggered. Prompt shape: `explicit, uncensored, detailed anatomy, <prose scene>,
<lighting>, realistic art style.` + the anime style block. The 5 most recent (a "black-dyed-blonde,
amber-eyes" character — NOT Lucy — in explicit hallway scenes) were extracted and viewed:

| Failure mode | Severity | Evidence |
|---|---|---|
| **Size undershoot** (dominant, every high-BE image) | HIGH | "massively enlarged / each larger than her head" → rendered ordinary-huge. Matches source note "nouns saturate at ~huge." Compounded: no marker → no rebal. |
| **Pose/action miss** (complex, multi-actor, self-touch) | HIGH | paizuri "wrapped around his cock" → hand-holding; "cupping+lifting in offering" → hand on wall; "hand on throat + fist in hair" → absent. |
| **Clothing-state instability** | MED | db_00 put a black bikini over "bare breasts" (nude gate failed); db_03/db_05 were correctly bare. Inconsistent. |
| **Identity: "black-dyed-blonde"** | LOW | rendered as literal two-tone split hair every time (prompt-phrasing ambiguity, not a model defect). Eyes (amber-gold) always correct. |
| Anatomy/quality | — | GOOD across all (clean hands/faces). **The problem is adherence, not fidelity.** |

**Key reconciliation:** the DB undershoots were 1536² (good res) yet still small — so resolution is
NOT the cause (confirmed by the controlled test in §3). The cause is prompt COMPLEXITY: these were
explicit multi-element scenes with a competing second character and the "realistic art style"
contradiction. Attention divided → size + pose degrade. The clean solo Lucy prompt renders size to
the model's noun ceiling regardless of resolution. Adherence degrades with prompt complexity.

---

## 3. A/B render matrix — 11 renders, fixed seed 770077, all viewed

Baseline = the app's real request shape: canonical Lucy (holstaur, honey-blonde, warm brown eyes,
horns+ears, cottage kitchen, apron, glass jug of milk, "gigantic bare breasts each larger than her
head") + the exact style block + the app's negative + `steps 28 / cfg 5 / dpmpp_2m_sde_gpu`. Lever
sweep at 1024² (fast, valid for relative comparison); production shape at 1536². Harness + exact
request bodies in the appendix (reproducible). Pixel diff = mean-abs over a 256² downscale.

**Noise floor = 2.8%.** Two identical-param fresh renders differ 2.8% (from the unseeded AddGrain
0.09 + the eta-0.9 ancestral polish). Judge every lever against 2.8%. (An earlier apparent "0.0%"
was a ComfyUI cache-hit artifact, not determinism.)

| # | Lever changed from baseline | Δ vs R01 | Verdict |
|---|---|---|---|
| R01 | baseline (1024²) | — | strong: hair✓ eyes✓ horns+ears✓ scene-props✓ apron✓ quality✓; **size undershoot**, breasts contained not "spilling out" |
| R02 | identical rerun | 0.0%* / 2.8%† | *cache-hit; †fresh = noise floor |
| R03 | **steps 28→10, cfg 5→1, sampler→euler** | **0.0% (cache-hit, byte-identical workflow)** | **INERT — proven** |
| R04 | **steps 28→60, cfg 5→12, sampler DPM++2M Karras** | **2.8% (= noise floor, fresh render)** | **INERT — proven (2nd way)** |
| R05 | prepend **`__betier_39__`** (→ rebal amp) | 15.9% | **+1 size notch**, clear. Highest-value lever. |
| R06 | style block OFF | 12.2% | same adherence/composition; only finish/lighting shift. **Style block is cosmetic** (Nikki LoRA already enforces anime). |
| R07 | inject `, realistic art style` (the DB contradiction) | 6.4% | anime survives (LoRA wins); mild shading shift. Low-value; remove for cleanliness. |
| R08 | negative += huge/large/gigantic/big breasts | 4.4% | **size ~unchanged** — negative can't override the positive. |
| R09 | negative += apron/bikini/bra/clothing/… | 6.1% | **apron persists** — negative can't strip a positive garment. |
| R10 | baseline at **1536²** | (own compo) | more DETAIL/sharpness + tighter framing; single-seed it *looked* bigger than R01 but see the controlled test below — that was composition, not resolution. |
| R11 | `__betier_39__` at **1536²** | 14.2% vs R10 | biggest single render (~head-sized, + tail); rebal + higher detail. |

**Controlled resolution test (kills a wrong claim I nearly shipped).** Same baseline prompt, 3
seeds × {1024², 1536²} (S1024a/b/c, S1536a/b/c). Viewed as a montage: **size band is comparable
across resolutions** — 1536² is NOT consistently bigger than 1024². The apparent R01→R10 jump was
single-seed composition variance (seed doesn't port across resolutions, so R01 and R10 are
different compositions). **Resolution is a detail/sharpness lever, NOT a size lever.** Keep 1536²
for fidelity (native res), not for size.

**Adherence scorecard (checklist):** hair-color, eye-color, and species (horns+ears) render
**correctly and consistently** in every Lucy render — the holstaur species axis (a genuinely new
check the DB renders never exercised) is a non-issue. Scene props (kitchen, jug of milk, window,
stove) render **reliably**. Anatomy quality is high throughout. The axis that actually moves is **size band**, and
the only lever that moves it consistently is the **betier→rebal amp** (R05, single-seed +1 notch;
mechanism confounded — the marker both routes to rebal AND re-appends a size noun the base prompt
already contains, so don't over-attribute to the conditioning amp alone). Resolution does NOT move
it (controlled test above). Clothing-state ("bare, spilling out") is partial and not reliably
controllable via negatives.

**Negative-channel verdict (task Q: "does the graph even apply CFG?"):** CFG is applied (cfg 2.0 >
1, so negatives are not fully ignored — R08/R09 differ from baseline above the noise floor), but at
cfg 2.0 the negative has **very low authority**: it cannot shrink a prompted size (R08) or strip a
prompted garment (R09). Treat negatives as near-useless for adherence; drive everything from the
positive. The app's long anti-underage/anti-censor negative is doing almost no work (harmless).

---

## 4. Winning settings + levers, ranked

1. **Stop treating steps/cfg/sampler as tuning knobs — they are inert on krea.** No app-side value
   changes the render. (Optional cosmetic honesty: set the app's krea profile to `steps 8, cfg 2`
   so logs/telemetry match the graph — zero render effect.)
2. **Emit `__betier_<N>__` for BE characters (biggest win, app-side only).** Prepend the character's
   cup tier_index to the prompt string the app already sends; `_extract_be_tier` (`src/main.py:1788`)
   parses it, appends the size noun, and routes N ≥ 30 to the rebal amp. 0/12 current prompts use
   it. +1 size notch, no bridge change.
3. **Keep production at 1536² for FIDELITY (not size).** Resolution drives detail/sharpness, not
   size band (controlled 3-seed test, §3). The app already uses 1536²; no change needed. Do not
   expect dropping/raising resolution to change size.
4. **Decontaminate the prompt (app-side).** Drop the "realistic art style" clause (contradicts the
   baked anime LoRA; R07). For high-BE beats, keep the scene SIMPLE — competing actors/props/actions
   steal attention from size and pose (the DB undershoots were complex scenes; the clean solo R10/R11
   were on-spec).
5. **Do not invest in negatives to override PROMPTED content.** At cfg 2.0 the negative can't shrink
   a prompted size (R08) or strip a prompted garment (R09). Note: both tests pit the negative against
   a contradicting positive term, so they prove "negatives can't override prompted content" — they do
   NOT test whether a negative can suppress a HALLUCINATED garment (db_00's bikini, absent from the
   positive). That case is untested; a negative *might* help there. Safer default: strengthen the
   positive nude cue.

---

## 5. What to wire next — split by surface

**App-side (Aventuras fork `Projects/gaming/Aventuras`) — no bridge deploy needed:**
- Prompt-processing: prepend `__betier_<cupTierIndex>__ ` for BE characters (mirror the ST
  `SD_PROMPT_PROCESSING` enrichment the shim already expects). **Highest ROI.**
- Provider profile: drop the "realistic art style" clause; optionally set steps=8/cfg=2 (cosmetic);
  keep 1536². Consider making the style block optional (it's cosmetic — R06).
- Scene-scope discipline for high-BE frames (fewer competing elements).

**Bridge-side (deploy on the PC) — larger, unlocks the ceilings:**
- **Identity consistency:** expose an img2img/reference route to the app. Either (a) have the app
  call native `POST /image` with `init_image_b64` (→ `krea2_image_img2img.json`, already built) or
  `reference_image_b64`, or (b) extend the A1111 shim to accept `init_images[]` (A1111 img2img
  shape) and forward it. This is the real fix for cross-frame identity drift (today every frame is
  independent txt2img).
- **Break the size ceiling:** the deferred BE-dial LoRA rework for `krea2_image_tier.json` (the slot
  exists, `TIER_LORA_STRENGTH` token wired), OR route high-BE specs to the Illustrious tier-LoRA
  path (real `Breast_Size_Slider` + hyper-concept LoRAs) via native `/image` with `be_moments` —
  at a style cost. Worth a bake-off.
- **Optional knobs:** if Ben ever wants live control, promote `cfg`/rebal-`multiplier`/Krea2T-
  `strength` to `{{TOKEN}}`s in the krea presets and pass them through the shim. Not needed for the
  wins above.

---

## 6. Open questions
- **krea BE-dial LoRA vs Illustrious tier-LoRA for high-BE:** which gives bigger on-spec size at
  acceptable krea-quality? Needs a bridge-side bake-off (both paths exist).
- **Identity route choice:** native `/image` (richer spec, app rework) vs extending the A1111 shim
  with `init_images[]` (smaller app change). Ergonomics call for Ben.
- **Does the app compute a cup tier_index today?** If yes, wiring `__betier__` is trivial; if not,
  it needs the BE body-state → tier map first (the NAI engine's `tier_to_cup_tag` is the reference).
- **rebal at higher multiplier / lower threshold:** source says x4 saturates, but the threshold
  (30) and the per-layer weights were never swept against the holstaur/species axis — a bridge-side
  experiment if the one-notch gain proves insufficient live.

---

## Appendix — reproduction

Harness: a small Python script POSTs `http://100.100.142.29:8001/sdapi/v1/txt2img` with the A1111
JSON body `{prompt, negative_prompt, steps, cfg_scale, sampler_name, scheduler, width, height,
seed}`, saves `data.images[0]` (base64 PNG), and diffs via `PIL.ImageChops`. Fixed `seed=770077`.

Baseline positive (R01), app-shape:
```
detailed anatomy, an adult holstaur cow-girl woman with honey-blonde hair and warm brown eyes,
short curved cow horns and fuzzy cow ears, standing in a sunlit rustic cottage kitchen, wearing a
loose white apron, her gigantic bare breasts each larger than her head spilling out heavy and
round, gentle warm smile, wooden counter with a glass jug of milk, warm morning light. High-quality
detailed anime illustration with clean expressive linework, rich colors, refined shading, and
cinematic lighting. Crisp focus and polished detail throughout. Every depicted character is a
mature adult in their twenties or older.
```
Baseline negative (the app's): `bad anatomy, bad hands, extra fingers, signature, watermark,
username, child, loli, kid, shota, young, underage, censored, mosaic censoring, bar censor, blurry
genitals`.

Lever deltas: R03 `steps=10,cfg_scale=1,sampler_name=euler`; R04 `steps=60,cfg_scale=12,
sampler_name="DPM++ 2M Karras"`; R05 prepend `"__betier_39__ "`; R06 drop the style block; R07
append `, realistic art style` before the block; R08 negative += `huge breasts, large breasts,
gigantic breasts, big breasts`; R09 negative += `apron, bikini, bra, clothing, clothed, covered
chest, shirt`; R10 `width=height=1536`; R11 R05+R10. Controlled resolution test: S1024a/b/c =
baseline at 1024² with `seed` 111111/222222/333333; S1536a/b/c = same three seeds at 1536²
(montaged 2×3 to compare size band across resolution). Proof of inertness: R03 (extreme-low) is
pixel-identical to baseline (byte-identical workflow → ComfyUI cache-hit); R04 (extreme-high) is at
the 2.8% noise floor — steps/cfg/sampler have zero render effect. Total real renders: 16 (+2
cache-hits).
