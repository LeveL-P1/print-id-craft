/**
 * Client for a self-hosted rembg HTTP service.
 * Set REMBG_SERVICE_URL (e.g. http://localhost:7000) in env.
 * See docker/rembg/ for a ready-to-run container.
 */

export function isRembgConfigured(): boolean {
  return Boolean(process.env.REMBG_SERVICE_URL?.trim())
}

export async function removeBackgroundRembg(imageBuffer: Buffer): Promise<Buffer> {
  const base = process.env.REMBG_SERVICE_URL?.trim().replace(/\/$/, "")
  if (!base) {
    throw new Error("REMBG_SERVICE_URL is not configured")
  }

  const form = new FormData()
  form.append("file", new Blob([imageBuffer], { type: "image/jpeg" }), "photo.jpg")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)

  try {
    const res = await fetch(`${base}/api/remove`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      throw new Error(`rembg service failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`)
    }
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timeout)
  }
}
