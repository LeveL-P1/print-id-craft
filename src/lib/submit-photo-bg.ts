/**
 * Submit-form photo background — Remove.bg API only.
 * Transparent PNG from server → client compositing → school-colour JPEG.
 */

import {
  analyzeEdgeBackground,
  canUseFastRecolorOnly,
  cleanupBackgroundArtifacts,
  downscaleBlob,
  finalizePlainBackgroundFromMaskBlobs,
  loadImageToCanvas,
  measureEdgeBackgroundMatch,
  measureForegroundRatioInTransparentBlob,
  recolorPlainBackgroundOnCanvas,
  scorePlainBackgroundFromMaskBlobs,
} from "@/lib/photo-background"

export const SUBMIT_BG_JPEG_QUALITY = 0.88
export const SUBMIT_BG_WORK_MAX_DIM = 768

const REMOVEBG_MODEL = "removebg"
const SERVER_REMOVE_TIMEOUT_MS = 280_000
const MIN_FOREGROUND_RATIO = 0.06
const MIN_EDGE_MATCH_PERCENT = 72
const MIN_FINISHED_QUALITY_SCORE = 68
const MAX_SUBJECT_BACKGROUND_LEAK_PERCENT = 12

export type SubmitBgProgress = (message: string, percent: number, previewDataUrl?: string) => void

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

async function removeBackgroundWithRemoveBg(blob: Blob, bgColor: string): Promise<Blob> {
  const form = new FormData()
  form.append("image", blob, "photo.jpg")
  form.append("bgColor", bgColor)
  form.append("model", REMOVEBG_MODEL)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SERVER_REMOVE_TIMEOUT_MS)

  try {
    const response = await fetch("/api/photo-bg/remove", {
      method: "POST",
      body: form,
      signal: controller.signal,
    })

    if (response.status === 503) {
      throw new Error("Remove.bg is not configured — set REMOVEBG_API_KEY on the server")
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(detail || "Remove.bg background removal failed")
    }

    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const json = await response.json()
      const dataUrl = json?.dataUrl || json?.image || ""
      if (!dataUrl) throw new Error("Remove.bg returned no image")
      return photoUrlToBlob(dataUrl)
    }

    return response.blob()
  } finally {
    clearTimeout(timer)
  }
}

function finalizeCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  bgColor: string
): string {
  cleanupBackgroundArtifacts(ctx, canvas.width, canvas.height, bgColor)
  return canvas.toDataURL("image/jpeg", SUBMIT_BG_JPEG_QUALITY)
}

export async function processSubmitPhotoBackground(
  photoUrl: string,
  bgColor: string,
  onProgress?: SubmitBgProgress
): Promise<{ dataUrl: string; usedAi: boolean }> {
  onProgress?.("Preparing photo...", 5)

  const { canvas, ctx } = await loadImageToCanvas(photoUrl, SUBMIT_BG_WORK_MAX_DIM)
  const edgeBg = analyzeEdgeBackground(ctx, canvas.width, canvas.height)

  if (canUseFastRecolorOnly(edgeBg, bgColor)) {
    const recolored = recolorPlainBackgroundOnCanvas(ctx, canvas.width, canvas.height, bgColor)
    if (recolored) {
      const edgeMatch = measureEdgeBackgroundMatch(ctx, canvas.width, canvas.height, bgColor)
      if (edgeMatch >= MIN_EDGE_MATCH_PERCENT) {
        const dataUrl = finalizeCanvasToDataUrl(canvas, ctx, bgColor)
        onProgress?.("Background updated", 100, dataUrl)
        return { dataUrl, usedAi: false }
      }
    }
  }

  onProgress?.("Sending to Remove.bg...", 12)
  let workBlob = await photoUrlToBlob(photoUrl)
  workBlob = await downscaleBlob(workBlob, SUBMIT_BG_WORK_MAX_DIM)

  onProgress?.("Removing background (Remove.bg)...", 22)
  const maskBlob = await removeBackgroundWithRemoveBg(workBlob, bgColor)

  const fgRatio = await measureForegroundRatioInTransparentBlob(maskBlob)
  if (fgRatio < MIN_FOREGROUND_RATIO) {
    throw new Error("Could not detect the student clearly in the photo")
  }

  onProgress?.("Applying school background colour...", 78)
  const livePreview = await finalizePlainBackgroundFromMaskBlobs(
    workBlob,
    maskBlob,
    bgColor,
    SUBMIT_BG_JPEG_QUALITY,
    "removebg"
  )
  onProgress?.("Preview ready", 85, livePreview)

  onProgress?.("Checking photo quality...", 88)
  const quality = await scorePlainBackgroundFromMaskBlobs(workBlob, maskBlob, bgColor, "removebg")
  if (
    quality.score < MIN_FINISHED_QUALITY_SCORE ||
    quality.subjectLeaks > MAX_SUBJECT_BACKGROUND_LEAK_PERCENT
  ) {
    throw new Error(
      `Photo needs manual review (quality ${quality.score}/100). Use your original photo or try a clearer picture.`
    )
  }

  onProgress?.("Finishing...", 94)
  const dataUrl = await finalizePlainBackgroundFromMaskBlobs(
    workBlob,
    maskBlob,
    bgColor,
    SUBMIT_BG_JPEG_QUALITY,
    "removebg"
  )

  onProgress?.("Done", 100, dataUrl)
  return { dataUrl, usedAi: true }
}