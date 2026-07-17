# Nude-Path Full Tier-Ladder Test — Report

**Date:** 2026-06-20 · **Model:** WAI-illustrious-SDXL v17 · **Rating:** `sensitive` (intimacy="nude")
· **Path:** production preset graph + live `be_prompt.py` rating logic, direct-to-ComfyUI ·
13 tiers (0→50), locked nude scene (topless/bare breasts, front cowboy shot), seed 111.

Extends the hyper-band suite to the **bare-skin regime across ALL tiers** (not just hyper). The
nude regime is materially different from clothed: garment strain was a major size cue, and bare
anatomy adds new failure surfaces (nipple/areola, accidental censoring, maturity at low tiers).

Faithfully replicates the production rating blocks: `sensitive` rating tag + `CENSORSHIP_AFFIRM_POS`
(`uncensored, detailed anatomy, clear view`), and — correctly — **NO** `CENSORSHIP_SUPPRESSION_UC`
(that fires only on `explicit`). Negative otherwise identical to the clothed ladder, so the only
deltas are rating + affirm + bare skin. Harness: `gen_nude_ladder_sweep.py`; montages:
`nude_ladder_torso.png`, `nude_ladder_full.png`.

## Result: PASS at all tiers — nude path is production-ready, no rating-logic change needed

| Check | Verdict |
|---|---|
| **Size monotonic on bare skin** (no garment-strain cue) | ✅ clean 0→50 growth; slider/cup/hyper drive bare-breast volume directly |
| **No censoring on the `sensitive` path** (which lacks the suppression block) | ✅ zero censoring at any tier — the affirm block alone is sufficient on WAI v17 |
| **Maturity guard at low tiers** (flat t0, small t2 nude) | ✅ **both read clearly adult** — adult face + body proportions; the `mature female, adult` + child/loli/young suppressors hold at the most sensitive combination |
| **Bare-anatomy coherence** | ✅ correct nipple/areola placement; **breast separation holds (no uniboob/fusion) even at gigantic/hyper bare**; natural heavy hang at the top |
| **No fusion / extra breasts** | ✅ two distinct breasts at every tier |

### Key validations
- **The production rating logic is correct as-is.** `sensitive → affirm only` produces fully
  uncensored bare-skin output on WAI v17; the censorship-suppression block is genuinely
  explicit-only and not needed here. No change to `be_prompt.py` / Vellum builder required.
- **Maturity safety holds on the nude path** — the highest-risk cells (flat/small + nude) render
  as slim adult women, not underage. The guard is robust.
- **Size ladder is regime-independent** — monotonicity and band separation survive the loss of
  the garment-strain cue.

## Finding (minor, cosmetic — optional polish)
- **Skin gloss / specular sheen is more prominent on bare skin** than clothed — the
  `Smooth_Booster_v5` LoRA (0.5) partially overrides the `(matte skin:1.2)` tag, visible as
  highlights on the torso/breasts. Consistent across tiers; does not break coherence. The playbook
  prefers matte (gloss flattens perceived volume). If pursued: add `glossy skin, oily skin, wet
  skin, specular highlights` to the negative on the bare-skin path, and/or lower smooth_booster to
  ~0.3 when `is_bare_skin`. Not blocking.

## Not covered (next extension if wanted)
- **Explicit path** (`intimacy="sex"` → `explicit`): the `CENSORSHIP_SUPPRESSION_UC` branch +
  full nudity/genital anatomy. This test only covered `sensitive` (nude/topless). The suppression
  block's effect is untested because `sensitive` didn't need it — explicit is where it matters.
- Bare-skin × pose/framing interactions (this was cowboy/standing only; the clothed suite covered
  framing/pose separately).
