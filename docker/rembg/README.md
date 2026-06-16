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

## Hugging Face Space setup (baby steps)

Your production Space: **https://teamsasd-wisemelon-bg-removal.hf.space**

1. Open the Space on Hugging Face → **Settings → Repository**
2. Set **Space directory** to `docker/rembg` (if the repo root is `print-id-craft`)
3. Click **Factory rebuild** (restart alone does not pull new code)
4. Wait for build to finish, then open `/health` and confirm:
   - `"serviceVersion": "2026-06-15-merge-v1"`
   - `"mergeMask": true`
   - `"mergeModel": "u2net_human_seg"`
5. In Vercel/Railway (and local `.env`), set:
   ```bash
   BG_REMOVAL_SERVICE_URL=https://teamsasd-wisemelon-bg-removal.hf.space
   ```
6. Redeploy the Next.js app, then visit `/api/photo-bg/health` — should show `"mergeReady": true`

Test the Space from your machine:

```bash
npm run test:bg-service
```

## App env

Set one of these in the Next.js app deployment:

```bash
BG_REMOVAL_SERVICE_URL=https://your-background-service.example.com
BG_REMOVAL_SERVICE_TOKEN=your-shared-secret
```

The service itself should use the same `BG_REMOVAL_SERVICE_TOKEN` if you want to protect the endpoint.

## rembg version

Uses **[rembg v2.0.76](https://github.com/danielgatis/rembg)** (latest). Rebuild the Space after pulling this change so models reload.

Submit-form fallback (when Remove.bg / Poof.bg fail) tries models in order:

1. **`inspyrenet`** — InSPyReNet via [transparent-background](https://github.com/plemeri/transparent-background) (best free quality)
2. **`isnet-general-use`** — rembg ISNet fallback

Override the chain:

```bash
BG_REMOVAL_SUBMIT_FALLBACK_MODELS=inspyrenet,isnet-general-use
```

InSPyReNet tuning (on the HF Space):

```bash
INSPYRENET_DEVICE=cpu          # or cuda:0 on GPU Spaces
INSPYRENET_MODE=base           # base | fast | base-nightly
INSPYRENET_JIT=0               # 1 to enable torchscript JIT (slower init, faster infer)
```

After deploy, `/health` should show `"inspyrenetAvailable": true`.

## remove.bg-compatible API (self-hosted, no per-photo fees)

The same service exposes **`POST /v1.0/removebg`** — a drop-in replacement for the official remove.bg API using open-source models (BiRefNet-portrait + u2net merge). See [`../removebg-replica/README.md`](../removebg-replica/README.md).

Point the Next.js app at your Space instead of paying remove.bg:

```bash
REMOVEBG_API_URL=https://teamsasd-wisemelon-bg-removal.hf.space/v1.0/removebg
BG_REMOVAL_SERVICE_TOKEN=your-shared-secret
# Unset REMOVEBG_API_KEY to use the replica
```

After deploy, `/health` should include `"removebgCompatible": true`.
