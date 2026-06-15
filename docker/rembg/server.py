import io
import os
import inspect
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from rembg import new_session, remove


app = FastAPI(title="WiseMelon Professional Background Removal")

DEFAULT_MODEL = os.getenv("BG_REMOVAL_MODEL", "birefnet-portrait")
DEFAULT_MODEL_CHAIN = [
    name.strip()
    for name in os.getenv(
        "BG_REMOVAL_MODEL_CHAIN",
        "birefnet-portrait,birefnet-general,isnet-general-use,u2net_human_seg",
    ).split(",")
    if name.strip()
]
MERGE_MASK_MODEL = os.getenv("BG_REMOVAL_MERGE_MODEL", "u2net_human_seg").strip()
MERGE_MASK_ENABLED = os.getenv("BG_REMOVAL_MERGE_MASK", "1").lower() not in {"0", "false", "no"}
MERGE_ALPHA_SCALE = float(os.getenv("BG_REMOVAL_MERGE_ALPHA_SCALE", "0.94"))
MERGE_HOLE_PRIMARY_MAX = int(os.getenv("BG_REMOVAL_MERGE_HOLE_PRIMARY_MAX", "84"))
MERGE_HOLE_SECONDARY_MIN = int(os.getenv("BG_REMOVAL_MERGE_HOLE_SECONDARY_MIN", "112"))
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


def check_auth(authorization: str | None):
    if not SERVICE_TOKEN:
        return
    expected = f"Bearer {SERVICE_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


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


def to_rgba_image(result: Image.Image | bytes) -> Image.Image:
    if isinstance(result, bytes):
        return Image.open(io.BytesIO(result)).convert("RGBA")
    return result.convert("RGBA")


def run_remove(source: Image.Image, model_name: str, *, alpha_matting: bool | None = None) -> Image.Image:
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
        "model": DEFAULT_MODEL,
        "modelChain": candidate_models(DEFAULT_MODEL),
        "mergeMask": MERGE_MASK_ENABLED,
        "mergeModel": MERGE_MASK_MODEL if MERGE_MASK_ENABLED else None,
        "alphaMatting": ALPHA_MATTING,
        "maxPixels": MAX_PIXELS,
    }


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "WiseMelon background removal",
        "health": "/health",
        "remove": "/remove",
    }


@app.post("/remove")
async def remove_background(
    image: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    authorization: str | None = Header(default=None),
):
    check_auth(authorization)
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Image is required")

    try:
        source = prepare_image(raw)
        last_error: Exception | None = None
        result: Image.Image | None = None
        used_model = ""
        for model_name in candidate_models(model):
            try:
                result = run_remove(source, model_name)
                used_model = model_name
                break
            except Exception as exc:
                last_error = exc
                continue

        if result is None:
            raise last_error or RuntimeError("No background removal model could run")

        result, used_model = maybe_merge_with_person_mask(source, result, used_model)

        output = io.BytesIO()
        result.save(output, format="PNG")
        return Response(
            content=output.getvalue(),
            media_type="image/png",
            headers={"x-bg-removal-model": used_model},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Background removal failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "7000")))
