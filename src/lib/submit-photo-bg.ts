/**
 * Submit-form photo background — free BiRefNet portrait (rembg service).
 * Closest free alternative to Remove.bg for school ID portraits.
 * Uses simple canvas compositing only (no custom mask heuristics).
 */

export const SUBMIT_BG_JPEG_QUALITY = 0.88
export const SUBMIT_BG_WORK_MAX_DIM = 768

/** Best free portrait model — BiRefNet portrait via rembg FastAPI (HF Space). */
const SUBMIT_BG_MODEL = "birefnet-portrait"
const SERVER_REMOVE_TIMEOUT_MS = 280_000

export type SubmitBgProgress = (message: string, percent: number, previewDataUrl?: string) => void

/** Wake the HF rembg Space while the parent is cropping (best-effort). */
export async function preloadSubmitBgService(): Promise<void> {
  try {
    await fetch("/api/photo-bg/health", { cache: "no-store" })
  } catch {
    /* ignore — remove step will retry wake */
  }
}

function parseRemoveApiError(status: number, detail: string): string {
  if (status === 503) {
    return "Background removal is not configured on the server."
  }
  if (status === 502 || status === 504 || detail.includes("failed to respond")) {
    return "Background removal server is waking up — wait 1–2 minutes and tap Retry."
  }
  try {
    const outer = JSON.parse(detail) as { error?: string }
    if (typeof outer.error === "string") {
      if (outer.error.includes("failed to respond") || outer.error.includes('"code":502')) {
        return "Background removal server is waking up — wait 1–2 minutes and tap Retry."
      }
      try {
        const inner = JSON.parse(outer.error) as { message?: string }
        if (inner.message) return inner.message
      } catch {
        return outer.error
      }
    }
  } catch {
    /* use raw detail */
  }
  return detail || "Background removal failed"
}

async function photoUrlToBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    const [header, base64] = url.split(",")
    const mimeMatch = header.match(/data:([^;]+)/)
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg"
    const binary = atob(base64)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
    return new Blob([array], { type: mime })
  }

  const response = await fetch(url, { credentials: "include", cache: "no-store" })
  if (!response.ok) throw new Error("Could not read photo")
  return response.blob()
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load photo"))
    img.src = url
  })
}

/** Plain alpha composite: solid school colour + transparent cutout on top. */
async function compositeCutoutOntoColor(
  cutoutBlob: Blob,
  bgColor: string,
  jpegQuality: number
): Promise<string> {
  const objectUrl = URL.createObjectURL(cutoutBlob)
  try {
    const img = await loadImage(objectUrl)
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas unavailable")

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", jpegQuality)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function removeBackgroundWithService(blob: Blob, bgColor: string): Promise<Blob> {
  const form = new FormData()
  form.append("image", blob, "photo.jpg")
  form.append("bgColor", bgColor)
  form.append("model", SUBMIT_BG_MODEL)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SERVER_REMOVE_TIMEOUT_MS)

  try {
    const response = await fetch("/api/photo-bg/remove", {
      method: "POST",
      body: form,
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(parseRemoveApiError(response.status, detail))
    }

    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const json = await response.json()
      const dataUrl = json?.dataUrl || json?.image || ""
      if (!dataUrl) throw new Error("Background removal returned no image")
      return photoUrlToBlob(dataUrl)
    }

    return response.blob()
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

  const workBlob = await photoUrlToBlob(photoUrl)

  onProgress?.("Waking background removal server...", 12)
  await preloadSubmitBgService()

  onProgress?.("Removing background (BiRefNet)...", 25)
  const cutoutBlob = await removeBackgroundWithService(workBlob, bgColor)

  onProgress?.("Applying school colour...", 85)
  const dataUrl = await compositeCutoutOntoColor(cutoutBlob, bgColor, SUBMIT_BG_JPEG_QUALITY)

  onProgress?.("Done", 100, dataUrl)
  return { dataUrl, usedAi: true }
}