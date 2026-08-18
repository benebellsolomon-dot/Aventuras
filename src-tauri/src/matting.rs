//! V2 sprite matting (Spec 4 V2b): isnet-anime background removal via ort.
//!
//! One command does matte → resize → WEBP so the WebView never touches WASM
//! inference or encoding. The 176MB model is deliberately NOT bundled — it
//! lives at <app-data>/models/isnet-anime.onnx (survives redeploys; the app
//! works without it via the frontend pass-through).
//!
//! Preprocessing follows SkyTNT/anime-segmentation's export: RGB, 0-1 scale,
//! no mean/std, 1024x1024; the output is a [0,1] alpha mask. Verify against a
//! known render on first live use — a wrong normalization yields plausible but
//! soft masks.

use base64::Engine;
use image::imageops::FilterType;
use image::{DynamicImage, RgbaImage};
use ort::session::Session;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

const INPUT_SIZE: u32 = 1024;
const OUTPUT_HEIGHT: u32 = 1024;
const WEBP_QUALITY: f32 = 80.0;

pub struct MattingState(Mutex<Option<Session>>);

impl Default for MattingState {
    fn default() -> Self {
        MattingState(Mutex::new(None))
    }
}

fn model_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = app
        .path()
        .app_data_dir()
        .ok()?
        .join("models")
        .join("isnet-anime.onnx");
    path.exists().then_some(path)
}

fn ensure_session(app: &tauri::AppHandle, state: &MattingState) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(true);
    }
    let Some(path) = model_path(app) else {
        return Ok(false);
    };
    let session = Session::builder()
        .map_err(|e| e.to_string())?
        .with_execution_providers([
            ort::execution_providers::CoreMLExecutionProvider::default().build()
        ])
        .map_err(|e| e.to_string())?
        .commit_from_file(&path)
        .map_err(|e| e.to_string())?;
    *guard = Some(session);
    Ok(true)
}

#[tauri::command]
pub fn sprite_matting_available(
    app: tauri::AppHandle,
    state: tauri::State<'_, MattingState>,
) -> bool {
    ensure_session(&app, &state).unwrap_or(false)
}

#[tauri::command]
pub fn sprite_finish(
    app: tauri::AppHandle,
    state: tauri::State<'_, MattingState>,
    png_base64: String,
) -> Result<String, String> {
    if !ensure_session(&app, &state)? {
        return Err("matting model not installed".into());
    }

    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.trim())
        .map_err(|e| format!("bad png base64: {e}"))?;
    let original = image::load_from_memory(&png_bytes)
        .map_err(|e| format!("png decode failed: {e}"))?;
    let (orig_w, orig_h) = (original.width(), original.height());

    // NCHW float32 0-1 over a 1024x1024 Lanczos resize.
    let resized = original
        .resize_exact(INPUT_SIZE, INPUT_SIZE, FilterType::Lanczos3)
        .to_rgb8();
    let plane = (INPUT_SIZE * INPUT_SIZE) as usize;
    let mut input = vec![0f32; 3 * plane];
    for (i, px) in resized.pixels().enumerate() {
        for c in 0..3 {
            input[c * plane + i] = f32::from(px[c]) / 255.0;
        }
    }

    let mask = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        let session = guard.as_mut().ok_or("matting session missing")?;
        let input_name = session.inputs()[0].name().to_string();
        let tensor = ort::value::Tensor::from_array((
            [1usize, 3, INPUT_SIZE as usize, INPUT_SIZE as usize],
            input,
        ))
        .map_err(|e| e.to_string())?;
        let outputs = session
            .run(ort::inputs![input_name.as_str() => tensor])
            .map_err(|e| e.to_string())?;
        let (_, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        data.to_vec()
    };

    // Mask (1024^2, [0,1]) → alpha at the ORIGINAL resolution (color detail is
    // preserved; only the mask is upscaled), then downsize for storage.
    let mask_img = image::GrayImage::from_raw(
        INPUT_SIZE,
        INPUT_SIZE,
        mask.iter()
            .map(|v| (v.clamp(0.0, 1.0) * 255.0) as u8)
            .collect(),
    )
    .ok_or("mask shape mismatch")?;
    let mask_full = image::imageops::resize(&mask_img, orig_w, orig_h, FilterType::Triangle);

    let mut rgba: RgbaImage = original.to_rgba8();
    for (pixel, mask_px) in rgba.pixels_mut().zip(mask_full.pixels()) {
        pixel[3] = ((u16::from(pixel[3]) * u16::from(mask_px[0])) / 255) as u8;
    }

    let final_h = OUTPUT_HEIGHT.min(orig_h);
    let final_w = ((u64::from(orig_w) * u64::from(final_h)) / u64::from(orig_h)).max(1) as u32;
    let finished = DynamicImage::ImageRgba8(rgba).resize_exact(
        final_w,
        final_h,
        FilterType::Lanczos3,
    );

    let webp_bytes = webp::Encoder::from_rgba(finished.to_rgba8().as_raw(), final_w, final_h)
        .encode(WEBP_QUALITY)
        .to_vec();
    Ok(base64::engine::general_purpose::STANDARD.encode(webp_bytes))
}
