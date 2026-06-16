import io
import os
import inspect
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from rembg import new_session, remove

try:
    from scipy.ndimage import maximum_filter as _scipy_max_filter
    from scipy.ndimage import binary_dilation, binary_erosion
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

try:
    from PIL import ImageFilter, ImageOps
    HAS_PIL_ENHANCE = True
except ImportError:
    HAS_PIL_ENHANCE = False
    HAS_SCIPY = False


app = FastAPI(title="WiseMelon Professional Background Removal")

SERVICE_VERSION = "2026-06-15-rembg-inspyrenet-v1"
REMOVEBG_COMPAT_API_KEY = os.getenv("REMOVEBG_COMPAT_API_KEY", os.getenv("BG_REMOVAL_SERVICE_TOKEN", ""))
JPEG_QUALITY = int(os.getenv("BG_REMOVAL_JPEG_QUALITY", "92"))
DEFAULT_MODEL = os.getenv("BG_REMOVAL_MODEL", "birefnet-portrait")
DEFAULT_MODEL_CHAIN = [
    name.strip()
    for name in os.getenv(
        "BG_REMOVAL_MODEL_CHAIN",
        "birefnet-portrait,birefnet-general,isnet-general-use,u2net_human_seg",
    ).split(",")
    if name.strip()
]
MERGE_MASK_MODEL = os.getenv("BG_REMOVAL_MERGE_MODEL", "birefnet-massive").strip()
MERGE_MASK_ENABLED = os.getenv("BG_REMOVAL_MERGE_MASK", "1").lower() not in {"0", "false", "no"}
MERGE_ALPHA_SCALE = float(os.getenv("BG_REMOVAL_MERGE_ALPHA_SCALE", "0.94"))
MERGE_HOLE_PRIMARY_MAX = int(os.getenv("BG_REMOVAL_MERGE_HOLE_PRIMARY_MAX", "96"))
MERGE_HOLE_SECONDARY_MIN = int(os.getenv("BG_REMOVAL_MERGE_HOLE_SECONDARY_MIN", "88"))
SERVICE_TOKEN = os.getenv("BG_REMOVAL_SERVICE_TOKEN", "")
MAX_PIXELS = int(os.getenv("BG_REMOVAL_MAX_PIXELS", "3600000"))
ALPHA_MATTING = os.getenv("BG_REMOVAL_ALPHA_MATTING", "1").lower() not in {"0", "false", "no"}
ALPHA_FOREGROUND_THRESHOLD = int(os.getenv("BG_REMOVAL_ALPHA_FOREGROUND_THRESHOLD", "240"))
ALPHA_BACKGROUND_THRESHOLD = int(os.getenv("BG_REMOVAL_ALPHA_BACKGROUND_THRESHOLD", "10"))
ALPHA_ERODE_SIZE = int(os.getenv("BG_REMOVAL_ALPHA_ERODE_SIZE", "8"))
REMOVE_SIGNATURE = inspect.signature(remove)


@lru_cache(maxsize=8)
def get_session(model_name: str):
    return new_session(model_name)


def check_auth(authorization: str | None, x_api_key: str | None = None):
    """Accept Bearer token (WiseMelon) or X-Api-Key (remove.bg-compatible clients)."""
    if not SERVICE_TOKEN and not REMOVEBG_COMPAT_API_KEY:
        return
    if SERVICE_TOKEN and authorization == f"Bearer {SERVICE_TOKEN}":
        return
    if REMOVEBG_COMPAT_API_KEY and x_api_key == REMOVEBG_COMPAT_API_KEY:
        return
    raise HTTPException(status_code=401, detail="Unauthorized")


def parse_hex_color(hex_color: str | None) -> tuple[int, int, int] | None:
    if not hex_color:
        return None
    hex_value = hex_color.strip().lstrip("#")
    if len(hex_value) == 3:
        hex_value = "".join(ch * 2 for ch in hex_value)
    if len(hex_value) not in {6, 8} or not all(ch in "0123456789abcdefABCDEF" for ch in hex_value[:6]):
        raise HTTPException(status_code=400, detail="Invalid bg_color hex value")
    return (
        int(hex_value[0:2], 16),
        int(hex_value[2:4], 16),
        int(hex_value[4:6], 16),
    )


def composite_bg_color(rgba: Image.Image, hex_color: str) -> Image.Image:
    rgb = parse_hex_color(hex_color)
    if rgb is None:
        raise HTTPException(status_code=400, detail="Invalid bg_color hex value")
    background = Image.new("RGB", rgba.size, rgb)
    background.paste(rgba.convert("RGBA"), mask=rgba.convert("RGBA").split()[3])
    return background


def model_for_removebg_type(subject_type: str | None) -> str:
    normalized = (subject_type or "auto").strip().lower()
    if normalized in {"person", "human"}:
        return "birefnet-portrait"
    if normalized in {"product", "car", "animal", "transportation", "graphics"}:
        return "birefnet-general"
    return DEFAULT_MODEL


def encode_result(
    result: Image.Image,
    *,
    output_format: str,
    bg_color: str | None,
    channels: str | None,
) -> tuple[bytes, str]:
    normalized_format = (output_format or "auto").strip().lower()
    normalized_channels = (channels or "rgba").strip().lower()
    use_jpeg = normalized_format in {"jpg", "jpeg"} or (normalized_format == "auto" and bg_color)

    if normalized_channels == "alpha":
        output = io.BytesIO()
        result.convert("RGBA").split()[3].save(output, format="PNG")
        return output.getvalue(), "image/png"

    if bg_color:
        flattened = composite_bg_color(result, bg_color)
        if use_jpeg:
            buffer = io.BytesIO()
            flattened.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            return buffer.getvalue(), "image/jpeg"
        buffer = io.BytesIO()
        flattened.save(buffer, format="PNG")
        return buffer.getvalue(), "image/png"

    buffer = io.BytesIO()
    result.save(buffer, format="PNG")
    return buffer.getvalue(), "image/png"


def prepare_image(raw: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(raw)).convert("RGBA")
    pixels = image.width * image.height
    if pixels > MAX_PIXELS:
        scale = (MAX_PIXELS / pixels) ** 0.5
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return image


def enhance_contrast_for_model(image: Image.Image) -> Image.Image:
    """
    Apply CLAHE-style local contrast enhancement before sending to the model.
    This makes dark hair stand out more against light walls, dramatically
    improving detection accuracy for Indian school hairstyles (black hair
    on grey/white backgrounds).
    
    Uses PIL autocontrast + detail enhancement as a lightweight CLAHE equivalent.
    The enhanced image is only used for MODEL INFERENCE — the original is used
    for the final output colours.
    """
    if not HAS_PIL_ENHANCE:
        return image
    try:
        # Convert to RGB for enhancement (model sees RGB internally)
        rgb = image.convert("RGB")
        # Autocontrast: stretches histogram per channel
        enhanced = ImageOps.autocontrast(rgb, cutoff=1)
        # Sharpen slightly to make edges (hair boundaries) more pronounced
        enhanced = enhanced.filter(ImageFilter.DETAIL)
        # Convert back to RGBA
        enhanced_rgba = enhanced.convert("RGBA")
        # Restore original alpha channel
        enhanced_rgba.putalpha(image.split()[3])
        return enhanced_rgba
    except Exception:
        return image


def candidate_models(requested_model: str | None) -> list[str]:
    models: list[str] = []
    for name in [requested_model, DEFAULT_MODEL, *DEFAULT_MODEL_CHAIN]:
        if name and name not in models:
            models.append(name)
    return models or [DEFAULT_MODEL]


def supported_remove_kwargs(*, alpha_matting: bool | None = None) -> dict:
    use_matting = ALPHA_MATTING if alpha_matting is None else alpha_matting
    requested = {
        "alpha_matting": use_matting,
        "alpha_matting_foreground_threshold": ALPHA_FOREGROUND_THRESHOLD,
        "alpha_matting_background_threshold": ALPHA_BACKGROUND_THRESHOLD,
        "alpha_matting_erode_size": ALPHA_ERODE_SIZE,
        "post_process_mask": True,
    }
    params = REMOVE_SIGNATURE.parameters
    if any(param.kind == inspect.Parameter.VAR_KEYWORD for param in params.values()):
        if not use_matting:
            requested["alpha_matting"] = False
        return requested
    filtered = {key: value for key, value in requested.items() if key in params}
    if not use_matting and "alpha_matting" in filtered:
        filtered["alpha_matting"] = False
    return filtered


def normalize_model_name(model: str | None) -> str:
    raw = (model or DEFAULT_MODEL).strip()
    compact = raw.lower().replace("_", "").replace("-", "")
    if compact in {"inspyrenet", "inspyre"}:
        return "inspyrenet"
    return raw


INSPYRENET_REMOVER = None
INSPYRENET_IMPORT_ERROR: str | None = None


def inspyrenet_available() -> bool:
    try:
        from transparent_background import Remover  # noqa: F401
        return True
    except ImportError as exc:
        global INSPYRENET_IMPORT_ERROR
        INSPYRENET_IMPORT_ERROR = str(exc)
        return False


def get_inspyrenet_remover():
    global INSPYRENET_REMOVER
    if INSPYRENET_REMOVER is None:
        try:
            from transparent_background import Remover
        except ImportError as exc:
            raise ImportError(
                "transparent-background is required for InSPyReNet. "
                "Install with: pip install transparent-background"
            ) from exc

        device = os.getenv("INSPYRENET_DEVICE", "cpu").strip()
        mode = os.getenv("INSPYRENET_MODE", "base").strip()
        use_jit = os.getenv("INSPYRENET_JIT", "0").lower() in {"1", "true", "yes"}
        try:
            INSPYRENET_REMOVER = Remover(mode=mode, jit=use_jit, device=device)
        except TypeError:
            INSPYRENET_REMOVER = Remover()
    return INSPYRENET_REMOVER


def run_inspyrenet_remove(source: Image.Image, bg_color: str | None = None) -> Image.Image:
    remover = get_inspyrenet_remover()
    rgb_source = source.convert("RGB")
    bg_rgb = parse_hex_color(bg_color)
    if bg_rgb:
        result = remover.process(rgb_source, type=list(bg_rgb))
    else:
        result = remover.process(rgb_source, type="rgba")
    if isinstance(result, Image.Image):
        return result
    return Image.fromarray(np.asarray(result))


def encode_rgb_jpeg(image: Image.Image) -> tuple[bytes, str]:
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buffer.getvalue(), "image/jpeg"


def to_rgba_image(result: Image.Image | bytes) -> Image.Image:
    if isinstance(result, bytes):
        return Image.open(io.BytesIO(result)).convert("RGBA")
    return result.convert("RGBA")


BRIA_SESSION = None


def get_bria_session():
    global BRIA_SESSION
    if BRIA_SESSION is None:
        try:
            from huggingface_hub import hf_hub_download
            import onnxruntime as ort
        except ImportError as exc:
            raise ImportError(
                "huggingface_hub and onnxruntime are required for BRIA RMBG-2.0. "
                "Make sure they are installed in requirements.txt."
            ) from exc

        # Download the quantized ONNX model from Hugging Face
        model_path = hf_hub_download(
            repo_id="briaai/RMBG-2.0",
            filename="onnx/model_quantized.onnx",
        )

        available_providers = ort.get_available_providers()
        providers = []
        if "CUDAExecutionProvider" in available_providers:
            providers.append("CUDAExecutionProvider")
        if "CPUExecutionProvider" in available_providers:
            providers.append("CPUExecutionProvider")
        if not providers:
            providers = ort.get_all_providers()

        BRIA_SESSION = ort.InferenceSession(model_path, providers=providers)
    return BRIA_SESSION


def run_bria_remove(source: Image.Image) -> Image.Image:
    session = get_bria_session()

    # Preprocess
    w, h = source.size
    # RMBG-2.0 expects 1024x1024 input
    im = source.convert("RGB").resize((1024, 1024), Image.Resampling.BILINEAR)
    im_arr = np.array(im, dtype=np.float32) / 255.0

    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    im_arr = (im_arr - mean) / std

    im_arr = im_arr.transpose((2, 0, 1))
    input_data = np.expand_dims(im_arr, axis=0)

    # Inference
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    outputs = session.run([output_name], {input_name: input_data})

    # Postprocess
    pred = outputs[0]
    pred = np.squeeze(pred)

    # Sigmoid activation: 1 / (1 + exp(-x))
    pred = np.clip(pred, -20.0, 20.0)
    mask = 1.0 / (1.0 + np.exp(-pred))

    mask_uint8 = (mask * 255.0).astype(np.uint8)
    mask_pil = Image.fromarray(mask_uint8, mode="L").resize((w, h), Image.Resampling.BILINEAR)

    # Create output image with transparency
    output = source.convert("RGBA")
    output.putalpha(mask_pil)
    return output


def run_remove(source: Image.Image, model_name: str, *, alpha_matting: bool | None = None) -> Image.Image:
    if normalize_model_name(model_name) == "inspyrenet":
        return run_inspyrenet_remove(source).convert("RGBA")

    if model_name == "bria-rmbg2":
        return run_bria_remove(source)

    session = get_session(model_name)
    result = remove(
        source,
        session=session,
        **supported_remove_kwargs(alpha_matting=alpha_matting),
    )
    return to_rgba_image(result)



def merge_person_masks(
    source: Image.Image,
    primary: Image.Image,
    secondary: Image.Image,
) -> Image.Image:
    """
    Combine a precise portrait mask with a generous human-seg mask.
    Uses original photo RGB so filled hair/shirt patches keep true colours.
    """
    source_rgba = np.array(source.convert("RGBA"), dtype=np.uint8)
    primary_a = np.array(primary.convert("RGBA"), dtype=np.uint8)[..., 3]
    secondary_rgba = secondary.convert("RGBA")
    if secondary_rgba.size != source.size:
        secondary_rgba = secondary_rgba.resize(source.size, Image.Resampling.LANCZOS)
    secondary_a = np.array(secondary_rgba, dtype=np.uint8)[..., 3]

    secondary_scaled = np.clip(
        secondary_a.astype(np.float32) * MERGE_ALPHA_SCALE,
        0,
        255,
    ).astype(np.uint8)

    merged_a = primary_a.copy()

    # Fill interior holes (hair patches) where human-seg is confident.
    hole_fill = (primary_a < MERGE_HOLE_PRIMARY_MAX) & (secondary_scaled >= MERGE_HOLE_SECONDARY_MIN)
    merged_a[hole_fill] = np.maximum(primary_a[hole_fill], secondary_scaled[hole_fill])

    # Boost wispy strands still inside the human silhouette.
    wispy = (
        (secondary_scaled >= MERGE_HOLE_SECONDARY_MIN)
        & (primary_a >= MERGE_HOLE_PRIMARY_MAX)
        & (primary_a < 168)
    )
    merged_a[wispy] = np.maximum(merged_a[wispy], secondary_scaled[wispy])

    out = source_rgba.copy()
    out[..., 3] = merged_a

    # --- 1px alpha dilation: expand foreground edge to cover micro-gaps ---
    if HAS_SCIPY:
        dilated_a = _scipy_max_filter(merged_a, size=3)
        boost_mask = (merged_a < 48) & (dilated_a >= 48)
        out[boost_mask, :3] = source_rgba[boost_mask, :3]
        out[boost_mask, 3] = np.clip(dilated_a[boost_mask].astype(np.int16) - 16, 32, 255).astype(np.uint8)

        # --- Morphological closing: fill tiny interior gaps without expanding silhouette ---
        # dilate(3x3) then erode(3x3) on the alpha channel
        fg_binary = out[..., 3] >= 64
        closed = binary_dilation(fg_binary, iterations=1)
        closed = binary_erosion(closed, iterations=1)
        # Any pixel that was closed but had low alpha → boost it
        close_fill = closed & (~fg_binary)
        out[close_fill, :3] = source_rgba[close_fill, :3]  # original RGB
        out[close_fill, 3] = 192  # semi-strong alpha

    return Image.fromarray(out, "RGBA")


def maybe_merge_with_person_mask(
    source: Image.Image,
    primary: Image.Image,
    primary_model: str,
) -> tuple[Image.Image, str]:
    if not MERGE_MASK_ENABLED or not MERGE_MASK_MODEL:
        return primary, primary_model
    if MERGE_MASK_MODEL == primary_model:
        return primary, primary_model

    try:
        secondary = run_remove(source, MERGE_MASK_MODEL, alpha_matting=False)
        merged = merge_person_masks(source, primary, secondary)
        return merged, f"{primary_model}+{MERGE_MASK_MODEL}"
    except Exception:
        return primary, primary_model


@app.get("/health")
def health():
    return {
        "ok": True,
        "serviceVersion": SERVICE_VERSION,
        "model": DEFAULT_MODEL,
        "modelChain": candidate_models(DEFAULT_MODEL),
        "mergeMask": MERGE_MASK_ENABLED,
        "mergeModel": MERGE_MASK_MODEL if MERGE_MASK_ENABLED else None,
        "alphaMatting": ALPHA_MATTING,
        "maxPixels": MAX_PIXELS,
        "removebgCompatible": True,
        "removebgEndpoint": "/v1.0/removebg",
        "inspyrenetAvailable": inspyrenet_available(),
    }


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "WiseMelon background removal",
        "health": "/health",
        "remove": "/remove",
        "removebgCompatible": "/v1.0/removebg",
    }


async def run_portrait_pipeline(
    raw: bytes,
    *,
    requested_model: str | None = None,
) -> tuple[Image.Image, str]:
    source = prepare_image(raw)
    enhanced = enhance_contrast_for_model(source)
    last_error: Exception | None = None
    result: Image.Image | None = None
    used_model = ""

    for model_name in candidate_models(requested_model):
        try:
            enhanced_result = run_remove(enhanced, model_name)
            enhanced_a = np.array(enhanced_result.convert("RGBA"), dtype=np.uint8)[..., 3]
            source_rgba = np.array(source.convert("RGBA"), dtype=np.uint8)
            out = source_rgba.copy()
            out[..., 3] = enhanced_a
            result = Image.fromarray(out, "RGBA")
            used_model = model_name
            break
        except Exception as exc:
            last_error = exc
            continue

    if result is None:
        raise last_error or RuntimeError("No background removal model could run")

    try:
        if used_model and enhanced is not source:
            original_result = run_remove(source, used_model)
            original_a = np.array(original_result.convert("RGBA"), dtype=np.uint8)[..., 3]
            result_rgba = np.array(result.convert("RGBA"), dtype=np.uint8)
            combined_a = np.maximum(result_rgba[..., 3], original_a)
            result_rgba[..., 3] = combined_a
            result = Image.fromarray(result_rgba, "RGBA")
            used_model = f"{used_model}+dual"
    except Exception:
        pass

    result, used_model = maybe_merge_with_person_mask(source, result, used_model)
    return result, used_model


@app.post("/remove")
async def remove_background(
    image: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    bgColor: str | None = Form(default=None),
    bg_color: str | None = Form(default=None),
    format: str = Form(default="png"),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
):
    check_auth(authorization, x_api_key)
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Image is required")

    try:
        requested = normalize_model_name(model)
        chosen_bg = bgColor or bg_color

        if requested == "inspyrenet":
            source = prepare_image(raw)
            result = run_inspyrenet_remove(source, chosen_bg)
            if chosen_bg:
                body, media_type = encode_rgb_jpeg(result)
            else:
                body, media_type = encode_result(
                    result.convert("RGBA"),
                    output_format=format,
                    bg_color=None,
                    channels="rgba",
                )
            return Response(
                content=body,
                media_type=media_type,
                headers={"x-bg-removal-model": "inspyrenet"},
            )

        result, used_model = await run_portrait_pipeline(raw, requested_model=requested)
        body, media_type = encode_result(
            result,
            output_format=format,
            bg_color=chosen_bg,
            channels="rgba",
        )
        return Response(
            content=body,
            media_type=media_type,
            headers={"x-bg-removal-model": used_model},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Background removal failed: {exc}") from exc


@app.post("/v1.0/removebg")
async def removebg_compatible(
    image_file: UploadFile = File(...),
    size: str = Form(default="auto"),
    subject_type: str = Form(default="auto", alias="type"),
    format: str = Form(default="auto"),
    bg_color: str | None = Form(default=None),
    crop: str = Form(default="false"),
    channels: str = Form(default="rgba"),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
):
    """
    Drop-in replacement for https://api.remove.bg/v1.0/removebg

    remove.bg uses proprietary models; this endpoint uses open-source equivalents:
    - person: BiRefNet-portrait + u2net_human_seg merge (same as WiseMelon /remove)
    - product/auto: BiRefNet-general chain
    """
    check_auth(authorization, x_api_key)
    raw = await image_file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="image_file is required")

    try:
        requested_model = model_for_removebg_type(subject_type)
        result, used_model = await run_portrait_pipeline(raw, requested_model=requested_model)

        if crop.strip().lower() in {"1", "true", "yes"}:
            bbox = result.getbbox()
            if bbox:
                result = result.crop(bbox)

        if size.strip().lower() == "preview":
            preview = result.copy()
            preview.thumbnail((625, 400), Image.Resampling.LANCZOS)
            result = preview

        body, media_type = encode_result(
            result,
            output_format=format,
            bg_color=bg_color,
            channels=channels,
        )
        return Response(
            content=body,
            media_type=media_type,
            headers={
                "x-bg-removal-model": used_model,
                "x-removebg-replica": "wisemelon-rembg",
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Background removal failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "7000")))
