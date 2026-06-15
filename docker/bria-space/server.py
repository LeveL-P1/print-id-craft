import io
import os
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

try:
    from PIL import ImageFilter, ImageOps
    HAS_PIL_ENHANCE = True
except ImportError:
    HAS_PIL_ENHANCE = False

app = FastAPI(title="WiseMelon Dedicated BRIA RMBG-2.0 Service")

SERVICE_VERSION = "2026-06-15-bria-v1"
SERVICE_TOKEN = os.getenv("BG_REMOVAL_SERVICE_TOKEN", "")
MAX_PIXELS = int(os.getenv("BG_REMOVAL_MAX_PIXELS", "3600000"))

BRIA_SESSION = None

def get_bria_session():
    global BRIA_SESSION
    if BRIA_SESSION is None:
        from huggingface_hub import hf_hub_download
        import onnxruntime as ort

        # Download quantized BRIA RMBG-2.0 ONNX model
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


def enhance_contrast_for_model(image: Image.Image) -> Image.Image:
    if not HAS_PIL_ENHANCE:
        return image
    try:
        rgb = image.convert("RGB")
        enhanced = ImageOps.autocontrast(rgb, cutoff=1)
        enhanced = enhanced.filter(ImageFilter.DETAIL)
        enhanced_rgba = enhanced.convert("RGBA")
        enhanced_rgba.putalpha(image.split()[3])
        return enhanced_rgba
    except Exception:
        return image


def run_bria_remove(source: Image.Image) -> Image.Image:
    session = get_bria_session()

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


@app.get("/health")
def health():
    return {
        "ok": True,
        "serviceVersion": SERVICE_VERSION,
        "model": "bria-rmbg2",
        "maxPixels": MAX_PIXELS,
    }


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "WiseMelon Dedicated BRIA RMBG-2.0 Service",
        "health": "/health",
        "remove": "/remove",
    }


@app.post("/remove")
async def remove_background(
    image: UploadFile = File(...),
    model: str = Form("bria-rmbg2"),
    authorization: str | None = Header(default=None),
):
    check_auth(authorization)
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Image is required")

    try:
        source = prepare_image(raw)
        enhanced = enhance_contrast_for_model(source)

        # Run model on contrast-enhanced image
        enhanced_result = run_bria_remove(enhanced)
        
        # Extract the alpha channel mask from the enhanced result,
        # but apply it to the original color pixels
        enhanced_a = np.array(enhanced_result.convert("RGBA"), dtype=np.uint8)[..., 3]
        source_rgba = np.array(source.convert("RGBA"), dtype=np.uint8)
        out = source_rgba.copy()
        out[..., 3] = enhanced_a
        result = Image.fromarray(out, "RGBA")

        # Dual-inference boost (also run on original image)
        try:
            if enhanced is not source:
                original_result = run_bria_remove(source)
                original_a = np.array(original_result.convert("RGBA"), dtype=np.uint8)[..., 3]
                result_rgba = np.array(result.convert("RGBA"), dtype=np.uint8)
                combined_a = np.maximum(result_rgba[..., 3], original_a)
                result_rgba[..., 3] = combined_a
                result = Image.fromarray(result_rgba, "RGBA")
        except Exception:
            pass

        output = io.BytesIO()
        result.save(output, format="PNG")
        return Response(
            content=output.getvalue(),
            media_type="image/png",
            headers={"x-bg-removal-model": "bria-rmbg2"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Background removal failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "7860")))
