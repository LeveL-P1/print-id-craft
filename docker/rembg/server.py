"""Self-hosted rembg HTTP service for WiseMelon."""

import os
from functools import lru_cache

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from rembg import new_session, remove


MAX_FILE_SIZE = 10 * 1024 * 1024
MODEL_NAME = os.environ.get("REMBG_MODEL", "u2net_human_seg")

app = FastAPI(title="WiseMelon rembg")


@lru_cache(maxsize=1)
def get_session():
    return new_session(MODEL_NAME)


@app.get("/")
def root():
    return {"ok": True, "service": "wisemelon-rembg"}


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.post("/api/remove")
async def remove_bg(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="No file provided")
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")

    output = remove(data, session=get_session())
    return Response(content=output, media_type="image/png")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "7000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
