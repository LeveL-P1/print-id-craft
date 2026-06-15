/**
 * Submit photo background — rembg only (FastAPI on HF Space).
 *
 *   cropped photo → POST /api/photo-bg/remove → transparent PNG
 *                 → fill school colour on canvas → JPEG
 *
 * No Remove.bg, no browser models, no custom mask pipeline.
 */

export const SUBMIT_BG_JPEG_QUALITY = 0.88
export const SUBMIT_BG_WORK_MAX_DIM = 768

const REMBG_MODEL = "birefnet-portrait"
const API_TIMEOUT_MS = 280_000

export type SubmitBgProgress = (message: string, percent: number, previewDataUrl?: string) => void

/** Wake HF Space while parent crops (best-effort). */
export async function preloadSubmitBgService(): Promise<void> {
  try {
    await fetch("/api/photo-bg/health", { cache: "no-store" })
  } catch {
    /* ignore */
  }
}

async function photoUrlToBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    const [header, base64] = url.split(",")
    const mime = header.match(/data:([^;]+)/)?.[1] || "image/jpeg"
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  const res = await fetch(url, { credentials: "include", cache: "no-store" })
  if (!res.ok) throw new Error("Could not read photo")
  return res.blob()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load processed photo"))
    img.src = src
  })
}

async function compositeOntoColour(cutout: Blob, bgColor: string, quality: number): Promise<string> {
  const url = URL.createObjectURL(cutout)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas unavailable")
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL("image/jpeg", quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function friendlyApiError(status: number, body: string): string {
  if (status === 503) return "rembg service is not configured (BG_REMOVAL_SERVICE_URL)."
  if (status === 502 || status === 504 || body.includes("failed to respond")) {
    return "rembg server is waking up — wait 1–2 minutes and tap Retry."
  }
  try {
    const { error } = JSON.parse(body) as { error?: string }
    if (error?.includes("failed to respond")) {
      return "rembg server is waking up — wait 1–2 minutes and tap Retry."
    }
    if (error) return error
  } catch {
    /* use body */
  }
  return body || "rembg background removal failed"
}

async function callRembg(image: Blob): Promise<Blob> {
  const form = new FormData()
  form.append("image", image, "photo.jpg")
  form.append("model", REMBG_MODEL)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const res = await fetch("/api/photo-bg/remove", {
      method: "POST",
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(friendlyApiError(res.status, await res.text().catch(() => "")))
    }
    return res.blob()
  } finally {
    clearTimeout(timer)
  }
}

export async function processSubmitPhotoBackground(
  photoUrl: string,
  bgColor: string,
  onProgress?: SubmitBgProgress
): Promise<{ dataUrl: string; usedAi: boolean }> {
  onProgress?.("Preparing photo...", 5)
  await preloadSubmitBgService()

  onProgress?.("Removing background (rembg)...", 20)
  const cutout = await callRembg(await photoUrlToBlob(photoUrl))

  onProgress?.("Applying school colour...", 85)
  const dataUrl = await compositeOntoColour(cutout, bgColor, SUBMIT_BG_JPEG_QUALITY)

  onProgress?.("Done", 100, dataUrl)
  return { dataUrl, usedAi: true }
}