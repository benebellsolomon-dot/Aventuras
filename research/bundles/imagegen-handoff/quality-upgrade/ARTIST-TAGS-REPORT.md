# Artist-Tag House-Blend Playbook — modern-anime style on Illustrious/NoobAI/WAI

Web research (2025-26) + **direct Danbooru post-count verification** of every tag. Artist tags are
the single biggest *style* lever we don't use (per SOTA-GAP-ANALYSIS). This is the ready-to-use spec.

## Mechanics
- **Syntax:** `artist:<name>`, `by <name>`, or bare `<name>` all work (CLIP fuzzy-matches the Danbooru
  artist token). Pick one and stay consistent — `artist:` is safest across all three models.
- **Underscores → spaces** (`ningen mame`, not `ningen_mame`). **Escape literal parens:** `sho \(sho_lwlw\)`.
- **Placement:** after character/series, before general tags. Earlier = stronger.
- **Weights 0.7–1.3** (default ~0.8–1.0); start low, raise. **Count 2–3** (more → mush unless all pulled to ~0.7–0.85).
- **CLIP-only:** this works on SDXL/Illustrious; it breaks on LLM-encoder models (Flux/Qwen).

## Verified blends (Danbooru counts confirmed; all NSFW-capable)
| Tag | posts | style |
|---|---|---|
| `as109` | 1535 | clean, detailed, glossy modern illustration (anchor) |
| `ningen mame` | 592 | vivid color, clean rendering |
| `rella` | 488 | clean lineart + soft pastel shading, commercial polish |
| `wlop` | 398 | semi-realistic digital painting, rim light, atmospheric |
| `ciloranko` | 248 | soft luminous painterly shading, glossy skin |
| `tianliang duohe fangdongye` | 151 (alias `antifreez3`) | atmospheric, painterly |
| `todoroki masaru` | 122 (canonical for `sho \(sho_lwlw\)`) | soft glossy vivid portraits |

**Calibration:** premium-look artists cluster ~120–1500 posts (NOT thousands) — still reproduce reliably
since Illustrious/NoobAI trained hard on this cohort.

**Ready-to-use blends** (place after character/series; tune ±0.1):
1. **Clean Premium (DEFAULT house blend):** `(as109:0.9), (rella:0.8), (ciloranko:0.7)` — glossy, clean-lineart, soft-shaded. Safest all-rounder; `as109`'s count anchors it.
2. **Painterly Glow:** `(ciloranko:0.85), (wlop:0.6), (ningen mame:0.7)` — luminous, atmospheric, rim-lit (keep `wlop` low — pulls semi-real).
3. **Soft Commercial:** `(rella:0.9), (ningen mame:0.7), (tianliang duohe fangdongye:0.6)` — pastel, refined, "official illustration."
4. **Glossy Portrait:** `(as109:0.9), (todoroki masaru:0.7), (ciloranko:0.6)` — glossy detailed faces.

## Caveats
- **Post count = reliability.** Floor ≈ low hundreds; tens of images = undertrained/risky.
- **Long prompts degrade artist style** (strongest empirical finding): stacking corrupts each artist; style drifts weaker the further back the tag sits; keep artists near the front, total ~20–40 tags. Longer artist *names* are more stable.
- **Aliasing trap:** Danbooru renames/merges tags; the model learned the training-snapshot string. If a tag "stopped working" it was likely aliased — try the old form. Confirmed: `sho_(sho_lwlw)`→`todoroki_masaru`, `tianliang_duohe_fangdongye`↔`antifreez3`.
- **Platform bans ≠ model bans:** Civitai's real-person-likeness ban doesn't remove illustration-artist style tags from open SDXL weights. Mixing 3 signatures launders any single living artist's hand (the defensible ethical posture).
- **Corrections:** `agm` → use `omone_hokoma_agm`; `wanke` / `quan_(kuraguragura)` unconfirmed — verify first.

## Verification workflow
1. Count: `danbooru.donmai.us/posts?tags=<artist>` (sidebar count; also reveals aliases). Batch: `.../posts.json?tags=<artist>&limit=0`.
2. Preview style + dataset strength: **ThetaCursed Illustrious-NoobAI-Style-Explorer** (`thetacursed.github.io/Illustrious-NoobAI-Style-Explorer/`) — 16k+ artists, previews, sortable by training-image count.
3. Bulk: `mimizukari/NoobAI-NAI-XL-Wildcards` (HF), Civitai "Illustrious Style Wildcard", ComfyUI-EasyNoobai in-graph picker.

## VALIDATED on WAI v17 (2026-06-21 bake-off, `quality_artiststyle_full.png`)
Rendered baseline vs style blocks vs the 3 artist blends vs combos on our recipe (dpmpp_2m/karras +
4x-AnimeSharp hires), fixed subject/seed. **The artist blends work and clearly elevate the aesthetic**
toward polished "professional illustration" (glossy clean rendering, refined faces, better lighting) —
a bigger lift than the plain style blocks, confirming the research. Findings:
- **Blend #1 `(as109:0.9), (rella:0.8), (ciloranko:0.7)` = best clean modern-anime default.**
- **Best combo: Blend #1 + `(highly detailed:1.2), intricate details, sharp focus`** (A6) — refined +
  crisp + atmospheric; the recommended premium default.
- Blend #2 (Painterly Glow, +wlop) = atmospheric/luminous alt; Blend #1 + semi-realistic (A7) = most
  realistic/premium. Plain style blocks help but are secondary to the artist blend.

## Application — reusable across ALL projects (general capability)
This is a **prompt-level** capability (no preset change). Recommended general default style block to
prepend after identity tags for any color-anime project: `(as109:0.9), (rella:0.8), (ciloranko:0.7),
(highly detailed:1.2), intricate details, sharp focus`. Selectable presets: Painterly Glow
(`(ciloranko:0.85), (wlop:0.6), (ningen mame:0.7)`), Semi-real (`+ (semi-realistic:1.15), realistic
skin texture, volumetric lighting`). Keep artist tags early (after character/series), 2-3 artists,
total prompt ~20-40 tags. **Manga/monochrome projects (comic-continuer): skip the artist blend.**
