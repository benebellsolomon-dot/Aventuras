"""Pydantic models — the bridge's API contract.

Phase 1 implementation. See:
- Scene_Animator_Design_Doc_v0.3.md §4.3 (AnimateRequest)
- Scene_Animator_Design_Doc_v0.3.md §4.4 (response shapes)
- Scene_Animator_Design_Doc_v0.3.md §11 (ConvertRequest)

This module defines the wire format. Any change here is a breaking change
that requires SI's engine/comfy-bridge.js to be updated in lockstep.

Status: SCAFFOLDING.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# -----------------------------------------------------------------------------
# Scene types — match SI's SCENE_TYPES exactly
# -----------------------------------------------------------------------------

SceneType = Literal["solo", "intimate_be", "group", "comparison", "transformation"]
Tier = Literal["preview", "hero"]
Resolution = Literal["480p", "720p", "1080p"]
ConvertFormat = Literal["mp4", "webp", "gif"]
JobStatusName = Literal["queued", "running", "converting", "complete", "failed", "canceled"]

# Path B (Illustrious local image-gen) — see PATH_B_ILLUSTRIOUS_BACKEND_SPEC §3.1.
# v2.4 colorize: `illustrious_colorize` routes to a ControlNet-driven workflow
# that takes a B&W input page and outputs a colorized PNG. Comic-continuer's
# whole-page colorize feature submits one /image job per page through this
# workflow; the bridge routes via `_resolve_image_workflow_filename`.
ImageWorkflow = Literal["illustrious_image", "illustrious_colorize"]
ImageFormat = Literal["png", "webp"]


# -----------------------------------------------------------------------------
# Sub-schemas for the request payload
# -----------------------------------------------------------------------------

class StyleHints(BaseModel):
    """Per-job style overrides. Defaults come from config.yaml style_defaults.

    Wan hero uses a validated 3-LoRA hybrid stack (2026-05-15 bake-offs):
      slider_strength       — Wan2.2 Breast/Chest Slider v2, size baseline
                              (signed, calibrated from body.js delta_proj_cm)
      bev5_augment_strength — Civitai BE V5, magnitude driver layered on
                              top of Slider (scales with tier_delta band)
      motion_quality_strength — Breast Play H+L, natural-physics motion
                              (fixed ~0.5 unless overridden)

    All three default to None → bridge falls back to per-scene_type defaults
    in StyleDefault. Strength 0 = LoRA passthrough (effectively inactive).

    populate_by_name=True lets SI send either `slider_strength` (preferred)
    or `be_lora_strength` (legacy alias) — they map to the same field.
    """

    model_config = ConfigDict(populate_by_name=True)

    anime_lora_strength: float | None = Field(default=None, ge=0.0, le=2.0)
    slider_strength: float | None = Field(
        default=None, ge=-2.5, le=2.5, alias="be_lora_strength",
    )
    bev5_augment_strength: float | None = Field(default=None, ge=0.0, le=1.5)
    motion_quality_strength: float | None = Field(default=None, ge=0.0, le=1.5)
    # Civitai #1626704 — Boob Physics Wan2.2 (separate hi + lo noise files).
    # Layered on top of the Breast Play / Breast Rub motion LoRAs gated by
    # motion_quality_strength, but with an independent hi/lo split so the
    # Vellum-side tier-conditional curve (BE_SYNTHESIS_SI_ROADMAP §P0-5) can
    # ramp each noise band on its own curve. None → 0.0 (LoraLoaderModelOnly
    # passthrough). Vellum drives both per-tier; not exposed in style_defaults
    # because per-scene defaults aren't meaningful for this LoRA — the tier
    # curve is the source of truth.
    boob_physics_high_strength: float | None = Field(default=None, ge=0.0, le=1.5)
    boob_physics_low_strength: float | None = Field(default=None, ge=0.0, le=1.5)
    motion_intensity: float | None = Field(default=None, ge=0.0, le=1.0)
    use_lightx2v: bool | None = None  # Phase 3+; LightX2V speedup LoRA


class TransformationContext(BaseModel):
    """Present when scene_type == 'transformation'. Drives BE LoRA strength.

    Mirrors SI.sceneComposer.composePayload's `payload.transformation` shape.
    """

    model_config = ConfigDict(extra="allow")

    from_tier: int = Field(ge=0)
    to_tier: int = Field(ge=0)
    from_letter: str | None = None
    to_letter: str | None = None
    direction: Literal["growth", "reduction"] = "growth"
    transformation_tags: list[str] = []


class SceneLocation(BaseModel):
    """Location entity from F&F (points_of_interest), threaded through scene-composer."""

    model_config = ConfigDict(extra="allow")

    id: int | str | None = None
    name: str | None = None
    description: str | None = None
    type: str | None = None
    image_url: str | None = None


class SceneCharacter(BaseModel):
    """One character in the scene payload.

    Mirrors SI.sceneComposer's per-character entry. extra='allow' so future
    SI fields (e.g. v0.5.18+ additions) flow through without bridge changes.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    pronouns: str | None = None
    tier_index: int | None = None
    tier_letter: str | None = None
    pre_tier_index: int | None = None
    build: str | None = None
    breast_shape: str | None = None
    height_cm: float | None = None
    bust_cm: float | None = None
    tracked: bool = False
    body_tags: list[str] = []
    body_state_provenance: dict[str, Any] = {}
    reference_image: str | None = None
    appearance_excerpt: str | None = None
    style_notes: str = ""


class ScenePayload(BaseModel):
    """The full SI-composed scene payload, passed through to the bridge for
    audit-trail logging and motion-prompt augmentation.

    Mirrors SI.sceneComposer.composePayload output. extra='allow' future-proofs
    against SI shape evolution — new payload fields don't break the bridge.
    """

    model_config = ConfigDict(extra="allow")

    scene_type: SceneType
    scene_label: str | None = None
    scene_tags: list[str] = []
    characters: list[SceneCharacter]
    intimacy: Literal["sfw", "nude", "sex"] = "sfw"
    location: SceneLocation | None = None
    transformation: TransformationContext | None = None
    composed_at: datetime | None = None


# -----------------------------------------------------------------------------
# Requests
# -----------------------------------------------------------------------------

class AnimateRequest(BaseModel):
    """POST /animate request body. See Design Doc §4.3.

    TODO Phase 1: implement with full validation.
    """
    tier: Tier
    scene_type: SceneType
    first_frame_b64: str = Field(..., min_length=100)
    # When present, bridge routes transformation/hero requests through the
    # Wan 2.2 FLF2V (First-Last Frame to Video) workflow instead of I2V.
    # FLF2V interpolates between two endpoint frames via cross-attention,
    # eliminating the LoRA-strength magnitude tuning problem entirely for
    # transformation scenes. See docs/IMPROVEMENT_BRAINSTORM.md in the
    # scene-animator repo for the architectural background.
    last_frame_b64: str | None = Field(default=None, min_length=100)
    motion_prompt: str = Field(..., min_length=10, max_length=2000)
    negative_prompt: str = Field(default="", max_length=2000)
    duration_seconds: int = Field(default=4, ge=2, le=10)
    resolution: Resolution = "720p"
    scene_payload: ScenePayload
    tier_delta: int = 0
    style_hints: StyleHints = StyleHints()
    campaign_id: str
    linked_proposal_id: str | None = None
    linked_still_entry_id: str | None = None
    seed: int | None = None
    pre_convert_webp: bool = True


class ConvertRequest(BaseModel):
    """POST /convert request body. See Design Doc §4.4.

    TODO Phase 1: implement.
    """
    mp4_b64: str = Field(..., min_length=1000)
    target_format: Literal["webp", "gif"] = "webp"
    target_width: int = Field(default=720, ge=240, le=1920)
    target_fps: int = Field(default=15, ge=8, le=30)
    quality: int = Field(default=80, ge=30, le=100)


# -----------------------------------------------------------------------------
# Responses
# -----------------------------------------------------------------------------

class AnimateResponse(BaseModel):
    """POST /animate immediate response.

    TODO Phase 1: implement per design doc §4.4.
    """
    job_id: str
    comfy_prompt_id: str
    estimated_seconds: int
    queue_position: int


class JobStatusResponse(BaseModel):
    """GET /animate/{id} status response.

    TODO Phase 1: implement per design doc §4.4.
    """
    job_id: str
    status: JobStatusName
    progress_pct: int = 0
    current_step: int | None = None
    total_steps: int | None = None
    started_at: datetime | None = None
    estimated_remaining_seconds: int | None = None
    available_formats: list[ConvertFormat] = []
    format_sizes_bytes: dict[ConvertFormat, int] = {}
    result_url_mp4: str | None = None
    result_url_webp: str | None = None
    error: str | None = None
    metadata: dict = {}


class GpuInfo(BaseModel):
    """TODO Phase 1: populated by nvidia-smi parsing."""
    name: str
    vram_used_gb: float
    vram_total_gb: float
    temperature_c: int
    busy_with_other_workload: bool


class HealthResponse(BaseModel):
    """GET /health response.

    TODO Phase 1: implement per design doc §4.4.
    """
    ok: bool
    comfyui: Literal["connected", "unreachable"]
    ffmpeg: Literal["ok", "missing"]
    ffmpeg_version: str | None = None
    gpu: GpuInfo | None = None
    queue_depth: int = 0
    current_job: str | None = None
    models_available: list[str] = []


# -----------------------------------------------------------------------------
# Path B — Local Illustrious XL image-gen
# -----------------------------------------------------------------------------
#
# /image is a parallel endpoint family to /animate. It runs Illustrious XL +
# a tier-driven Breast Size Slider LoRA chain on the same ComfyUI instance.
# Shape mirrors /animate (POST + 202 + job_id; background watcher; GET status
# + GET result). The job_store table is shared — image jobs are tagged by
# their `img_` job_id prefix so the watcher can route them differently.
#
# See PATH_B_ILLUSTRIOUS_BACKEND_SPEC §3 for the full design rationale.


class IllustriousLoraStrengths(BaseModel):
    """Per-job LoRA-chain strengths for the Illustrious workflow.

    All fields optional — None means "use the bridge's image_style_defaults
    fallback for this workflow". Strength 0 keeps the LoraLoaderModelOnly
    node in the chain but contributes nothing (passthrough).
    """

    model_config = ConfigDict(populate_by_name=True)

    # Breast Size Slider (Illustrious V2). Signed: negative = smaller,
    # positive = larger. v2.1 calibration lowered the typical range because
    # cup tags now provide the band baseline; slider is the fine-tune.
    slider: float | None = Field(default=None, ge=-3.5, le=3.5)
    # Hyper Breasts ILXL concept LoRA. Off by default; SI's prompt builder
    # ramps it from 0.0 to ~0.5 across tier 40-50.
    hyper_concept: float | None = Field(default=None, ge=0.0, le=1.5)
    # v2.1: Smooth Detailer Booster v5 — color/lighting/shadow depth LoRA.
    # Community recommends 0.25-0.8; SI defaults to 0.5 (lower because the
    # chain already stacks two body-focused LoRAs).
    smooth_booster: float | None = Field(default=None, ge=0.0, le=1.5)
    # Reserved for future LoRA slots (anime aesthetic, F&F-trained style).
    # Currently not referenced by the workflow JSON but accepted on the
    # wire for forward compatibility.
    anime_style: float | None = Field(default=None, ge=0.0, le=1.5)
    style: float | None = Field(default=None, ge=0.0, le=1.5)


class HiresFixSettings(BaseModel):
    """Two-pass hires-fix knobs (v2.1 calibration). Defaults match the
    community-canonical Illustrious latent-upscale recipe (1.5x scale via
    nearest-exact upscale + 18-step refine at denoise 0.4).
    """

    model_config = ConfigDict(populate_by_name=True)

    # Refine pass step count. 15-20 community range; 18 default.
    steps: int = Field(default=18, ge=6, le=40)
    # Denoise strength for the refine pass. 0.35-0.50 sweet spot per
    # research §4. Too low = no aesthetic gain; too high = composition drift.
    denoise: float = Field(default=0.4, ge=0.1, le=0.8)
    # Seed for the refine pass. None → uses the same seed as the first pass
    # (deterministic; same composition refined). Set explicitly for variety
    # exploration.
    seed: int | None = None


class ImageGenRequest(BaseModel):
    """POST /image request body.

    Pure image generation — no first/last frame upload (no ComfyUI image
    upload step). The scene_payload field is forwarded unmodified for
    audit-trail logging + future per-character routing.
    """

    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(..., min_length=10, max_length=4000)
    negative_prompt: str = Field(default="", max_length=4000)
    width: int = Field(default=832, ge=512, le=2048)
    height: int = Field(default=1216, ge=512, le=2048)
    steps: int = Field(default=28, ge=10, le=60)
    # ComfyUI sampler/scheduler names + CFG. Defaults updated 2026-05-17 per
    # PATH_B_PROMPT_CALIBRATION_RESEARCH.md §2.5 — euler_ancestral + normal +
    # CFG 5.0 is the lowest-risk Illustrious v2.0 intersection across the four
    # community recipes (SeaArt, Civitai Tips, Lima checkpoint, EasyIllustrious).
    # Mandatory companion: Clip Skip 2, enforced in illustrious_image.json by
    # the CLIPSetLastLayer node.
    cfg: float = Field(default=5.0, ge=1.0, le=12.0)
    # 2026-06-21 quality bake-off: dpmpp_2m/karras renders crisper than euler_ancestral/normal
    # (the SI/comic-continuer prompt builders set these explicitly; this is the raw-/image default).
    sampler: str = Field(default="dpmpp_2m", min_length=1, max_length=64)
    scheduler: str = Field(default="karras", min_length=1, max_length=64)
    seed: int | None = None
    workflow: ImageWorkflow = "illustrious_image"
    lora_strengths: IllustriousLoraStrengths = Field(
        default_factory=IllustriousLoraStrengths
    )
    # v2.1 hires-fix knobs. Defaults are community-canonical for Illustrious
    # latent-upscale; SI's prompt builder doesn't typically override.
    hires_fix: HiresFixSettings = Field(default_factory=HiresFixSettings)
    scene_payload: ScenePayload | None = None
    campaign_id: str | None = None
    linked_proposal_id: str | None = None
    linked_still_entry_id: str | None = None
    # If True, bridge converts the saved PNG to WebP after generation so the
    # client can fetch either format without a follow-up call.
    pre_convert_webp: bool = False
    # v2.1 — optional reference image for IPAdapter style-transfer conditioning.
    # When set, the bridge routes to `illustrious_image_ipa.json` (preset with
    # IPAdapter chain) instead of `illustrious_image.json`. The reference is
    # the source page the user is continuing from — every generated panel cues
    # style (line weight, screentone, palette) from it. See comic-continuer
    # v2.1 plan §"Overlap-panel anchoring".
    reference_image_b64: str | None = Field(default=None, max_length=12_000_000)
    reference_weight: float = Field(default=0.7, ge=0.0, le=1.5)
    # v2.2 — optional series style LoRA chained between the existing
    # 3-LoRA stack and the IPAdapterAdvanced node. Only consumed when
    # `reference_image_b64` is also set; bridge returns 400 otherwise
    # (series-LoRA-without-IPA is intentionally out of scope for v2.2).
    # Comic-continuer sends e.g. "comic-continuer/p_cup_style.safetensors";
    # the trigger token (e.g. "p_cup_style") is prepended to `prompt`
    # client-side, not by the bridge.
    series_lora_name: str | None = Field(
        default=None,
        max_length=200,
        pattern=r"^[a-zA-Z0-9_\-./]+$",
    )
    # Default 1.0 (bumped from 0.8 on 2026-05-24) per p-cup A/B sweep —
    # 0.8 produced output nearly indistinguishable from no-LoRA baseline.
    # 1.0 puts LoRA visibly in the driver's seat without breaking
    # composition (1.2 hits a comp cliff). See sweep_2026_05_24/FINDINGS.md
    # in the comic-continuer repo.
    series_lora_weight: float = Field(default=1.0, ge=0.0, le=1.5)
    # v2.4 colorize — only consumed when workflow == "illustrious_colorize".
    # The B&W input page that the ControlNet conditions on. Encoded as PNG/JPEG
    # bytes -> base64. Bridge decodes, stages under input_dir, uploads via
    # ComfyClient.upload_image (same pattern as reference_image_b64).
    input_image_b64: str | None = Field(default=None, max_length=12_000_000)
    # ControlNet conditioning strength. 0.0 = ControlNet off (output is pure
    # text-to-image with no source-page rails); 1.0 = full conditioning (output
    # composition tracks source page exactly). 0.7-0.9 is the SubMaroon
    # ControlNet-manga-recolor sweet spot — preserves panel boundaries and
    # speech-bubble shapes while leaving the SDXL model room to choose a
    # plausible palette.
    controlnet_strength: float = Field(default=0.85, ge=0.0, le=2.0)
    # ControlNet model filename in ComfyUI/models/controlnet/. Defaults to
    # the SubMaroon/ControlNet-manga-recolor filename; deployments that drop
    # a renamed or alternate ControlNet in that dir can override via this
    # field. The same path-separator normalization as series_lora_name applies
    # (forward slashes flipped to os.sep before substitution).
    controlnet_model_name: str = Field(
        default="manga-recolor.safetensors",
        max_length=200,
        pattern=r"^[a-zA-Z0-9_\-./]+$",
    )
    # v2.4.1 — img2img variant of the styled-IPA path. When set alongside
    # `reference_image_b64` + `series_lora_name`, the bridge routes to
    # `illustrious_image_styled_ipa_img2img.json`: the init image becomes the
    # latent starting point (composition preserved exactly), and `init_denoise`
    # controls how far the sampler deviates. Comic-continuer's editor regen
    # uses this so a regen stays close to the panel being edited rather than
    # producing a fresh interpretation each time.
    init_image_b64: str | None = Field(default=None, max_length=12_000_000)
    # 0.0 = pure identity (no change); 1.0 = full text2img (ignore init).
    # Sweet spot for editor regens with prompt+tier steering: 0.45-0.65.
    init_denoise: float = Field(default=0.55, ge=0.1, le=1.0)
    # v2.5 BODY-HOLD (OpenPose + FaceID). When set, the bridge routes to
    # `illustrious_image_openpose_faceid.json`: the anchor frame (a base/first
    # render of the character) is the pose source (DWPose -> OpenPose CN locks
    # stance/build framing) AND the FaceID identity reference (insightface
    # embeddings lock the face). Each tier is then a FULL-denoise txt2img, so
    # breasts grow at full ladder magnitude (flat->hyper) while body + pose +
    # identity stay fixed. This is the validated body-hold method for breast-
    # expansion scenes (see quality-upgrade/OPENPOSE-BODY-HOLD-REPORT.md); it
    # replaces chained-img2img (which muted growth) and avoids the plus-face
    # nude skin-tone washout (FaceID uses face embeddings, not global CLIP stats).
    pose_face_anchor_b64: str | None = Field(default=None, max_length=12_000_000)
    # OpenPose ControlNet apply strength (1.0 = pose fully locked; ~0.7 looser).
    openpose_strength: float = Field(default=1.0, ge=0.0, le=2.0)
    # FaceID identity weights. weight = overall IPAdapter weight; weight_v2 =
    # the FaceID-PlusV2 face-structure term; lora_strength = the FaceID LoRA.
    faceid_weight: float = Field(default=0.8, ge=0.0, le=2.0)
    faceid_weight_v2: float = Field(default=1.0, ge=0.0, le=2.0)
    faceid_lora_strength: float = Field(default=0.6, ge=0.0, le=1.5)


class ImageGenResponse(BaseModel):
    """POST /image immediate response."""

    job_id: str
    comfy_prompt_id: str
    estimated_seconds: int
    queue_position: int


class ImageStatusResponse(BaseModel):
    """GET /image/{id} status response — mirrors JobStatusResponse but with
    image format fields instead of video.
    """

    job_id: str
    status: JobStatusName
    progress_pct: int = 0
    started_at: datetime | None = None
    estimated_remaining_seconds: int | None = None
    available_formats: list[ImageFormat] = []
    format_sizes_bytes: dict[ImageFormat, int] = {}
    result_url_png: str | None = None
    result_url_webp: str | None = None
    error: str | None = None
    metadata: dict = {}


# -----------------------------------------------------------------------------
# /comfyui/free — VRAM eviction passthrough
# -----------------------------------------------------------------------------

class FreeResponse(BaseModel):
    """POST /comfyui/free response. ComfyUI returns 200 with empty body and
    processes the unload asynchronously on its prompt-queue worker, so the
    bridge waits briefly post-call and reports VRAM state observed after.
    """

    ok: bool
    vram_used_mb_before: int | None = None
    vram_used_mb_after: int | None = None
