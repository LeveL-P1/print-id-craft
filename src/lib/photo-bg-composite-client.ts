/**
 * Client-side compositing: AI transparent PNG to solid background JPEG.
 */

import {
  downscaleBlob,
  parseHexColor,
  preloadBgRemovalModel,
  recolorPlainBackgroundOnCanvas,
  removeBackgroundWithBestModel,
  loadImageToCanvas,
} from "@/lib/photo-background"

export const BG_WORK_MAX_DIM = 768
export const BG_JPEG_QUALITY = 0.88

export async function photoUrlToBlob(url: string): Promise<Blob> {
  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store" })
    if (response.ok) return await response.blob()
  } catch { /* fall through */ }

  if (url.startsWith("data:")) {
    const [header, base64] = url.split(",")
    const mimeMatch = header.match(/data:([^;]+)/)
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg"
    const binary = atob(base64)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
    return new Blob([array], { type: mime })
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas unavailable")); return }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Could not read photo"))
      }, "image/jpeg", BG_JPEG_QUALITY)
    }
    img.onerror = () => reject(new Error("Photo load failed"))
    img.src = url
  })
}

export function compositeTransparentOntoColor(
  transparentDataUrl: string,
  bgColor: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const targetRgb = parseHexColor(bgColor) || { r: 255, g: 255, b: 255 }
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas unavailable")); return }

      // Keep soft alpha from the model — hard thresholds and edge erosion cut off fine hair.
      ctx.fillStyle = `rgb(${targetRgb.r},${targetRgb.g},${targetRgb.b})`
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL("image/jpeg", BG_JPEG_QUALITY))
    }
    img.onerror = () => reject(new Error("Transparent image load failed"))
    img.src = transparentDataUrl
  })
}

export type BgProcessProgress = (message: string, percent: number) => void

export async function processPhotoBackgroundLocal(
  photoUrl: string,
  bgColor: string,
  onProgress?: BgProcessProgress
): Promise<{ dataUrl: string; usedAi: boolean }> {
  onProgress?.("Preparing photo…", 5)

  const { canvas, ctx } = await loadImageToCanvas(photoUrl, BG_WORK_MAX_DIM)
  const recolored = recolorPlainBackgroundOnCanvas(ctx, canvas.width, canvas.height, bgColor)
  if (recolored) {
    onProgress?.("Background updated", 100)
    return { dataUrl: canvas.toDataURL("image/jpeg", BG_JPEG_QUALITY), usedAi: false }
  }

  onProgress?.("Loading AI model (first time may take a minute)…", 10)
  await preloadBgRemovalModel()

  let blob = await photoUrlToBlob(photoUrl)
  blob = await downscaleBlob(blob, BG_WORK_MAX_DIM)

  onProgress?.("Removing background with AI…", 25)
  const transparentBlob = await removeBackgroundWithBestModel(blob, (msg, pct) => {
    onProgress?.(msg, 25 + pct * 0.55)
  })

  onProgress?.("Applying background colour…", 85)
  const transparentUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Could not read AI result"))
    reader.readAsDataURL(transparentBlob)
  })

  const dataUrl = await compositeTransparentOntoColor(transparentUrl, bgColor)
  onProgress?.("Done", 100)
  return { dataUrl, usedAi: true }
}
