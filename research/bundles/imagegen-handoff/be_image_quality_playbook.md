---
name: be-image-quality-playbook
description: Empirically-tuned WAI-illustrious-SDXL v17 + ComfyUI settings & prompt blocks for anime NSFW breast-expansion image quality. Use when generating/improving BE or large-bust anime images locally.
metadata: 
  node_type: memory
  type: reference
  originSessionId: ef90d20f-4a0f-4692-9f83-47585d91c694
---

Tuned over 4 refinement rounds on 2026-06-19 (baseline mean quality 5.69 → ~7.0+). Canonical cross-project index: `D:\LLM\IMAGE-GENERATION-STRATEGY.md`. Full playbook: `D:\LLM\ComfyUI_windows_portable\quality-upgrade\BE-PROMPT-PLAYBOOK.md`; preset workflow `…\ComfyUI\user\default\workflows\illustrious_image__WAI_v17_QUALITY.json`; round reports + generators in `…\quality-upgrade\`.

Key empirical findings (WAI v17 + ComfyUI, RTX 4090):
- **Sampler:** dpmpp_2m + karras, CFG 5 (cleaner than euler_a CFG6).
- **Pipeline:** base → 4x-AnimeSharp hires-fix (denoise 0.4) → **hand-detailer** (FaceDetailer + hand_yolov8s.pt, bbox_dilation 4, crop 2.0) → face-detailer only for full-body/multi-char. Hand-detailer was the single biggest fix (hands 3.5→~7).
- **Size ceiling = `huge`** (gigantic loses breast separation/torso-join coherence); one size tag only.
- **Separation:** use `(deep cleavage:1.2), cleavage`. **AVOID `between breasts` / `inter-breast shadow`** — they trigger a phantom object-in-cleavage prop (phone/can), worst in 2-char shots. This was P1 (solved v4).
- **Strain:** failure-mode block (`popped button, torn seam, asymmetric strain, fabric puckering at seams, stress folds, gaping shirt`); rigid garments (swimsuit) sell strain best. "buttons straining" alone does NOT render.
- **Gravity:** `hanging/heavy/soft/sagging breasts, soft tissue compression, cast shadow under breast` + both-breasts-visible pose.
- **Skin:** leave matte — do NOT add `shiny skin`/`wet`/`oily` (over-applied, flattens volume); add specular-streak negatives.
- **DanTagGen** node is installed but wedges ComfyUI (transformers 4.x / py3.13 tokenizer issue, patched but unreliable) — use **Autocomplete-Plus** instead for tag assist. See [[comfyui_install]].
- **Solo/intimate (rounds v5–v8):** hand-on-breast contact deformation via hand-detailer denoise 0.55 fed the contact prompt as its wildcard; supine gravity via `breasts spreading to sides/flattened` + DROP deep-cleavage on reclining cells; `(arched back:1.3)` + navel for pose. Finger render on grips fixed with a **HandRefiner** pass (`MeshGraphormer+ImpactDetector` → `illustriousXLDepth_v20` depth ControlNet → masked inpaint denoise 0.5, run AFTER the contact detailer). Setup deps installed into embedded py3.13: yacs, timm, trimesh, mediapipe (`--no-deps` to avoid the opencv/cv2 lock). Open structural gaps: side-lying gravity, growth/burst (need ControlNet/LoRA). Full recipe in the playbook doc; harnesses in `quality-upgrade/gen_test_suite_v5..v8.py`.

Routes for projects: image gen goes through si-animator-bridge `/image` → ComfyUI (localhost). Relevant to [[comic_continuer_project_start]].
