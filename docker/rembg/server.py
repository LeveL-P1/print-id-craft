import io
import os
import inspect
from functools import lru_cache

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
SERVICE_TOKEN = os.getenv("BG_REMOVAL_SERVICE_TOKEN", "")
MAX_PIXELS = int(os.getenv("BG_REMOVAL_MAX_PIXELS", "3600000"))
ALPHA_MATTING = os.getenv("BG_REMOVAL_ALPHA_MATTING", "1").lower() not in {"0", "false", "no"}
ALPHA_FOREGROUND_THRESHOLD = int(os.getenv("BG_REMOVAL_ALPHA_FOREGROUND_THRESHOLD", "240"))
ALPHA_BACKGROUND_THRESHOLD = int(os.getenv("BG_REMOVAL_ALPHA_BACKGROUND_THRESHOLD", "10"))
ALPHA_ERODE_SIZE = int(os.getenv("BG_REMOVAL_ALPHA_ERODE_SIZE", "10"))
REMOVE_SIGNATURE = inspect.signature(remove)


@lru_cache(maxsize=4)
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


def supported_remove_kwargs() -> dict:
    requested = {
        "alpha_matting": ALPHA_MATTING,
        "alpha_matting_foreground_threshold": ALPHA_FOREGROUND_THRESHOLD,
        "alpha_matting_background_threshold": ALPHA_BACKGROUND_THRESHOLD,
        "alpha_matting_erode_size": ALPHA_ERODE_SIZE,
        "post_process_mask": True,
    }
    params = REMOVE_SIGNATURE.parameters
    if any(param.kind == inspect.Parameter.VAR_KEYWORD for param in params.values()):
        return requested
    return {key: value for key, value in requested.items() if key in params}


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": DEFAULT_MODEL,
        "modelChain": candidate_models(DEFAULT_MODEL),
        "alphaMatting": ALPHA_MATTING,
        "maxPixels": MAX_PIXELS,
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
        result: Image.Image | bytes | None = None
        used_model = ""
        for model_name in candidate_models(model):
            try:
                session = get_session(model_name)
                result = remove(
                    source,
                    session=session,
                    **supported_remove_kwargs(),
                )
                used_model = model_name
                break
            except Exception as exc:
                last_error = exc
                continue

        if result is None:
            raise last_error or RuntimeError("No background removal model could run")
        if isinstance(result, bytes):
            result = Image.open(io.BytesIO(result)).convert("RGBA")
        else:
            result = result.convert("RGBA")

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
