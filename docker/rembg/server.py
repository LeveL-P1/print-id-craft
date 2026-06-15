import io
import os
from functools import lru_cache

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from rembg import new_session, remove


app = FastAPI(title="WiseMelon Professional Background Removal")

DEFAULT_MODEL = os.getenv("BG_REMOVAL_MODEL", "birefnet-portrait")
SERVICE_TOKEN = os.getenv("BG_REMOVAL_SERVICE_TOKEN", "")
MAX_PIXELS = int(os.getenv("BG_REMOVAL_MAX_PIXELS", "2500000"))


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


@app.get("/health")
def health():
    return {"ok": True, "model": DEFAULT_MODEL}


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
        session = get_session(model or DEFAULT_MODEL)
        result = remove(source, session=session)
        output = io.BytesIO()
        result.save(output, format="PNG")
        return Response(content=output.getvalue(), media_type="image/png")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Background removal failed: {exc}") from exc
