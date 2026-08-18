"""FastAPI app — endpoints, lifespan, background job watcher.

See:
- Scene_Animator_Design_Doc_v0.3.md §4.2 for the endpoint list
- Scene_Animator_Design_Doc_v0.3.md §4.6 for the job lifecycle state machine
- CLAUDE.md for async patterns and FastAPI conventions
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import shutil
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse, Response

from src.auth import set_api_key, verify_api_key
from src.comfy_client import (
    ComfyClient,
    ComfyUnreachableError,
    ComfyWorkflowError,
)
from src.config import BridgeConfig, load_config
from src.converter import (
    ConversionParams,
    FFmpegFailedError,
    FFmpegNotFoundError,
    mp4_first_frame_to_jpeg_async,
    mp4_to_webp_async,
    png_to_webp_async,
    verify_ffmpeg,
)
from src.gpu import query_gpu_info
from src.job_store import JobStore
from src.models import (
    AnimateRequest,
    AnimateResponse,
    ConvertRequest,
    FreeResponse,
    HealthResponse,
    ImageGenRequest,
    ImageGenResponse,
)
from src.workflow_loader import (
    WorkflowTemplateError,
    load_and_substitute,
)

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# App state — populated in lifespan, read by route handlers
# -----------------------------------------------------------------------------

class AppState:
    config: BridgeConfig
    job_store: JobStore
    comfy: ComfyClient
    ffmpeg_version: str | None
    presets_dir: Path
    watcher_task: asyncio.Task[None] | None = None


state = AppState()


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(tz=UTC).isoformat()


def generate_job_id() -> str:
    """Stable, sortable, human-readable id per CLAUDE.md."""
    now = datetime.now(tz=UTC)
    short = uuid4().hex[:8]
    return f"anim_{now:%Y_%m_%d}_{short}"


def _resolve_workflow_filename(
    scene_type: str, tier: str, has_last_frame: bool = False
) -> str:
    """Pick the preset filename for a given scene_type + tier combo.

    When `has_last_frame` is True AND we're on a Wan hero transformation
    scene, route to the FLF2V (First-Last Frame to Video) workflow variant
    instead of the I2V default. FLF2V is the recommended path for
    transformation scenes once SI is generating two endpoint NAI stills
    (the v0.4 SI refactor); for backward compat, omitting last_frame_b64
    falls through to the existing I2V workflow.
    """
    if has_last_frame and scene_type == "transformation" and tier == "hero":
        # Explicit config override wins; else fall back to the canonical name.
        # This avoids requiring older configs to have the FLF2V workflow
        # registered — deployments self-heal once the preset file exists.
        return state.config.workflows.get(
            "transformation:hero_flf2v", "transformation.wan_flf2v.json"
        )
    key = f"{scene_type}:{tier}"
    fname = state.config.workflows.get(key)
    if not fname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"no workflow registered for {key}",
        )
    return fname


def _build_token_dict(
    req: AnimateRequest,
    input_filename: str,
    job_id: str,
    end_frame_filename: str | None = None,
) -> dict[str, Any]:
    """Map an AnimateRequest into the {{TOKEN}} dict the workflow_loader expects."""
    style_default = state.config.style_defaults.get(
        req.scene_type, state.config.style_defaults["transformation"]
    )
    anime_strength = (
        req.style_hints.anime_lora_strength
        if req.style_hints.anime_lora_strength is not None
        else style_default.anime_lora_strength
    )
    slider_strength = (
        req.style_hints.slider_strength
        if req.style_hints.slider_strength is not None
        else style_default.slider_strength
    )
    bev5_augment_strength = (
        req.style_hints.bev5_augment_strength
        if req.style_hints.bev5_augment_strength is not None
        else style_default.bev5_augment_strength
    )
    motion_quality_strength = (
        req.style_hints.motion_quality_strength
        if req.style_hints.motion_quality_strength is not None
        else style_default.motion_quality_strength
    )
    # Civitai #1626704 (Boob Physics Wan2.2) — no config.yaml fallback; the
    # Vellum-side tier curve is the source of truth, so absent style_hints
    # means "passthrough" (LoraLoaderModelOnly at strength 0).
    boob_physics_high_strength = (
        req.style_hints.boob_physics_high_strength
        if req.style_hints.boob_physics_high_strength is not None
        else 0.0
    )
    boob_physics_low_strength = (
        req.style_hints.boob_physics_low_strength
        if req.style_hints.boob_physics_low_strength is not None
        else 0.0
    )
    # Tier-delta upper-bound rail for transformation per design doc §8.1,
    # rebased for the Slider's [0, +2] effective range (was BE V5's [0, 1]).
    # SI's calibration table (informed by body.js projection_cm) is the primary
    # signal; this cap is a safety rail in case style_hints is omitted.
    if req.scene_type == "transformation" and req.tier_delta:
        slider_strength = _cap_slider_for_tier_delta(req.tier_delta, slider_strength)
        # Activate magnitude augment on large deltas if SI hasn't already.
        # Per Hestia tier 26->31 bake-off (delta=5): 0.5-0.7 is the sweet spot
        # without warping. Bands rebased to BE V5 hybrid:
        #   |delta| <= 3:  0.0 (slider-only handles small deltas)
        #   |delta| <= 7:  cap at 0.7 (moderate band — validated)
        #   |delta| <= 15: cap at 1.0 (major band — extrapolated)
        #   |delta| >  15: cap at 1.0 (catastrophic — visible delta saturates;
        #                  scene-splitting strategy is the real fix)
        if req.style_hints.bev5_augment_strength is None:
            abs_d = abs(req.tier_delta)
            if abs_d <= 3:
                bev5_augment_strength = 0.0
            elif abs_d <= 7:
                bev5_augment_strength = 0.7
            else:
                bev5_augment_strength = 1.0

    width, height = _resolution_to_wh(req.resolution)
    fps = state.config.webp_defaults.target_fps  # WebP fps; gen runs at native MP4 fps
    duration_frames = req.duration_seconds * 16  # Wan native = 16 fps

    seed = req.seed if req.seed is not None else int.from_bytes(uuid4().bytes[:8], "big") >> 1
    # LightX2V Lightning runs in 4 steps split 2/2. The transformation.wan
    # template uses these tokens for both KSamplerAdvanced passes.
    steps = 4
    tokens: dict[str, Any] = {
        "INPUT_IMAGE_FILENAME": input_filename,
        "MOTION_PROMPT": req.motion_prompt,
        "NEGATIVE_PROMPT": req.negative_prompt or _default_negative(),
        "SEED": seed,
        "JOB_ID": job_id,
        "DURATION_FRAMES": duration_frames,
        "DURATION_SECONDS": req.duration_seconds,
        "WIDTH": width,
        "HEIGHT": height,
        "FPS": fps,
        "STEPS": steps,
        "STEPS_HIGH_END": steps // 2,
        "STEPS_LOW_START": steps // 2,
        "CFG": 1.0,  # LightX2V is CFG-distilled
        "SAMPLER": "euler",
        "SCHEDULER": "simple",
        "ANIME_LORA_STRENGTH": anime_strength,
        # The workflow token name remains BE_LORA_STRENGTH for preset stability;
        # the value plumbed through is the Slider strength post-2026-05-15.
        "BE_LORA_STRENGTH": slider_strength,
        # 2026-05-16: hybrid stack adds 2 more LoRA strengths. Strength 0 makes
        # the corresponding LoraLoaderModelOnly a passthrough — small-delta
        # scenes get a clean Slider-only chain at runtime.
        "BEV5_AUGMENT_STRENGTH": bev5_augment_strength,
        "MOTION_QUALITY_STRENGTH": motion_quality_strength,
        "BOOB_PHYSICS_HIGH_STRENGTH": boob_physics_high_strength,
        "BOOB_PHYSICS_LOW_STRENGTH": boob_physics_low_strength,
        "LTX_LORA_STRENGTH": 0.5,  # distill — reduced from 0.8 to give BE LoRA more room
        "LTX_BE_LORA_STRENGTH": style_default.ltx_be_lora_strength,
    }
    # FLF2V variant requires the end-frame ComfyUI input filename. Only
    # added when supplied — I2V workflows don't reference this token, so
    # passing it is harmless if unused.
    if end_frame_filename is not None:
        tokens["END_FRAME_FILENAME"] = end_frame_filename
    return tokens


def _cap_slider_for_tier_delta(tier_delta: int, base: float) -> float:
    """Cap Slider strength upper bound by tier_delta magnitude.

    Rebased from BE V5's [0, 1] range to Slider's [0, +2] range. SI's
    calibration table (delta_proj_cm -> slider_strength) is the primary
    signal — this cap is a safety rail when style_hints.slider_strength
    is omitted, ensuring small deltas don't over-grow if the SI side
    sends a permissive default.
    """
    abs_d = abs(tier_delta)
    if abs_d <= 2:
        return min(base, 0.7)
    if abs_d <= 5:
        return min(base, 1.2)
    if abs_d <= 10:
        return min(base, 1.7)
    return min(base, 2.0)


def _resolution_to_wh(resolution: str) -> tuple[int, int]:
    # The Wan workflow we're running today is portrait-tuned (832x1216 native).
    # We honor the requested resolution but maintain the portrait aspect.
    return {
        "480p": (480, 720),
        "720p": (832, 1216),
        "1080p": (1080, 1920),
    }[resolution]


def _default_negative() -> str:
    return "static, frozen, deformed hands, ((realistic)), low quality"


# -----------------------------------------------------------------------------
# Lifespan
# -----------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:  # noqa: ARG001 — FastAPI signature
    cfg = load_config()
    state.config = cfg
    set_api_key(cfg.api_key)

    # Ensure data directories exist (we log into log_dir below, so mkdir first).
    for p in (cfg.paths.input_dir, cfg.paths.output_dir, cfg.paths.log_dir):
        p.mkdir(parents=True, exist_ok=True)

    # Dump the active api_key to a sibling file at a fresh path. Lives next
    # to config.yaml so it shares the same trust boundary, but exists in a
    # location WITHOUT a Claude AppContainer sandbox mirror — so tools run
    # from inside Claude can read the real value without redirection
    # returning a stale sandbox copy. See memory note
    # `appcontainer_file_redirection.md` for the gotcha.
    try:
        keyfile = cfg.paths.input_dir.parent / "current_api_key.txt"
        keyfile.write_text(cfg.api_key, encoding="utf-8")
    except OSError as exc:
        logger.warning("could not write current_api_key.txt: %s", exc)

    # Root logger: stderr + rotating file (so Task Scheduler / NSSM runs that
    # don't capture stdout still produce a debuggable log on disk).
    from logging.handlers import RotatingFileHandler

    log_path = cfg.paths.log_dir / "bridge.log"
    handlers: list[logging.Handler] = [
        logging.StreamHandler(),
        RotatingFileHandler(log_path, maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8"),
    ]
    logging.basicConfig(
        level=cfg.logging.level,
        format=cfg.logging.format,
        handlers=handlers,
        force=True,
    )
    logger.info("starting si-animator-bridge (log: %s)", log_path)

    # Locate presets bundled with the package.
    state.presets_dir = Path(__file__).parent / "presets"

    # Open the job store.
    state.job_store = JobStore(cfg.paths.db_path)
    await state.job_store.initialize()

    # Open the ComfyUI client.
    state.comfy = ComfyClient(cfg.comfyui.url)

    # Verify ffmpeg.
    try:
        state.ffmpeg_version = verify_ffmpeg()
        logger.info("ffmpeg ok: %s", state.ffmpeg_version)
    except FFmpegNotFoundError as exc:
        state.ffmpeg_version = None
        logger.warning("ffmpeg not available: %s — /convert and pre_convert_webp will fail", exc)

    # Start the watcher task.
    state.watcher_task = asyncio.create_task(job_watcher_loop())

    try:
        yield
    finally:
        logger.info("shutting down si-animator-bridge")
        if state.watcher_task is not None:
            state.watcher_task.cancel()
            with suppress(asyncio.CancelledError):
                await state.watcher_task
        await state.comfy.close()
        await state.job_store.close()


app = FastAPI(
    title="si-animator-bridge",
    version="0.1.0",
    lifespan=lifespan,
)


# -----------------------------------------------------------------------------
# Exception handlers
# -----------------------------------------------------------------------------

@app.exception_handler(ComfyUnreachableError)
async def _handle_comfy_unreachable(_req, exc):  # noqa: ANN001
    return JSONResponse(status_code=503, content={"error": str(exc)})


@app.exception_handler(ComfyWorkflowError)
async def _handle_comfy_workflow(_req, exc):  # noqa: ANN001
    return JSONResponse(status_code=502, content={"error": str(exc)})


@app.exception_handler(WorkflowTemplateError)
async def _handle_template(_req, exc):  # noqa: ANN001
    return JSONResponse(status_code=500, content={"error": str(exc)})


@app.exception_handler(FFmpegFailedError)
async def _handle_ffmpeg(_req, exc):  # noqa: ANN001
    return JSONResponse(status_code=500, content={"error": str(exc)})


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness + GPU/queue status. Public (no API key required)."""
    comfy_ok = "connected"
    queue_depth = 0
    current_job: str | None = None
    try:
        queue = await state.comfy.get_queue_info()
        running = queue.get("queue_running") or []
        pending = queue.get("queue_pending") or []
        queue_depth = len(running) + len(pending)
        if running:
            # ComfyUI queue entries are [number, prompt_id, prompt, ...] tuples.
            first = running[0]
            if isinstance(first, list) and len(first) >= 2:
                current_job = str(first[1])
    except ComfyUnreachableError:
        comfy_ok = "unreachable"

    gpu = query_gpu_info()
    return HealthResponse(
        ok=comfy_ok == "connected" and state.ffmpeg_version is not None,
        comfyui=comfy_ok,
        ffmpeg="ok" if state.ffmpeg_version else "missing",
        ffmpeg_version=state.ffmpeg_version,
        gpu=gpu,
        queue_depth=queue_depth,
        current_job=current_job,
        models_available=[],
    )


@app.get("/models", dependencies=[Depends(verify_api_key)])
async def list_models() -> dict[str, Any]:
    """Enumerate installed model files + supported scene types."""
    return {
        "scene_types": list({k.split(":")[0] for k in state.config.workflows}),
        "tiers": list({k.split(":")[1] for k in state.config.workflows}),
        "workflows": state.config.workflows,
    }


@app.post(
    "/animate",
    status_code=202,
    response_model=AnimateResponse,
    dependencies=[Depends(verify_api_key)],
)
async def submit_animate(request: AnimateRequest) -> AnimateResponse:
    """Submit an I2V job. Returns 202 with job_id + estimated time."""
    job_id = generate_job_id()

    # Stage the first-frame to ComfyUI's input dir.
    try:
        frame_bytes = base64.b64decode(request.first_frame_b64, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"first_frame_b64 not valid base64: {exc}",
        ) from exc
    if len(frame_bytes) > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="first_frame_b64 exceeds 8MB",
        )
    staging_path = state.config.paths.input_dir / f"{job_id}.png"
    staging_path.write_bytes(frame_bytes)
    input_filename = await state.comfy.upload_image(staging_path)

    # If SI supplied a last-frame for FLF2V, decode + stage + upload that too.
    # Validation matches the first-frame path: must be valid base64 ≤ 8MB.
    end_frame_filename: str | None = None
    if request.last_frame_b64 is not None:
        try:
            end_bytes = base64.b64decode(request.last_frame_b64, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"last_frame_b64 not valid base64: {exc}",
            ) from exc
        if len(end_bytes) > 8 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="last_frame_b64 exceeds 8MB",
            )
        end_staging_path = state.config.paths.input_dir / f"{job_id}_end.png"
        end_staging_path.write_bytes(end_bytes)
        end_frame_filename = await state.comfy.upload_image(end_staging_path)

    # Load + substitute the workflow.
    workflow_filename = _resolve_workflow_filename(
        request.scene_type, request.tier, has_last_frame=end_frame_filename is not None
    )
    tokens = _build_token_dict(request, input_filename, job_id, end_frame_filename)
    # Diagnostic: log the resolved LoRA strengths + magnitude context. Makes
    # it possible to see post-hoc whether SI sent explicit style_hints OR the
    # auto-magnitude rail fired, without re-running anything. The full token
    # dict can have long prompt strings; only log the LoRA-strength keys.
    logger.info(
        "job %s tokens: scene_type=%s tier_delta=%d workflow=%s flf2v=%s "
        "slider=%s bev5_aug=%s motion_q=%s bphys_hi=%s bphys_lo=%s "
        "anime=%s ltx_be=%s seed=%s",
        job_id, request.scene_type, request.tier_delta,
        workflow_filename, end_frame_filename is not None,
        tokens.get("BE_LORA_STRENGTH"), tokens.get("BEV5_AUGMENT_STRENGTH"),
        tokens.get("MOTION_QUALITY_STRENGTH"),
        tokens.get("BOOB_PHYSICS_HIGH_STRENGTH"), tokens.get("BOOB_PHYSICS_LOW_STRENGTH"),
        tokens.get("ANIME_LORA_STRENGTH"),
        tokens.get("LTX_BE_LORA_STRENGTH"), tokens.get("SEED"),
    )
    workflow = load_and_substitute(state.presets_dir, workflow_filename, tokens)

    # Submit to ComfyUI.
    prompt_id = await state.comfy.submit_prompt(workflow)
    queue = await state.comfy.get_queue_info()
    queue_position = len(queue.get("queue_pending") or [])

    # Persist job state.
    await state.job_store.create_job(
        job_id=job_id,
        comfy_prompt_id=prompt_id,
        request=request.model_dump(mode="json"),
        estimated_seconds=_estimate_seconds(request.tier),
        queue_position=queue_position,
    )

    return AnimateResponse(
        job_id=job_id,
        comfy_prompt_id=prompt_id,
        estimated_seconds=_estimate_seconds(request.tier),
        queue_position=queue_position,
    )


# Empirical typical-duration estimates per tier. These are the wall-clock
# times we've measured for the deployed presets at WIDTH=832 HEIGHT=1216
# DURATION_SECONDS=4 with no cold-load (model already in VRAM).
# - hero (Wan + LightX2V + LoRA chain): ~180s
# - preview (LTX + distill + BE V6, 6-step sigmas): ~170s
# Cold-load tax can add 60-180s on top depending on which model needs swapping in.
TYPICAL_GEN_SECONDS_BY_TIER = {"hero": 180, "preview": 170}


def _estimate_seconds(tier: str) -> int:
    """Initial ETA returned in /animate POST response."""
    return TYPICAL_GEN_SECONDS_BY_TIER.get(tier, 180)


def _compute_running_progress(job: dict[str, Any]) -> tuple[int, int | None]:
    """Estimate progress_pct + remaining_seconds for a job in 'running' state.

    ComfyUI 0.21.1 has no REST per-step progress endpoint (data only on /ws),
    so we interpolate linearly from started_at. Maps elapsed time to 10-80%
    of the bar; the watcher claims 80%+ once it sees a completed history entry.
    """
    started_at_raw = job.get("started_at")
    if not started_at_raw:
        return 10, None
    try:
        started_at = datetime.fromisoformat(str(started_at_raw))
    except ValueError:
        return 10, None
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    elapsed = (datetime.now(tz=UTC) - started_at).total_seconds()
    typical = TYPICAL_GEN_SECONDS_BY_TIER.get(
        (job.get("request") or {}).get("tier"), 180
    )
    pct = max(10, min(80, int(10 + (elapsed / typical) * 70)))
    remaining = max(0, int(typical - elapsed))
    return pct, remaining


@app.get("/animate/{job_id}", dependencies=[Depends(verify_api_key)])
async def get_job_status(job_id: str) -> dict[str, Any]:
    job = await state.job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    available_formats: list[str] = []
    format_sizes: dict[str, int] = {}
    for fmt, col in [("mp4", "mp4_path"), ("webp", "webp_path")]:
        path = job.get(col)
        if path and Path(path).exists():
            available_formats.append(fmt)
            format_sizes[fmt] = Path(path).stat().st_size

    # Refine progress + ETA on-the-fly while the job is actively running.
    # The watcher only updates progress_pct at lifecycle transitions
    # (running=10, converting=95, complete=100) — which is too coarse for SI's UX.
    progress_pct = job.get("progress_pct") or 0
    estimated_remaining_seconds: int | None = None
    if job["status"] == "running":
        progress_pct, estimated_remaining_seconds = _compute_running_progress(job)

    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress_pct": progress_pct,
        "current_step": job.get("current_step"),
        "total_steps": job.get("total_steps"),
        "started_at": job.get("started_at"),
        "estimated_remaining_seconds": estimated_remaining_seconds,
        "available_formats": available_formats,
        "format_sizes_bytes": format_sizes,
        "result_url_mp4": f"/animate/{job_id}/result?format=mp4" if "mp4" in available_formats else None,
        "result_url_webp": f"/animate/{job_id}/result?format=webp" if "webp" in available_formats else None,
        "error": job.get("error"),
        "metadata": job.get("metadata") or {},
    }


@app.get("/animate/{job_id}/thumbnail.jpg", dependencies=[Depends(verify_api_key)])
async def get_job_thumbnail(job_id: str) -> FileResponse:
    """Return the MP4 first-frame as a JPEG for completed animation jobs.

    Added in 3.16 to replace the source-still placeholder Vellum has been
    using as the animation gallery thumb. Cached on disk at
    `{OUTPUT_DIR}/{job_id}.thumb.jpg` so repeated requests don't re-extract.
    """
    job = await state.job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if job["status"] != "complete":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"job status is {job['status']}, not complete",
        )
    mp4_path_str = job.get("mp4_path")
    if not mp4_path_str:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="job has no mp4 output (image jobs use /image/{id}/result instead)",
        )
    mp4_path = Path(mp4_path_str)
    if not mp4_path.is_file():
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"mp4 path on row exists but file missing on disk: {mp4_path}",
        )
    if state.ffmpeg_version is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ffmpeg not available — cannot extract first frame",
        )
    thumb_path = state.config.paths.output_dir / f"{job_id}.thumb.jpg"
    if not thumb_path.exists():
        await mp4_first_frame_to_jpeg_async(mp4_path, thumb_path)
    return FileResponse(thumb_path, media_type="image/jpeg")


@app.get("/animate/{job_id}/result", dependencies=[Depends(verify_api_key)])
async def get_job_result(job_id: str, format: str = "mp4"):  # noqa: A002 — query param name is part of API contract
    if format not in ("mp4", "webp", "gif"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"unsupported format: {format}")
    job = await state.job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if job["status"] != "complete":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"job status is {job['status']}, not complete",
        )
    col = {"mp4": "mp4_path", "webp": "webp_path", "gif": "webp_path"}[format]
    path_str = job.get(col)
    if not path_str:
        # WebP on-demand: convert from MP4 if not pre-converted.
        if format == "webp" and job.get("mp4_path"):
            mp4 = Path(job["mp4_path"])
            webp = mp4.with_suffix(".webp")
            await mp4_to_webp_async(mp4, webp, _default_conversion_params())
            await state.job_store.set_paths(job_id, webp_path=webp)
            path_str = str(webp)
        else:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"format {format} not available")
    media_type = {"mp4": "video/mp4", "webp": "image/webp", "gif": "image/gif"}[format]
    return FileResponse(path_str, media_type=media_type)


@app.post("/convert", dependencies=[Depends(verify_api_key)])
async def convert_mp4(request: ConvertRequest) -> Response:
    if request.target_format != "webp":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="only webp output is implemented")
    try:
        mp4_bytes = base64.b64decode(request.mp4_b64, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"mp4_b64 not valid base64: {exc}",
        ) from exc
    tmp_id = uuid4().hex[:12]
    in_path = state.config.paths.input_dir / f"convert_{tmp_id}.mp4"
    out_path = state.config.paths.input_dir / f"convert_{tmp_id}.webp"
    in_path.write_bytes(mp4_bytes)
    try:
        params = ConversionParams(
            target_width=request.target_width,
            target_fps=request.target_fps,
            quality=request.quality,
        )
        await mp4_to_webp_async(in_path, out_path, params)
        webp_bytes = out_path.read_bytes()
    finally:
        in_path.unlink(missing_ok=True)
        out_path.unlink(missing_ok=True)
    return Response(content=webp_bytes, media_type="image/webp")


@app.delete("/animate/{job_id}", dependencies=[Depends(verify_api_key)])
async def cancel_job(job_id: str) -> dict[str, str]:
    job = await state.job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if job["status"] in ("complete", "failed", "canceled"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"job already {job['status']}",
        )
    if job["status"] == "running":
        await state.comfy.interrupt()
    await state.job_store.update_status(job_id, "canceled")
    return {"job_id": job_id, "status": "canceled"}


@app.get("/animate", dependencies=[Depends(verify_api_key)])
async def list_jobs(campaign_id: str | None = None, limit: int = 20) -> dict[str, Any]:
    if not 1 <= limit <= 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="limit must be 1-100")
    jobs = await state.job_store.list_jobs(campaign_id=campaign_id, limit=limit)
    return {"jobs": jobs}


def _default_conversion_params() -> ConversionParams:
    d = state.config.webp_defaults
    return ConversionParams(
        target_width=d.target_width,
        target_fps=d.target_fps,
        quality=d.quality,
        compression_level=d.compression_level,
    )


# -----------------------------------------------------------------------------
# Path B — /image endpoint family (Illustrious XL local image-gen)
# -----------------------------------------------------------------------------
#
# Mirrors /animate 1:1: POST (returns 202 + job_id), GET status, GET result,
# DELETE cancel. Shares the job_store table; image jobs are tagged by the
# `img_` prefix on job_id so the watcher can route them through the
# image-specific completion path (PNG output vs MP4, no ffmpeg by default).
#
# See PATH_B_ILLUSTRIOUS_BACKEND_SPEC §3 for the design.

# Empirical wall-clock on a 4090 at 832x1216 / 28 steps: ~7-12s warm, +5-15s
# cold-load when ComfyUI has to swap Wan out for Illustrious. Conservative
# middle: 15s. ETA returned to the SI client.
TYPICAL_IMAGE_GEN_SECONDS = 15


def generate_image_job_id() -> str:
    """Image-job id prefix is `img_`. Watcher branches on this prefix."""
    now = datetime.now(tz=UTC)
    short = uuid4().hex[:8]
    return f"img_{now:%Y_%m_%d}_{short}"


def _resolve_image_workflow_filename(workflow: str) -> str:
    """Pick the preset filename for a registered image workflow."""
    fname = state.config.image_workflows.get(workflow)
    if not fname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"no image workflow registered for {workflow}",
        )
    return fname


def _default_image_negative() -> str:
    """Illustrious-tuned default UC. SI's prompt builder normally overrides
    this with the tier-conditional UC stack; this is the fallback for raw
    /image calls without an SI client.
    """
    return (
        "lowres, worst quality, low quality, bad anatomy, bad hands, "
        "missing fingers, extra digit, fewer digits, signature, watermark, "
        "username, blurry, monochrome, sketch, lineart, flat color"
    )


def _build_image_token_dict(
    req: ImageGenRequest,
    job_id: str,
    reference_filename: str | None = None,
    input_image_filename: str | None = None,
    init_image_filename: str | None = None,
    anchor_image_filename: str | None = None,
) -> dict[str, Any]:
    """Map an ImageGenRequest into the {{TOKEN}} dict for the workflow loader.

    `reference_filename` is the basename of the staged reference image when
    IPAdapter routing is active; it populates the LoadImage node in the
    illustrious_image_ipa preset. When None (no-reference path), the IPA
    tokens are still present but unused — keeps the substitution dict
    uniform across both presets.

    v2.4 colorize: `input_image_filename` is the basename of the staged B&W
    input page when routing to the `illustrious_colorize` preset. Populates
    the LoadImage node + the ControlNet apply chain. Sibling tokens
    CONTROLNET_STRENGTH + CONTROLNET_MODEL_NAME come from the request.
    """
    style_default = state.config.image_style_defaults.get(
        req.workflow,
        # Fall back to the first registered image workflow if the named one
        # doesn't have an explicit defaults block. Keeps the API resilient
        # against config-yaml drift.
        next(iter(state.config.image_style_defaults.values()), None),
    )

    def _pick(req_val: float | None, default_attr: str) -> float:
        if req_val is not None:
            return req_val
        if style_default is None:
            return 0.0
        return float(getattr(style_default, default_attr, 0.0))

    seed = (
        req.seed
        if req.seed is not None
        else int.from_bytes(uuid4().bytes[:8], "big") >> 1
    )
    # v2.1: hires-fix seed defaults to the first-pass seed for deterministic
    # refines. Caller can override per HiresFixSettings.seed.
    seed_hires = req.hires_fix.seed if req.hires_fix.seed is not None else seed
    # v2.1 IPAdapter: when a reference image is staged, lower the hires-fix
    # denoise to preserve the reference's style cues through the refinement
    # pass. Caller can still override via hires_fix.denoise.
    hires_denoise_default = 0.3 if reference_filename else req.hires_fix.denoise
    hires_denoise = (
        req.hires_fix.denoise
        if "hires_fix" in req.model_fields_set
        and req.hires_fix.denoise != 0.4  # 0.4 is the Pydantic default
        else hires_denoise_default
    )
    return {
        "POSITIVE_PROMPT": req.prompt,
        "NEGATIVE_PROMPT": req.negative_prompt or _default_image_negative(),
        "WIDTH": req.width,
        "HEIGHT": req.height,
        "STEPS": req.steps,
        "CFG": req.cfg,
        "SAMPLER": req.sampler,
        "SCHEDULER": req.scheduler,
        "SEED": seed,
        "JOB_ID": job_id,
        "SLIDER_LORA_STRENGTH": _pick(req.lora_strengths.slider, "slider"),
        "HYPER_CONCEPT_STRENGTH": _pick(
            req.lora_strengths.hyper_concept, "hyper_concept"
        ),
        # v2.1 calibration tokens.
        "SMOOTH_BOOSTER_STRENGTH": _pick(
            req.lora_strengths.smooth_booster, "smooth_booster"
        ),
        "STEPS_HIRES": req.hires_fix.steps,
        "SEED_HIRES": seed_hires,
        "HIRES_DENOISE": hires_denoise,
        # v2.1 IPAdapter tokens (only consumed by illustrious_image_ipa preset).
        "REFERENCE_IMAGE_FILENAME": reference_filename or "",
        "IPADAPTER_WEIGHT": req.reference_weight,
        # v2.2 series-style-LoRA tokens (only consumed by
        # illustrious_image_styled_ipa preset). API convention is forward
        # slashes; normalize to os.sep so the substituted workflow matches
        # ComfyUI's on-disk LoRA registry, which uses backslashes on Windows
        # (verified via /object_info/LoraLoaderModelOnly 2026-05-24 smoke).
        "SERIES_LORA_NAME": (req.series_lora_name or "").replace("/", os.sep),
        "SERIES_LORA_WEIGHT": req.series_lora_weight,
        # v2.4 colorize tokens — only consumed by illustrious_colorize.json.
        # Empty string when not on the colorize path (other presets ignore them).
        # CONTROLNET_MODEL_NAME normalized to os.sep so it matches ComfyUI's
        # ControlNet registry (same Windows-LoRA quirk as series_lora_name).
        "INPUT_IMAGE_FILENAME": input_image_filename or "",
        "CONTROLNET_STRENGTH": req.controlnet_strength,
        "CONTROLNET_MODEL_NAME": req.controlnet_model_name.replace("/", os.sep),
        # v2.4.1 img2img tokens — only consumed by the styled_ipa_img2img
        # preset. Empty string when not on that path (other presets ignore).
        "INIT_IMAGE_FILENAME": init_image_filename or "",
        "INIT_DENOISE": req.init_denoise,
        # v2.5 body-hold tokens — only consumed by illustrious_image_openpose_faceid.
        # Empty string when not on that path (other presets ignore them).
        "ANCHOR_IMAGE_FILENAME": anchor_image_filename or "",
        "OPENPOSE_STRENGTH": req.openpose_strength,
        "FACEID_WEIGHT": req.faceid_weight,
        "FACEID_WEIGHT_V2": req.faceid_weight_v2,
        "FACEID_LORA_STRENGTH": req.faceid_lora_strength,
    }


@app.post(
    "/image",
    status_code=202,
    response_model=ImageGenResponse,
    dependencies=[Depends(verify_api_key)],
)
async def submit_image(request: ImageGenRequest) -> ImageGenResponse:
    """Submit an Illustrious image-gen job. Returns 202 + job_id.

    v2.1: when `reference_image_b64` is present on the request, the bridge
    stages the reference image via ComfyUI's /upload/image and routes to
    the `illustrious_image_ipa` preset (IPAdapter conditioning + lowered
    hires-fix denoise). Otherwise falls through to the existing
    `illustrious_image` preset unchanged.
    """
    job_id = generate_image_job_id()

    # v2.4 colorize — input page validation. The illustrious_colorize workflow
    # REQUIRES an input_image_b64; reject up-front with 400 so the comic-
    # continuer batch loop fails the job cleanly rather than waiting on a
    # ComfyUI workflow error for the missing LoadImage source.
    if request.workflow == "illustrious_colorize" and not request.input_image_b64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="workflow=illustrious_colorize requires input_image_b64",
        )

    # v2.4 colorize — stage the B&W input page if supplied. Mirrors the
    # reference-image staging flow (decode → write to input_dir → upload).
    input_image_filename: str | None = None
    if request.input_image_b64:
        try:
            in_bytes = base64.b64decode(request.input_image_b64, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"input_image_b64 not valid base64: {exc}",
            ) from exc
        if len(in_bytes) > 9 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="input_image_b64 exceeds 9MB raw PNG",
            )
        in_staging_path = state.config.paths.input_dir / f"{job_id}_in.png"
        in_staging_path.write_bytes(in_bytes)
        input_image_filename = await state.comfy.upload_image(in_staging_path)

    # v2.1 IPAdapter routing — stage the reference image if supplied.
    reference_filename: str | None = None
    if request.reference_image_b64:
        try:
            ref_bytes = base64.b64decode(request.reference_image_b64, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"reference_image_b64 not valid base64: {exc}",
            ) from exc
        if len(ref_bytes) > 9 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="reference_image_b64 exceeds 9MB raw PNG",
            )
        ref_staging_path = state.config.paths.input_dir / f"{job_id}_ref.png"
        ref_staging_path.write_bytes(ref_bytes)
        reference_filename = await state.comfy.upload_image(ref_staging_path)

    # v2.4.1 img2img — stage the init image if supplied (mirrors reference
    # staging). Only meaningful when paired with reference + series LoRA
    # (the img2img routing branch below picks it up).
    init_image_filename: str | None = None
    if request.init_image_b64:
        try:
            init_bytes = base64.b64decode(request.init_image_b64, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"init_image_b64 not valid base64: {exc}",
            ) from exc
        if len(init_bytes) > 9 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="init_image_b64 exceeds 9MB raw PNG",
            )
        init_staging_path = state.config.paths.input_dir / f"{job_id}_init.png"
        init_staging_path.write_bytes(init_bytes)
        init_image_filename = await state.comfy.upload_image(init_staging_path)

    # v2.5 body-hold — stage the pose/face anchor frame if supplied (mirrors
    # reference staging). The same image is the OpenPose pose source AND the
    # FaceID identity reference in illustrious_image_openpose_faceid.json.
    anchor_image_filename: str | None = None
    if request.pose_face_anchor_b64:
        try:
            anchor_bytes = base64.b64decode(request.pose_face_anchor_b64, validate=True)
        except (ValueError, base64.binascii.Error) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"pose_face_anchor_b64 not valid base64: {exc}",
            ) from exc
        if len(anchor_bytes) > 9 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="pose_face_anchor_b64 exceeds 9MB raw PNG",
            )
        anchor_staging_path = state.config.paths.input_dir / f"{job_id}_anchor.png"
        anchor_staging_path.write_bytes(anchor_bytes)
        anchor_image_filename = await state.comfy.upload_image(anchor_staging_path)

    # Pick preset by (workflow, reference, series_lora) cross-product.
    # v2.4 colorize takes precedence — when the caller explicitly selects
    # the colorize workflow, the IPA / series-LoRA cross-product is bypassed
    # entirely (the colorize preset has its own pipeline rooted in ControlNet
    # apply, not IPA). v2.2 styled_ipa path unchanged; v2.1 IPA path unchanged.
    if request.workflow == "illustrious_colorize":
        workflow_filename = _resolve_image_workflow_filename(request.workflow)
    elif anchor_image_filename:
        # v2.5 body-hold: OpenPose (pose) + FaceID (identity) anchored on the
        # supplied frame; full-denoise growth. Takes precedence over the IPA /
        # series-LoRA cross-product (it has its own pose+identity pipeline).
        workflow_filename = "illustrious_image_openpose_faceid.json"
    elif reference_filename and request.series_lora_name and init_image_filename:
        # v2.4.1: IPAdapter + series LoRA + img2img init latent. Composition
        # is anchored by the init image; IPA still provides style cue
        # reinforcement; series LoRA dominates artistic style.
        workflow_filename = "illustrious_image_styled_ipa_img2img.json"
    elif reference_filename and request.series_lora_name:
        # v2.2: IPAdapter + series style LoRA chained.
        workflow_filename = "illustrious_image_styled_ipa.json"
    elif reference_filename:
        # v2.1: IPAdapter only.
        workflow_filename = "illustrious_image_ipa.json"
    elif request.series_lora_name:
        # series LoRA without IPA is explicitly out of scope for v2.2.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "series_lora_name requires reference_image_b64 in v2.2 "
                "(series-LoRA-without-IPA path not yet implemented)"
            ),
        )
    else:
        # v1: base preset, no reference, no series LoRA.
        workflow_filename = _resolve_image_workflow_filename(request.workflow)

    tokens = _build_image_token_dict(
        request, job_id, reference_filename, input_image_filename,
        init_image_filename, anchor_image_filename,
    )
    logger.info(
        "image job %s: workflow=%s ref=%s init=%s init_denoise=%s "
        "series=%s series_weight=%s "
        "w=%d h=%d steps=%d cfg=%s sampler=%s "
        "slider=%s hyper=%s ipa_weight=%s seed=%s",
        job_id, workflow_filename, bool(reference_filename),
        bool(init_image_filename), request.init_denoise,
        request.series_lora_name or "-", request.series_lora_weight,
        request.width, request.height,
        request.steps, request.cfg, request.sampler,
        tokens.get("SLIDER_LORA_STRENGTH"), tokens.get("HYPER_CONCEPT_STRENGTH"),
        tokens.get("IPADAPTER_WEIGHT"), tokens.get("SEED"),
    )
    workflow = load_and_substitute(state.presets_dir, workflow_filename, tokens)
    prompt_id = await state.comfy.submit_prompt(workflow)
    queue = await state.comfy.get_queue_info()
    queue_position = len(queue.get("queue_pending") or [])

    # Reuse the existing job_store table. `tier` and `scene_type` are
    # NOT NULL; tag image jobs with constants ("image"/"image") so the
    # row is well-formed without requiring a schema change for these
    # legacy video-oriented columns.
    request_blob = {
        "_kind": "image",
        "tier": "image",
        "scene_type": "image",
        **request.model_dump(mode="json"),
    }
    await state.job_store.create_job(
        job_id=job_id,
        comfy_prompt_id=prompt_id,
        request=request_blob,
        estimated_seconds=TYPICAL_IMAGE_GEN_SECONDS,
        queue_position=queue_position,
    )
    return ImageGenResponse(
        job_id=job_id,
        comfy_prompt_id=prompt_id,
        estimated_seconds=TYPICAL_IMAGE_GEN_SECONDS,
        queue_position=queue_position,
    )


@app.post(
    "/comfyui/free",
    dependencies=[Depends(verify_api_key)],
    response_model=FreeResponse,
)
async def comfyui_free() -> FreeResponse:
    """Force ComfyUI to evict loaded checkpoints + LoRAs from VRAM.

    ComfyUI's /free endpoint sets a flag processed asynchronously by the
    prompt-queue worker. We sleep briefly after to let the worker react.
    The next /image submission cold-loads the checkpoint (~5 s warmup).

    Caller pattern: comic-continuer calls this between its Ollama text-model
    load (20 GB qwen2.5:32b) and its next /image submission, on a shared
    24 GB 4090 where ComfyUI's resident ~15 GB WAI checkpoint would
    otherwise OOM the LLM load.
    """
    before_info = query_gpu_info()
    before_mb = (
        int(before_info["vram_used_gb"] * 1024) if before_info else None
    )

    try:
        await state.comfy.free_memory()
    except ComfyUnreachableError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ComfyUI unreachable: {exc}",
        ) from exc

    # Empirical: ~2 s is enough on this 4090 for the WAI checkpoint to be
    # released after the flag is set. The bridge is the sole consumer of
    # this endpoint, so we don't try to be clever about polling — fixed wait.
    await asyncio.sleep(2.0)

    after_info = query_gpu_info()
    after_mb = (
        int(after_info["vram_used_gb"] * 1024) if after_info else None
    )

    logger.info(
        "comfyui_free: vram %s MB -> %s MB", before_mb, after_mb,
    )
    return FreeResponse(
        ok=True,
        vram_used_mb_before=before_mb,
        vram_used_mb_after=after_mb,
    )


def _compute_image_running_progress(job: dict[str, Any]) -> tuple[int, int | None]:
    """Image-job progress interpolation. Image gen is fast (~15s typical),
    so we interpolate against TYPICAL_IMAGE_GEN_SECONDS rather than the
    per-tier video table.
    """
    started_at_raw = job.get("started_at")
    if not started_at_raw:
        return 10, None
    try:
        started_at = datetime.fromisoformat(str(started_at_raw))
    except ValueError:
        return 10, None
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    elapsed = (datetime.now(tz=UTC) - started_at).total_seconds()
    typical = TYPICAL_IMAGE_GEN_SECONDS
    pct = max(10, min(80, int(10 + (elapsed / typical) * 70)))
    remaining = max(0, int(typical - elapsed))
    return pct, remaining


@app.get("/image/{job_id}", dependencies=[Depends(verify_api_key)])
async def get_image_status(job_id: str) -> dict[str, Any]:
    job = await state.job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if not job_id.startswith("img_"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="job_id is not an image job — use /animate/{id} for video jobs",
        )
    available_formats: list[str] = []
    format_sizes: dict[str, int] = {}
    for fmt, col in [("png", "png_path"), ("webp", "webp_path")]:
        path = job.get(col)
        if path and Path(path).exists():
            available_formats.append(fmt)
            format_sizes[fmt] = Path(path).stat().st_size

    progress_pct = job.get("progress_pct") or 0
    estimated_remaining_seconds: int | None = None
    if job["status"] == "running":
        progress_pct, estimated_remaining_seconds = _compute_image_running_progress(job)

    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress_pct": progress_pct,
        "started_at": job.get("started_at"),
        "estimated_remaining_seconds": estimated_remaining_seconds,
        "available_formats": available_formats,
        "format_sizes_bytes": format_sizes,
        "result_url_png": (
            f"/image/{job_id}/result?format=png" if "png" in available_formats else None
        ),
        "result_url_webp": (
            f"/image/{job_id}/result?format=webp" if "webp" in available_formats else None
        ),
        "error": job.get("error"),
        "metadata": job.get("metadata") or {},
    }


@app.get("/image/{job_id}/result", dependencies=[Depends(verify_api_key)])
async def get_image_result(job_id: str, format: str = "png"):  # noqa: A002 — query param name is part of API contract
    if format not in ("png", "webp"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"unsupported format: {format}"
        )
    job = await state.job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if not job_id.startswith("img_"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="job_id is not an image job — use /animate/{id}/result for video",
        )
    if job["status"] != "complete":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"job status is {job['status']}, not complete",
        )
    col = {"png": "png_path", "webp": "webp_path"}[format]
    path_str = job.get(col)
    if not path_str:
        # On-demand WebP from PNG if pre_convert_webp was False at submit.
        if format == "webp" and job.get("png_path"):
            if state.ffmpeg_version is None:
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="ffmpeg not available — cannot convert PNG to WebP on demand",
                )
            png = Path(job["png_path"])
            webp = png.with_suffix(".webp")
            await png_to_webp_async(png, webp, _default_conversion_params())
            await state.job_store.set_paths(job_id, webp_path=webp)
            path_str = str(webp)
        else:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, detail=f"format {format} not available"
            )
    media_type = {"png": "image/png", "webp": "image/webp"}[format]
    return FileResponse(path_str, media_type=media_type)


@app.delete("/image/{job_id}", dependencies=[Depends(verify_api_key)])
async def cancel_image_job(job_id: str) -> dict[str, str]:
    job = await state.job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if not job_id.startswith("img_"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="job_id is not an image job — use DELETE /animate/{id} for video",
        )
    if job["status"] in ("complete", "failed", "canceled"):
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail=f"job already {job['status']}"
        )
    if job["status"] == "running":
        await state.comfy.interrupt()
    await state.job_store.update_status(job_id, "canceled")
    return {"job_id": job_id, "status": "canceled"}


# -----------------------------------------------------------------------------
# Background watcher
# -----------------------------------------------------------------------------

async def job_watcher_loop() -> None:
    """Single background task that polls ComfyUI history for all running jobs."""
    interval = state.config.comfyui.poll_interval_seconds
    logger.info("job watcher loop started, interval=%.1fs", interval)
    while True:
        try:
            await asyncio.sleep(interval)
            await _watcher_tick()
        except asyncio.CancelledError:
            logger.info("job watcher loop cancelled")
            raise
        except Exception:  # noqa: BLE001 — keep watcher alive across transient errors
            logger.exception("watcher tick raised; continuing")


async def _watcher_tick() -> None:
    pending_jobs = await state.job_store.list_jobs(status_in=["queued", "running"], limit=100)
    if not pending_jobs:
        return
    for job in pending_jobs:
        await _advance_job(job)


async def _advance_job(job: dict[str, Any]) -> None:
    # Path B: image jobs share the watcher loop but have a different
    # completion path (PNG output, no ffmpeg by default). Branch on the
    # job_id prefix — simpler than adding a `kind` column to the schema.
    if str(job.get("job_id", "")).startswith("img_"):
        await _advance_image_job(job)
        return

    job_id = job["job_id"]
    prompt_id = job["comfy_prompt_id"]
    try:
        history = await state.comfy.get_history(prompt_id)
    except ComfyUnreachableError as exc:
        logger.warning("ComfyUI unreachable while polling %s: %s", job_id, exc)
        return

    entry = history.get(prompt_id)
    if entry is None:
        # Job not yet known to history → still queued (or briefly missing right after submit).
        if job["status"] != "running":
            await state.job_store.update_status(job_id, "running", progress_pct=10)
        return

    # Job complete (or failed). ComfyUI's history entries always carry "status".
    status_meta = entry.get("status") or {}
    status_str = status_meta.get("status_str") or ""
    if status_str == "error":
        msgs = status_meta.get("messages") or []
        await state.job_store.update_status(
            job_id, "failed", error=str(msgs)[:500], progress_pct=100
        )
        return

    # Locate the output MP4 in history's "outputs".
    outputs = entry.get("outputs") or {}
    mp4_filename, subfolder = _find_first_video(outputs)
    if mp4_filename is None:
        # Edge case: complete with no video output. Mark failed.
        await state.job_store.update_status(
            job_id, "failed", error="no video output found in ComfyUI history", progress_pct=100
        )
        return

    # Copy ComfyUI's output to bridge-owned results dir (avoids file-locking race per CLAUDE.md).
    comfy_output_dir = _comfy_output_dir() / subfolder
    src_path = comfy_output_dir / mp4_filename
    if not src_path.is_file():
        logger.warning("ComfyUI says complete but output file missing: %s", src_path)
        return
    dst_mp4 = state.config.paths.output_dir / f"{job_id}.mp4"
    shutil.copy2(src_path, dst_mp4)
    await state.job_store.set_paths(job_id, mp4_path=dst_mp4)

    # Optional WebP pre-conversion.
    request = job.get("request") or {}
    if request.get("pre_convert_webp", True) and state.ffmpeg_version is not None:
        await state.job_store.update_status(job_id, "converting", progress_pct=95)
        dst_webp = state.config.paths.output_dir / f"{job_id}.webp"
        try:
            await mp4_to_webp_async(dst_mp4, dst_webp, _default_conversion_params())
            await state.job_store.set_paths(job_id, webp_path=dst_webp)
        except FFmpegFailedError as exc:
            logger.warning("pre-convert webp failed for %s: %s", job_id, exc)
            # Keep MP4 result; WebP can be generated on-demand.

    await state.job_store.update_status(job_id, "complete", progress_pct=100)
    logger.info("job %s complete", job_id)


async def _advance_image_job(job: dict[str, Any]) -> None:
    """Image-job sibling of _advance_job. Same lifecycle states; PNG output
    instead of MP4; optional PNG -> WebP via png_to_webp_async.
    """
    job_id = job["job_id"]
    prompt_id = job["comfy_prompt_id"]
    try:
        history = await state.comfy.get_history(prompt_id)
    except ComfyUnreachableError as exc:
        logger.warning("ComfyUI unreachable while polling %s: %s", job_id, exc)
        return

    entry = history.get(prompt_id)
    if entry is None:
        if job["status"] != "running":
            await state.job_store.update_status(job_id, "running", progress_pct=10)
        return

    status_meta = entry.get("status") or {}
    status_str = status_meta.get("status_str") or ""
    if status_str == "error":
        msgs = status_meta.get("messages") or []
        await state.job_store.update_status(
            job_id, "failed", error=str(msgs)[:500], progress_pct=100
        )
        return

    outputs = entry.get("outputs") or {}
    png_filename, subfolder = _find_first_image(outputs)
    if png_filename is None:
        await state.job_store.update_status(
            job_id, "failed",
            error="no image output found in ComfyUI history", progress_pct=100,
        )
        return

    comfy_output_dir = _comfy_output_dir() / subfolder
    src_path = comfy_output_dir / png_filename
    if not src_path.is_file():
        logger.warning("ComfyUI says complete but output file missing: %s", src_path)
        return

    # Preserve the source extension on the bridge-owned copy. ComfyUI's
    # SaveImage emits PNG by default; some custom nodes save .webp directly.
    dst_path = state.config.paths.output_dir / f"{job_id}{src_path.suffix.lower()}"
    shutil.copy2(src_path, dst_path)
    if dst_path.suffix.lower() == ".png":
        await state.job_store.set_paths(job_id, png_path=dst_path)
    elif dst_path.suffix.lower() == ".webp":
        await state.job_store.set_paths(job_id, webp_path=dst_path)
    else:
        # Unknown extension — store under png_path as a best-effort fallback
        # so the client at least has a path to fetch. The /result endpoint
        # will serve it with the suffix's correct media type if recognized.
        await state.job_store.set_paths(job_id, png_path=dst_path)

    # Optional WebP pre-conversion (off by default for image jobs — most
    # consumers want the lossless PNG and convert later).
    request = job.get("request") or {}
    if (
        request.get("pre_convert_webp", False)
        and state.ffmpeg_version is not None
        and dst_path.suffix.lower() == ".png"
    ):
        await state.job_store.update_status(job_id, "converting", progress_pct=95)
        dst_webp = state.config.paths.output_dir / f"{job_id}.webp"
        try:
            await png_to_webp_async(dst_path, dst_webp, _default_conversion_params())
            await state.job_store.set_paths(job_id, webp_path=dst_webp)
        except FFmpegFailedError as exc:
            logger.warning("pre-convert webp failed for image %s: %s", job_id, exc)
            # Keep PNG result; WebP can be generated on-demand.

    await state.job_store.update_status(job_id, "complete", progress_pct=100)
    logger.info("image job %s complete", job_id)


def _find_first_video(outputs: dict[str, Any]) -> tuple[str | None, str]:
    """Walk a ComfyUI 'outputs' dict and return (filename, subfolder) of first video."""
    for node_outputs in outputs.values():
        # SaveVideo emits 'videos' or 'gifs'; some nodes emit 'images' for animations.
        for key in ("videos", "video", "gifs", "images"):
            items = node_outputs.get(key) or []
            for item in items:
                fname = item.get("filename") if isinstance(item, dict) else None
                if fname and fname.lower().endswith((".mp4", ".webp", ".gif", ".webm")):
                    return fname, item.get("subfolder", "") if isinstance(item, dict) else ""
    return None, ""


def _find_first_image(outputs: dict[str, Any]) -> tuple[str | None, str]:
    """Image-job sibling of _find_first_video. Looks for still PNG/JPG/WebP
    output from SaveImage nodes. Matches only when the file extension is
    one of the still-image formats; animated WebP from video pipelines goes
    through _find_first_video instead.
    """
    for node_outputs in outputs.values():
        # SaveImage emits "images" as a list of {filename, subfolder, type}.
        items = node_outputs.get("images") or []
        for item in items:
            fname = item.get("filename") if isinstance(item, dict) else None
            if fname and fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                return (
                    fname,
                    item.get("subfolder", "") if isinstance(item, dict) else "",
                )
    return None, ""


def _comfy_output_dir() -> Path:
    """ComfyUI's output dir relative to the bridge data root.

    The portable build writes to ComfyUI/output/. We resolve via the comfyui
    URL host (only useful when local) and a fixed relative offset. For
    production this is configurable in Phase 3; today it's hardcoded to the
    portable layout.
    """
    # The bridge runs alongside ComfyUI on the same host. ComfyUI's output
    # dir is configured at install time; for the Wan 2.2 portable build at
    # D:\LLM\ComfyUI_windows_portable, output lives at .../ComfyUI/output/.
    return Path("D:/LLM/ComfyUI_windows_portable/ComfyUI/output")


# -----------------------------------------------------------------------------
# Entry point
# -----------------------------------------------------------------------------

def run() -> None:
    """Entrypoint defined in pyproject.toml [project.scripts]."""
    import uvicorn

    cfg = load_config()
    uvicorn.run(
        "src.main:app",
        host=cfg.server.host,
        port=cfg.server.port,
        log_level=cfg.logging.level.lower(),
    )


if __name__ == "__main__":
    run()
