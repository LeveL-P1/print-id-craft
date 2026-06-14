/**
 * Client-side compositing: AI transparent PNG to solid background JPEG.
 */

import {
  analyzeEdgeBackground,
  canUseFastRecolorOnly,
  cleanupBackgroundArtifacts,
  downscaleBlob,
  measureEdgeBackgroundMatch,
  measureForegroundRatioInTransparentBlob,
  parseHexColor,
  preloadBgRemovalModel,
  recolorPlainBackgroundOnCanvas,
  removeBackgroundWithBestModel,
  loadImageToCanvas,
} from "@/lib/photo-background"

export const BG_WORK_MAX_DIM = 768
export const BG_JPEG_QUALITY = 0.88

const MIN_FOREGROUND_RATIO = 0.06
const MIN_EDGE_MATCH_PERCENT = 72
const BG_ALPHA_CUTOFF = 48

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

      ctx.drawImage(img, 0, 0)
      const src = ctx.getImageData(0, 0, w, h)
      const out = ctx.createImageData(w, h)
      const { r: tr, g: tg, b: tb } = targetRgb

      for (let i = 0; i < src.data.length; i += 4) {
        const sr = src.data[i]
        const sg = src.data[i + 1]
        const sb = src.data[i + 2]
        const sa = src.data[i + 3]

        if (sa < BG_ALPHA_CUTOFF) {
          out.data[i] = tr
          out.data[i + 1] = tg
          out.data[i + 2] = tb
          out.data[i + 3] = 255
          continue
        }

        const isWhiteFringe = sr > 210 && sg > 210 && sb > 210 && sa < 200
        if (isWhiteFringe) {
          const a = Math.min(sa / 255, 0.3)
          out.data[i] = Math.round(sr * a + tr * (1 - a))
          out.data[i + 1] = Math.round(sg * a + tg * (1 - a))
          out.data[i + 2] = Math.round(sb * a + tb * (1 - a))
          out.data[i + 3] = 255
          continue
        }

        if (sa >= 245) {
          out.data[i] = sr
          out.data[i + 1] = sg
          out.data[i + 2] = sb
          out.data[i + 3] = 255
          continue
        }

        const a = sa / 255
        out.data[i] = Math.round(sr * a + tr * (1 - a))
        out.data[i + 1] = Math.round(sg * a + tg * (1 - a))
        out.data[i + 2] = Math.round(sb * a + tb * (1 - a))
        out.data[i + 3] = 255
      }

      ctx.putImageData(out, 0, 0)
      cleanupBackgroundArtifacts(ctx, w, h, bgColor)
      resolve(canvas.toDataURL("image/jpeg", BG_JPEG_QUALITY))
    }
    img.onerror = () => reject(new Error("Transparent image load failed"))
    img.src = transparentDataUrl
  })
}

export type BgProcessProgress = (message: string, percent: number) => void

function finalizeCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  bgColor: string
): string {
  cleanupBackgroundArtifacts(ctx, canvas.width, canvas.height, bgColor)
  return canvas.toDataURL("image/jpeg", BG_JPEG_QUALITY)
}

export async function processPhotoBackgroundLocal(
  photoUrl: string,
  bgColor: string,
  onProgress?: BgProcessProgress
): Promise<{ dataUrl: string; usedAi: boolean }> {
  onProgress?.("Preparing photo…", 5)

  const { canvas, ctx } = await loadImageToCanvas(photoUrl, BG_WORK_MAX_DIM)
  const edgeBg = analyzeEdgeBackground(ctx, canvas.width, canvas.height)

  if (canUseFastRecolorOnly(edgeBg, bgColor)) {
    const recolored = recolorPlainBackgroundOnCanvas(ctx, canvas.width, canvas.height, bgColor)
    if (recolored) {
      const edgeMatch = measureEdgeBackgroundMatch(ctx, canvas.width, canvas.height, bgColor)
      if (edgeMatch >= MIN_EDGE_MATCH_PERCENT) {
        onProgress?.("Background updated", 100)
        return { dataUrl: finalizeCanvasToDataUrl(canvas, ctx, bgColor), usedAi: false }
      }
    }
  }

  onProgress?.("Loading AI model (first time may take a minute)…", 10)
  await preloadBgRemovalModel()

  let blob = await photoUrlToBlob(photoUrl)
  blob = await downscaleBlob(blob, BG_WORK_MAX_DIM)

  onProgress?.("Removing background with AI…", 25)
  const transparentBlob = await removeBackgroundWithBestModel(blob, (msg, pct) => {
    onProgress?.(msg, 25 + pct * 0.55)
  })

  const fgRatio = await measureForegroundRatioInTransparentBlob(transparentBlob)
  if (fgRatio < MIN_FOREGROUND_RATIO) {
    throw new Error("Background removal failed — could not detect the student in the photo")
  }

  onProgress?.("Applying background colour…", 85)
  const transparentUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Could not read AI result"))
    reader.readAsDataURL(transparentBlob)
  })

  let dataUrl = await compositeTransparentOntoColor(transparentUrl, bgColor)

  const checkCanvas = document.createElement("canvas")
  const checkImg = new Image()
  await new Promise<void>((resolve, reject) => {
    checkImg.onload = () => resolve()
    checkImg.onerror = () => reject(new Error("Could not verify processed photo"))
    checkImg.src = dataUrl
  })
  checkCanvas.width = checkImg.naturalWidth
  checkCanvas.height = checkImg.naturalHeight
  const checkCtx = checkCanvas.getContext("2d")
  if (checkCtx) {
    checkCtx.drawImage(checkImg, 0, 0)
    const edgeMatch = measureEdgeBackgroundMatch(checkCtx, checkCanvas.width, checkCanvas.height, bgColor)
    if (edgeMatch < MIN_EDGE_MATCH_PERCENT) {
      cleanupBackgroundArtifacts(checkCtx, checkCanvas.width, checkCanvas.height, bgColor)
      dataUrl = checkCanvas.toDataURL("image/jpeg", BG_JPEG_QUALITY)
    }
  }

  onProgress?.("Done", 100)
  return { dataUrl, usedAi: true }
}
