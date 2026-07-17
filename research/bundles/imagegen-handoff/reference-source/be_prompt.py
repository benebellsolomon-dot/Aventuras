r"""BE (breast expansion) prompt builder for Illustrious / WAI v17.

Direct Python port of Vellum's `src/server/engine/illustrious-prompt-builder.ts`
v2.1 calibration. Match bit-exact — Vellum's snapshot tests pin these values,
and rendering consistency across the D:\LLM portfolio depends on it.

v2.1 calibration ladder (cup tag carries band, slider fine-tunes):

  tier band  | cup tag                | slider range  | hyper concept
  ───────────┼────────────────────────┼───────────────┼──────────────
  0          | flat chest             | -1.5 .. -1.0  | 0
  1-3        | small breasts          | -0.8 .. -0.4  | 0
  4-7        | medium breasts         | -0.4 .. 0.0   | 0
  8-13       | medium breasts         |  0.0 .. +0.2  | 0
  14-21      | large breasts          |  0.0 .. +0.4  | 0
  22-29      | huge breasts           |  0.3 .. +0.6  | 0
  30-39      | gigantic breasts       |  0.4 .. +0.7  | 0
  40-49      | hyper breasts          |  0.5 .. +0.59 | 0.5 -> 0.82
  50+        | hyper breasts          |  0.6          | 0.85

v2.2 hyper-band recalibration (2026-06-20): the v2.1 hyper band reset the slider
to 0.3 at tier 40 while hyper only reached 0.3, so tier 40 rendered SMALLER than the
gigantic peak (tier 39, slider 0.7) — a non-monotonic dip at the band seam — and the
whole hyper band (40-50) barely exceeded gigantic. Fix (empirically swept on WAI v17,
fixed seed/scene): keep the slider elevated through the hyper band (0.5->0.6) and push
the hyper concept LoRA 0.5->0.85. tier 40 (0.5/0.5) now clears the gigantic peak and
tier 50 (0.6/0.85) is dramatically larger while staying coherent; (0.7/1.0) saturates
with no size gain, so 0.85 is the ceiling. See quality-upgrade/TIER-LADDER-REPORT.md.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional, Sequence

# ───────── Quality / scaffolding (v2.1) ─────────

# 2026-06-21 polish: dropped "amazing quality" — not part of the Illustrious/NoobAI quality
# hierarchy (masterpiece > best quality > good > normal > low > worst); it's Animagine-flavored
# cargo-cult that dilutes the high-attention prompt head. See ARTIST-TAGS-REPORT.md / SOTA research.
QUALITY_TAGS: tuple[str, ...] = (
    "masterpiece", "best quality",
    "very aesthetic", "newest", "absurdres", "highres",
    "official art",
)

MATURE_ANCHOR: tuple[str, ...] = ("mature female", "adult")

DEFAULT_LIGHTING_TAG = "cinematic lighting"

# Negative baseline — embeddings carry the generic quality/anatomy suppression load.
# 2026-06-21 polish: lightened per current Illustrious practice — DON'T double the embedding with
# redundant quality text. Dropped lowres/worst quality/bad quality/jpeg artifacts (Illust_Neg-neg
# already covers them); kept bad anatomy/bad hands as cheap guards (complement the detailers);
# added old/early to reinforce `newest` -> modern-anime era.
HEAVY_UC_BASE: tuple[str, ...] = (
    "embedding:Illust_Neg-neg",
    "embedding:BadDigitalHandsNeg",
    "bad anatomy", "bad hands",
    "signature", "watermark", "username",
    "old", "early",
    # Maturity suppressors — non-negotiable.
    "child", "loli", "kid", "shota", "young", "underage",
)

# P0-1 censorship-suppression cluster. Appended ONLY when rating is 'explicit'.
CENSORSHIP_SUPPRESSION_UC: tuple[str, ...] = (
    "censored", "mosaic_censoring", "bar_censor", "convenient_censoring",
    "censor_bar", "heart_censor", "light_censor", "novelty_censor",
    "dotted_line_censor", "hair_censor", "soap_censor", "steam_censor",
    "pasties", "blank_censor", "identity_censor", "pixelated", "mosaic",
    "blurry_genitals",
)

# Affirmative companion — appended for ratings implying bare skin.
CENSORSHIP_AFFIRM_POS: tuple[str, ...] = (
    "uncensored", "detailed anatomy", "clear view",
)

# Identity-preservation anchor — prevents drift across paired renders.
IDENTITY_ANCHOR_NEG = "(different character, different hair color, different eye color:1.1)"


# ───────── Intimacy → rating ─────────

_INTIMACY_RATINGS = {
    "sex": "explicit",
    "explicit": "explicit",
    "nude": "sensitive",
    "mature": "sensitive",
    "suggestive": "general",
    "clean": "general",
}


def intimacy_to_rating(intimacy: Optional[str]) -> str:
    """Map an intimacy label to an Illustrious Danbooru rating tag."""
    if not intimacy:
        return "general"
    return _INTIMACY_RATINGS.get(intimacy.lower(), "general")


# ───────── Tier → cup tag ─────────

def tier_to_cup_tag(tier: Any) -> Optional[str]:
    """Map tier_index to the SINGLE Danbooru cup-band tag for that band."""
    if not isinstance(tier, (int, float)) or tier != tier:  # NaN guard
        return None
    t = max(0, int(tier))
    if t == 0:
        return "flat chest"
    if t < 4:
        return "small breasts"
    if t < 14:
        return "medium breasts"
    if t < 22:
        return "large breasts"
    if t < 30:
        return "huge breasts"
    if t < 40:
        return "gigantic breasts"
    return "hyper breasts"


# ───────── Tier → slider LoRA weight ─────────

_SLIDER_ANCHORS: tuple[tuple[int, float], ...] = (
    (0, -1.5), (4, -0.7), (8, -0.2), (12, 0.1),
    (14, 0.0), (21, 0.4),
    (22, 0.3), (29, 0.6),
    (30, 0.4), (39, 0.7),
    # hyper band: slider held elevated (was reset to 0.3) so tier 40 clears the
    # gigantic peak; paired with the stronger hyper ramp below. See v2.2 note.
    (40, 0.5), (50, 0.6),
    (100, 0.6),
)


def tier_to_slider_weight(tier: Any) -> float:
    """Sawtooth slider curve. Returns weight in roughly [-1.5, +0.7]."""
    if not isinstance(tier, (int, float)) or tier != tier:
        return 0.0
    t = max(0, int(tier))
    if t <= _SLIDER_ANCHORS[0][0]:
        return _SLIDER_ANCHORS[0][1]
    if t >= _SLIDER_ANCHORS[-1][0]:
        return _SLIDER_ANCHORS[-1][1]
    for i in range(1, len(_SLIDER_ANCHORS)):
        a_t, a_w = _SLIDER_ANCHORS[i - 1]
        b_t, b_w = _SLIDER_ANCHORS[i]
        if t <= b_t:
            frac = (t - a_t) / (b_t - a_t)
            return round((a_w + (b_w - a_w) * frac) * 100) / 100
    return 0.0


def tier_to_hyper_concept_weight(tier: Any) -> float:
    """Hyper concept LoRA: off below tier 40, ramps 0.5 → 0.85 across 40-50.

    v2.2: raised from the v2.1 0.3→0.5 ramp. With the slider also held elevated
    through the hyper band, this removes the gigantic→hyper seam dip and lets the
    hyper band read clearly larger than gigantic. 0.85 is the saturation ceiling
    (0.85→1.0 adds no size on WAI v17).
    """
    if not isinstance(tier, (int, float)) or tier != tier or tier < 40:
        return 0.0
    t = min(50, int(tier))
    return round((0.5 + (t - 40) * 0.035) * 100) / 100


# ───────── Image request builder ─────────

# Default IllustriousImageRequest sizing — matches Vellum's defaults.
DEFAULT_WIDTH = 832
DEFAULT_HEIGHT = 1216
DEFAULT_STEPS = 28
DEFAULT_CFG = 5.0
# 2026-06-21 quality bake-off: dpmpp_2m/karras renders crisper than euler_ancestral/normal
# (softer). Tier mapping is cup-tag-driven so it's robust to the sampler change.
# See quality-upgrade/QUALITY-BAKEOFF-REPORT.md.
DEFAULT_SAMPLER = "dpmpp_2m"
DEFAULT_SCHEDULER = "karras"
SMOOTH_BOOSTER_DEFAULT_WEIGHT = 0.5  # community recommendation for stacked-LoRA chain

# Default tier when LLM omits the field — manga BE genre baseline.
DEFAULT_TIER = 14


def _dedupe_keep_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it and it not in seen:
            seen.add(it)
            out.append(it)
    return out


def _character_descriptors(characters: Sequence[Any]) -> list[str]:
    """Pull free-text descriptors out of v1 panel-script character entries.

    v1 characters are either:
      - strings ("short brown hair girl")
      - dicts with `description` or `tags` fields
    """
    out: list[str] = []
    for c in characters:
        if isinstance(c, str):
            if c.strip():
                out.append(c.strip())
        elif isinstance(c, dict):
            for key in ("description", "tags", "name"):
                v = c.get(key)
                if isinstance(v, str) and v.strip():
                    out.append(v.strip())
                elif isinstance(v, list):
                    for t in v:
                        if isinstance(t, str) and t.strip():
                            out.append(t.strip())
    return out


def build_image_request(
    panel: dict,
    *,
    characters: Optional[Sequence[Any]] = None,
    world_theme: str = "",
    seed: Optional[int] = None,
    width: int = DEFAULT_WIDTH,
    height: int = DEFAULT_HEIGHT,
    steps: int = DEFAULT_STEPS,
    cfg: float = DEFAULT_CFG,
    sampler: str = DEFAULT_SAMPLER,
    scheduler: str = DEFAULT_SCHEDULER,
    extra_tags: Optional[Sequence[str]] = None,
    reference_image_b64: Optional[str] = None,
    reference_weight: float = 0.7,
    # v2.2 — series style LoRA. Only the name is sent to the bridge;
    # the trigger token is prepended to the positive prompt client-side
    # (so the bridge can stay style-LoRA-agnostic). The weight is NOT a
    # comic-continuer kwarg in v2.2 — the bridge's Pydantic default
    # series_lora_weight=0.8 is the single source of truth (see W5 spec §10 Q3).
    # When series_lora_name is None, the bridge routes to the v2.1 IPA
    # preset and the trigger is not prepended.
    series_lora_name: Optional[str] = None,
    series_lora_trigger: Optional[str] = None,
) -> dict:
    """Compose an IllustriousImageRequest payload ready to POST to /image.

    v1 panel-script shape:
        {
          "composition": "<wide shot|medium|close-up|...>",
          "setting": "<...>",
          "characters": ["<descriptor>", ...],
          "action": "<...>",
          "dialogue": [...],
          "visual_prompt": "<freeform tag string from LLM, optional>",
          "tier_index": int (0-100),  # NEW for BE-tailored v1
          "intimacy": "clean|suggestive|nude|sex",  # NEW for BE-tailored v1
        }

    Output structure (positive prompt ordering matters for Illustrious attention):
        [rating], [quality stack], [world theme], [lighting], [mature anchor],
        [censorship-affirm if bare skin], [identity tags], [scene tags],
        [body tags], [cup tag], [extra tags]
    """
    tier_index = panel.get("tier_index", DEFAULT_TIER)
    if not isinstance(tier_index, (int, float)):
        tier_index = DEFAULT_TIER

    rating = intimacy_to_rating(panel.get("intimacy"))
    is_bare_skin = rating in ("explicit", "sensitive")
    is_explicit = rating == "explicit"

    cup_tag = tier_to_cup_tag(tier_index)

    world_theme_tags = [t.strip() for t in world_theme.split(",") if t.strip()]

    char_tags = _character_descriptors(characters or panel.get("characters", []))

    composition = panel.get("composition", "")
    setting = panel.get("setting", "")
    action = panel.get("action", "")
    visual_prompt = (panel.get("visual_prompt") or "").strip()

    # Scene tags drawn from the panel's structural fields. The LLM-provided
    # visual_prompt is treated as a freeform extension and gets de-duped.
    scene_tags: list[str] = []
    for s in (composition, setting, action):
        if isinstance(s, str) and s.strip():
            scene_tags.append(s.strip())
    if visual_prompt:
        for piece in visual_prompt.split(","):
            p = piece.strip()
            if p:
                scene_tags.append(p)

    # Style anchor — manga register, always-on for this project's genre.
    style_anchor = ["manga style", "monochrome", "screentone", "line art", "detailed"]

    extra = list(extra_tags or [])

    positive_parts: list[str] = [
        rating,
        *QUALITY_TAGS,
        *world_theme_tags,
        DEFAULT_LIGHTING_TAG,
        *MATURE_ANCHOR,
    ]
    if is_bare_skin:
        positive_parts.extend(CENSORSHIP_AFFIRM_POS)
    positive_parts.extend(char_tags)
    positive_parts.extend(scene_tags)
    if cup_tag:
        positive_parts.append(cup_tag)
    positive_parts.extend(style_anchor)
    positive_parts.extend(extra)

    positive = ", ".join(_dedupe_keep_order(p for p in positive_parts if isinstance(p, str) and p))

    # v2.2 — prepend the series LoRA trigger token. Always-on when a
    # trigger is supplied (paired with series_lora_name); the trigger is
    # a project-specific tag that fires the LoRA's attention. Prepended
    # rather than appended because Illustrious gives early tokens higher
    # attention weight. Done AFTER the dedupe pass so a stray duplicate
    # elsewhere in the prompt doesn't suppress the prepend.
    if series_lora_trigger:
        positive = f"{series_lora_trigger}, {positive}"

    negative_parts: list[str] = [*HEAVY_UC_BASE]
    if is_explicit:
        negative_parts.extend(CENSORSHIP_SUPPRESSION_UC)
    negative_parts.append(IDENTITY_ANCHOR_NEG)
    negative = ", ".join(_dedupe_keep_order(negative_parts))

    return {
        "prompt": positive,
        "negative_prompt": negative,
        "width": width,
        "height": height,
        "steps": steps,
        "cfg": cfg,
        "sampler": sampler,
        "scheduler": scheduler,
        "seed": seed,
        "workflow": "illustrious_image",
        "lora_strengths": {
            "slider": tier_to_slider_weight(tier_index),
            "hyper_concept": tier_to_hyper_concept_weight(tier_index),
            "smooth_booster": SMOOTH_BOOSTER_DEFAULT_WEIGHT,
            "anime_style": 0.0,
            "style": 0.0,
        },
        "hires_fix": {},
        # The bridge's scene_payload is a strictly-typed Pydantic model
        # (ScenePayload with Literal["sfw","nude","sex"] intimacy + typed
        # SceneCharacter list + required scene_type) used only for audit-trail
        # logging. Comic-continuer v1 doesn't have full SI-shaped scene data
        # yet, so omit it; the bridge accepts None. Prompt + lora_strengths
        # drive the actual generation.
        "scene_payload": None,
        "campaign_id": None,
        "linked_proposal_id": None,
        "linked_still_entry_id": None,
        "pre_convert_webp": False,
        # v2.1 — IPAdapter style-transfer fields. When reference_image_b64
        # is set, the bridge routes to illustrious_image_ipa.json and uses
        # the reference as a style anchor (preserves composition; only
        # transfers style cues like line weight, screentone, palette).
        "reference_image_b64": reference_image_b64,
        "reference_weight": reference_weight,
        # v2.2 — series style LoRA. When BOTH reference_image_b64 AND
        # series_lora_name are set, the bridge routes to
        # illustrious_image_styled_ipa.json and stacks the per-project
        # LoRA on top of the IPA conditioning. series_lora_trigger is
        # NOT sent to the bridge — it's already baked into "prompt"
        # above. series_lora_weight is also NOT sent — the bridge's
        # Pydantic default (0.8) is the single source of truth in v2.2
        # (see W5 spec §10 Q3, RESOLVED). When series_lora_name is None,
        # the bridge routes to the v2.1 IPA preset.
        "series_lora_name": series_lora_name,
    }
