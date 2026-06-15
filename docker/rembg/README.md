---
sdk: docker
app_port: 7860
---

# WiseMelon background removal service

FastAPI service used by `/api/photo-bg/remove` for professional ID photo background removal.

Hugging Face Docker Spaces should listen on port `7860`; the included Dockerfile is already configured for that.

## Recommended model setup

Use the portrait-first model chain for student photos:

```bash
BG_REMOVAL_MODEL=birefnet-portrait
BG_REMOVAL_MODEL_CHAIN=birefnet-portrait,birefnet-general,isnet-general-use,u2net_human_seg
BG_REMOVAL_ALPHA_MATTING=1
BG_REMOVAL_ALPHA_ERODE_SIZE=8
BG_REMOVAL_MERGE_MASK=1
BG_REMOVAL_MERGE_MODEL=u2net_human_seg
BG_REMOVAL_MAX_PIXELS=3600000
```

## Dual-mask merge (hair + shirt holes)

When `BG_REMOVAL_MERGE_MASK=1` (default), every successful primary removal is merged with `u2net_human_seg`:

- **Primary** (`birefnet-portrait`): precise edges, hair strands, shoulders.
- **Merge** (`u2net_human_seg`): generous whole-person silhouette — fills gaps the portrait model punches in hair or light shirts.
- Output RGB comes from the **original photo**; only the alpha channel is merged.

Optional tuning:

```bash
BG_REMOVAL_MERGE_ALPHA_SCALE=0.94
BG_REMOVAL_MERGE_HOLE_PRIMARY_MAX=84
BG_REMOVAL_MERGE_HOLE_SECONDARY_MIN=112
```

Set `BG_REMOVAL_MERGE_MASK=0` to disable merge and use the primary model only.

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
