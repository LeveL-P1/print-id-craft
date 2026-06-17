/**
 * Submit photo background — Poof.bg / remove.bg API passthrough (server-side chain).
 *
 *   cropped photo → POST /api/photo-bg/remove (removebg model)
 *                 → server applies school colour → JPEG
 */

export const SUBMIT_BG_JPEG_QUALITY = 0.88
export const SUBMIT_BG_WORK_MAX_DIM = 768

const REMOVEBG_MODEL = "removebg"
const API_TIMEOUT_MS = 180_000

export type SubmitBgProgress = (message: string, percent: number, previewDataUrl?: string) => void

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

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read processed photo"))
    reader.readAsDataURL(blob)
  })
}

function friendlyApiError(status: number, body: string): string {
  if (status === 503) {
    return "Background removal is not configured — set POOFBG_FREE_API_KEYS, POOFBG_PAID_API_KEY, REMOVEBG_API_KEY, or BG_REMOVAL_SERVICE_URL on the server."
  }
  if (status === 402) {
    return "Background removal credits exhausted — add credits or wait for rembg fallback."
  }
  try {
    const { error } = JSON.parse(body) as { error?: string }
    if (error) return error
  } catch {
    /* use body */
  }
  return body || "Background removal failed"
}

async function callRemoveBg(
  image: Blob,
  bgColor: string,
  onProgress?: SubmitBgProgress
): Promise<Blob> {
  const form = new FormData()
  form.append("image", image, "photo.jpg")
  form.append("bgColor", bgColor)
  form.append("model", REMOVEBG_MODEL)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  const heartbeat = setInterval(() => {
    onProgress?.("Preparing your photo — please wait…", 45)
  }, 10_000)
  try {
    onProgress?.("Removing background...", 25)
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
    clearInterval(heartbeat)
    clearTimeout(timer)
  }
}

export async function processSubmitPhotoBackground(
  photoUrl: string,
  bgColor: string,
  onProgress?: SubmitBgProgress
): Promise<{ dataUrl: string; usedAi: boolean }> {
  onProgress?.("Preparing photo...", 5)

  const result = await callRemoveBg(await photoUrlToBlob(photoUrl), bgColor, onProgress)
  const dataUrl = await blobToDataUrl(result)

  onProgress?.("Done", 100, dataUrl)
  return { dataUrl, usedAi: true }
}