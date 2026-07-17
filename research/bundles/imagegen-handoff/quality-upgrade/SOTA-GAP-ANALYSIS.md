# Modern Anime Art-Gen — Where We Are vs SOTA (mid-2026)

5-agent web research benchmarking our WAI-illustrious-SDXL stack against current SOTA. Bottom line:
**our stack is still top-tier and ~85-90% current — the constraint is ecosystem/technique, not VRAM
(a 4090 runs everything here).** We're not behind; we're leaving specific, mostly-cheap gains on the table.

## Where we are (validated current / SOTA — keep)
- **Base — WAI-illustrious v17:** still the **#2 best-balanced NSFW anime daily driver** (behind NoobAI-XL on knowledge depth + dynamic range). Not obsolete; it's an epsilon model on the 2024 Illustrious v1.0 base.
- **Sampler — dpmpp_2m/karras:** still the "gold standard" default. Confirmed.
- **Hires shape — model-upscale + low-denoise refine:** correct pattern for anime (latent-only hallucinates on flat color).
- **Hands — MeshGraphormer HandRefiner:** still SOTA for finger geometry, no newer method beats it.
- **Faces — FaceDetailer:** current. **Identity — IPAdapter FaceID PlusV2:** still defensible (best raw similarity among adapters, least tone damage — our nude-washout fix confirms the literature). Keep.
- **Pose/Depth — xinsir OpenPose + Illustrious Depth:** current.
- **Prompting:** ~85-90% aligned with best practice.

## What we're missing — prioritized

### Tier 1 — cheap, high-ROI (mostly free, low risk)
1. **Detail Daemon** (`Jonseed/ComfyUI-Detail-Daemon`, detail_amount ~0.15-0.2 for SDXL) — injects fine line/detail by lowering noise-removed-per-step; ~zero cost; flagged by 2 agents as best effort:reward. **Top pick.**
2. **Upscaler swap → `2x-AnimeSharpV4` (RCAN)** (HF `Kim2091/2x-AnimeSharpV4`) + **lower hires denoise 0.4→~0.3.** Our 4x-AnimeSharp is a 2022 ESRGAN; V4 RCAN is cleaner; and d0.4 is high (likely re-drawing, not just sharpening). Needs a quick re-bake-off vs our validated 4x-AnimeSharp.
3. **Prompting tweaks** (near-free): drop cargo-cult `amazing quality`; add **`official art`** (strongest modern-anime shading tag) + a modern-render token set (`soft shading, clean lineart, rim lighting, glossy highlights, atmospheric perspective`); **lighten the negative** (don't run a quality embedding AND overlapping quality-text together) + add `old, early` to reinforce `newest`.
4. **FreeU V2** (built into ComfyUI, defaults b1 1.3/b2 1.4/s1 0.9/s2 0.2) — free detail/contrast bump, anime-friendly; A/B it.
5. **Dedicated eye/iris detailer** (MediaPipeFaceMesh→SEGS eyes-only, or `Eyes.pt` YOLO → 2nd FaceDetailer) — cheapest visible face-quality win we lack.
6. **Artist-tag style layer** — the single biggest *style* lever we don't use. A curated 2-3 artist "house blend" (early in prompt, balanced weights) gives ~LoRA-quality modern-anime style with no LoRA. (Audition via Illustrious-NoobAI-Style-Explorer; verify each artist has enough Danbooru images.)

### Tier 2 — capability gaps (moderate effort)
7. **Tile ControlNet** (xinsir Union **ProMax** `diffusion_pytorch_model_promax.safetensors`, or a native-Illustrious tile CN) — biggest control gap; coherent detail injection during hi-res. Prefer native-Illustrious tile to avoid color shift.
8. **Sampler re-bake-off:** `er_sde`/beta and `res_multistep`/beta vs dpmpp_2m/karras (the 2026 community moved toward er_sde for line/background retention); test `kl_optimal` on the hires pass ("free detailer").
9. **PAG or SEG** as a *gated* quality toggle for hands/anatomy (SEG preferred for anime — less saturation; ~2× time, so don't make it always-on).
10. **Ultimate SD Upscale** (tiled) for 2K-3K finals (held in reserve; our 1.5× target doesn't need it yet).
11. **Regional prompting / attention-couple** for 2+ character panels (EasyIllustrious regional / ComfyEnhancedMultiRegion) — stops feature/color bleed.
12. **Per-character LoRAs** (we have kohya_runner) for recurring cast + FaceID top-up — tightest identity, zero tone damage; beats swapping FaceID for PuLID/InstantID.

### Tier 3 — forward-looking (R&D / watch)
13. **NoobAI-XL** — add to stack: **Epsilon-pred 1.1** (near-zero-effort A/B, keeps our CFG/sampler/epsilon-LoRA habits) and **V-pred 1.0** (true blacks + best adherence; needs CFG≈4 + RescaleCFG≈0.2 + ModelSamplingDiscrete + native NoobAI IPAdapter + v-pred LoRAs). Same SDXL footprint. Deeper Danbooru+e621 knowledge.
14. **NetaYume Lumina** (Lumina-2 arch, tag-native, Apache-2.0) — new-architecture pilot; trivial on 4090 but LoRAs/ControlNet/IPAdapter must be rebuilt (R&D, not daily-driver swap).
15. **HyperLoRA** (ByteDance, zero-shot LoRA-grade identity) — pilot only; portrait-trained, anime transfer untested.

### Skip (researched, not worth it for us)
- **PuLID-SDXL** (lower fidelity, maintenance-only), **InstantID** (realism-ifies anime + fights pose lock), **SUPIR/CCSR** (realism upscalers — wrong for cel art), **SD3.5** (abandoned + NSFW-banned), **Pony V7** (immature, broken score tags, zero SDXL carryover), **Animagine 4.0** (weak NSFW).

## Net read
Our pipeline shape is right for 2026. The realized wins this session (dpmpp_2m/karras, 4x-AnimeSharp hires) are confirmed correct. The biggest *unrealized* gains, in order: **Detail Daemon, 2x-AnimeSharpV4 + lower denoise, prompting (official art + artist blend + lighter negative), eye detailer, tile ControlNet** — then the NoobAI-XL pilot for a knowledge/contrast step-up without leaving SDXL.
