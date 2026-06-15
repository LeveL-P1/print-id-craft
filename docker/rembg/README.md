# WiseMelon background removal service

FastAPI service used by `/api/photo-bg/remove` for professional ID photo background removal.

Hugging Face Docker Spaces should listen on port `7860`; the included Dockerfile is already configured for that.

## Recommended model setup

Use the portrait-first model chain for student photos:

```bash
BG_REMOVAL_MODEL=birefnet-portrait
BG_REMOVAL_MODEL_CHAIN=birefnet-portrait,birefnet-general,isnet-general-use,u2net_human_seg
BG_REMOVAL_ALPHA_MATTING=1
BG_REMOVAL_MAX_PIXELS=3600000
```

Why this order:

- `birefnet-portrait`: best first pass for student portraits, hair, shoulders, and uniforms.
- `birefnet-general`: fallback for unusual framing/backgrounds.
- `isnet-general-use`: stable fallback when BiRefNet fails to load/run.
- `u2net_human_seg`: last-resort human segmentation fallback.

## App env

Set one of these in the Next.js app deployment:

```bash
BG_REMOVAL_SERVICE_URL=https://your-background-service.example.com
BG_REMOVAL_SERVICE_TOKEN=your-shared-secret
```

The service itself should use the same `BG_REMOVAL_SERVICE_TOKEN` if you want to protect the endpoint.
