# Self-hosted rembg for WiseMelon

This service runs a small FastAPI wrapper around `rembg` for AI photo background removal.
The main Next.js app calls this service through `REMBG_SERVICE_URL`.

## Local Docker

```powershell
cd docker/rembg
docker compose up -d --build
```

Local service URL:

```text
http://localhost:7000
```

Health check:

```text
http://localhost:7000/health
```

Add this to the main app `.env` for local development:

```env
REMBG_SERVICE_URL=http://localhost:7000
```

Restart the Next.js app after changing `.env`.

## Railway Deployment

1. Create a Railway account.
2. Create a new Railway project from the GitHub repo.
3. Leave the Railway service root directory empty.
4. Railway will use the root `railway.json`, which points to the root `Dockerfile`.
5. Generate a public domain for the service.
6. Open:

```text
https://your-railway-domain/health
```

It should return:

```json
{"ok":true}
```

7. In Vercel, add this environment variable to the main app:

```env
REMBG_SERVICE_URL=https://your-railway-domain
```

8. Redeploy the Vercel app.

## API

- `GET /health` checks whether the service is running.
- `POST /api/remove` accepts a multipart file field named `file` and returns a transparent PNG.

## Notes

- Vercel should host the main Next.js app.
- Railway or another container host should host this rembg service.
- Background removal is CPU/RAM-heavy. For large batches, prefer at least 2 GB RAM.
