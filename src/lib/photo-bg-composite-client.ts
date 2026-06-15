/**
 * Client-side compositing: AI transparent PNG → plain selected background JPEG.
 * Uses one unified finish pipeline for every photo (hair, shirts, boys, girls).
 *
 * Supports two models:
 *   "birefnet" → server-side BiRefNet (HuggingFace) → transparent mask → client composite
 *   "isnet"    → local @imgly/background-removal (offline/desktop fallback)
 */

import {
  analyzeEdgeBackground,
  canUseFastRecolorOnly,
  cleanupBackgroundArtifacts,
  downscaleBlob,
  finalizePlainBackgroundFromMaskBlobs,
  measureEdgeBackgroundMatch,
  measureForegroundRatioInTransparentBlob,
  preloadBgRemovalModel,
  recolorPlainBackgroundOnCanvas,
  removeBackgroundWithBestModel,
  loadImageToCanvas,
  scorePlainBackgroundFromMaskBlobs,
} from "@/lib/photo-background"

export type BgModelChoice = "gemini" | "isnet" | "birefnet" | "bria-rmbg2"

export const BG_WORK_MAX_DIM = 1024
export const BG_JPEG_QUALITY = 0.88

const MIN_FOREGROUND_RATIO = 0.06
const MIN_EDGE_MATCH_PERCENT = 72
const MIN_FINISHED_QUALITY_SCORE = 68
const MAX_SUBJECT_BACKGROUND_LEAK_PERCENT = 12

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

/** @deprecated Use processPhotoBackgroundLocal — kept for any direct imports */
export async function compositeTransparentOntoColor(
  transparentDataUrl: string,
  bgColor: string,
  originalDataUrl?: string
): Promise<string> {
  const maskBlob = await photoUrlToBlob(transparentDataUrl)
  const originalBlob = originalDataUrl
    ? await photoUrlToBlob(originalDataUrl)
    : maskBlob
  return finalizePlainBackgroundFromMaskBlobs(originalBlob, maskBlob, bgColor, BG_JPEG_QUALITY)
}

export type BgProcessProgress = (message: string, percent: number, previewDataUrl?: string) => void

function finalizeCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  bgColor: string
): string {
  cleanupBackgroundArtifacts(ctx, canvas.width, canvas.height, bgColor)
  return canvas.toDataURL("image/jpeg", BG_JPEG_QUALITY)
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side model calls
// ─────────────────────────────────────────────────────────────────────────────

const SERVER_REMOVE_TIMEOUT_MS = 280_000

/**
 * Call the server-side background removal endpoint.
 * Returns a transparent mask blob.
 */
async function removeBackgroundWithServerModel(blob: Blob, bgColor: string, model: string): Promise<Blob> {
  const form = new FormData()
  form.append("image", blob, "photo.jpg")
  form.append("bgColor", bgColor)
  form.append("model", model)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SERVER_REMOVE_TIMEOUT_MS)
  const response = await fetch("/api/photo-bg/remove", {
    method: "POST",
    body: form,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))

  if (response.status === 503) {
    throw new Error("Background AI service is not configured — set BG_REMOVAL_SERVICE_URL")
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(detail || "Professional background service unavailable")
  }

  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const json = await response.json()
    const dataUrl = json?.dataUrl || json?.image || ""
    if (!dataUrl) throw new Error("Professional background service returned no image")
    return photoUrlToBlob(dataUrl)
  }

  return response.blob()
}

/**
 * Call the server-side Gemini endpoint.
 * Returns a fully composited image (student on colored background) as a data URL.
 */
async function removeBackgroundWithServerGemini(
  blob: Blob,
  bgColor: string
): Promise<string> {
  const form = new FormData()
  form.append("image", blob, "photo.jpg")
  form.append("bgColor", bgColor)
  form.append("model", "gemini")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SERVER_REMOVE_TIMEOUT_MS)
  const response = await fetch("/api/photo-bg/remove", {
    method: "POST",
    body: form,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))

  if (response.status === 503) {
    throw new Error("Google AI is not configured — set GEMINI_API_KEY")
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: "" }))
    throw new Error(detail?.error || "Google AI background removal failed")
  }

  // Gemini returns the fully composited image — convert to data URL
  const resultBlob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Failed to read Gemini result"))
    reader.readAsDataURL(resultBlob)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mask obtainment — model-aware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtain the best AI result using the specified model.
 * Returns a transparent mask blob for client-side compositing.
 */
async function obtainBestAiResult(
  workBlob: Blob,
  bgColor: string,
  model: BgModelChoice,
  onProgress?: BgProcessProgress
): Promise<{ type: "composited"; dataUrl: string } | { type: "mask"; maskBlob: Blob }> {

  // ── Gemini: fully composited image from server ────────────────────────
  if (model === "gemini") {
    onProgress?.("Sending to Google AI…", 18)
    try {
      const dataUrl = await removeBackgroundWithServerGemini(workBlob, bgColor)
      onProgress?.("Google AI processing complete", 90)
      return { type: "composited", dataUrl }
    } catch (err) {
      console.error("[obtainBestAiResult] Gemini failed:", err)
      // Fall through to local ISNet as ultimate fallback
      onProgress?.("Google AI unavailable, using local model…", 50)
    }
  }

  // ── Server-based mask models (BiRefNet / BRIA) ────────────────────────────
  if (model === "birefnet" || model === "bria-rmbg2" || model === "gemini") {
    const targetModel = model === "bria-rmbg2" ? "bria-rmbg2" : "birefnet-portrait"
    onProgress?.(`Trying professional model (${model === "bria-rmbg2" ? "BRIA" : "BiRefNet"})…`, 18)
    try {
      const remoteMask = await removeBackgroundWithServerModel(workBlob, bgColor, targetModel)
      const remoteFg = await measureForegroundRatioInTransparentBlob(remoteMask)
      if (remoteFg >= MIN_FOREGROUND_RATIO) {
        onProgress?.("Professional model ready", 82)
        return { type: "mask", maskBlob: remoteMask }
      }
    } catch (err: unknown) {
      console.warn(`Server model ${targetModel} failed:`, err)
      /* fall back to local model below */
    }
  }

  // ── ISNet: local browser model ────────────────────────────────────────
  onProgress?.("Loading local AI model (first use ~170MB)…", 55)
  await preloadBgRemovalModel()

  onProgress?.("Removing background with local AI…", 60)
  const localMask = await removeBackgroundWithBestModel(workBlob, (msg, pct) => {
    onProgress?.(msg, 60 + pct * 0.2)
  })

  const localFg = await measureForegroundRatioInTransparentBlob(localMask)
  if (localFg < MIN_FOREGROUND_RATIO) {
    throw new Error("Background removal failed — could not detect the student in the photo")
  }

  onProgress?.("Using local AI result", 82)
  return { type: "mask", maskBlob: localMask }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main processing function
// ─────────────────────────────────────────────────────────────────────────────

export async function processPhotoBackgroundLocal(
  photoUrl: string,
  bgColor: string,
  onProgress?: BgProcessProgress,
  /** Which AI model to use. Defaults to "birefnet". */
  model: BgModelChoice = "birefnet",
  forceAi: boolean = false
): Promise<{ dataUrl: string; maskUrl: string | null; usedAi: boolean }> {
  onProgress?.("Preparing photo…", 5)

  const { canvas, ctx } = await loadImageToCanvas(photoUrl, BG_WORK_MAX_DIM)
  const edgeBg = analyzeEdgeBackground(ctx, canvas.width, canvas.height)

  if (!forceAi && canUseFastRecolorOnly(edgeBg, bgColor)) {
    const recolored = recolorPlainBackgroundOnCanvas(ctx, canvas.width, canvas.height, bgColor)
    if (recolored) {
      const edgeMatch = measureEdgeBackgroundMatch(ctx, canvas.width, canvas.height, bgColor)
      if (edgeMatch >= MIN_EDGE_MATCH_PERCENT) {
        const dataUrl = finalizeCanvasToDataUrl(canvas, ctx, bgColor)
        onProgress?.("Background updated", 100, dataUrl)
        return { dataUrl, maskUrl: null, usedAi: false }
      }
    }
  }

  onProgress?.("Preparing photo for AI…", 10)
  let workBlob = await photoUrlToBlob(photoUrl)
  workBlob = await downscaleBlob(workBlob, BG_WORK_MAX_DIM)

  const aiResult = await obtainBestAiResult(workBlob, bgColor, model, onProgress)

  // ── Gemini returns a fully composited image — no further processing ──
  if (aiResult.type === "composited") {
    onProgress?.("Done", 100)
    return { dataUrl: aiResult.dataUrl, maskUrl: null, usedAi: true }
  }

  // ── Mask-based models (BiRefNet, ISNet) need client-side compositing ──
  const maskBlob = aiResult.maskBlob

  onProgress?.("Building AI preview…", 83)
  const livePreview = await finalizePlainBackgroundFromMaskBlobs(
    workBlob,
    maskBlob,
    bgColor,
    BG_JPEG_QUALITY
  )
  onProgress?.("AI preview ready", 85, livePreview)

  onProgress?.("Checking AI photo quality…", 88)
  const quality = await scorePlainBackgroundFromMaskBlobs(workBlob, maskBlob, bgColor)
  if (
    quality.score < MIN_FINISHED_QUALITY_SCORE ||
    quality.subjectLeaks > MAX_SUBJECT_BACKGROUND_LEAK_PERCENT
  ) {
    throw new Error(
      `AI result needs manual review (quality ${quality.score}/100). Use original photo or try a clearer photo.`
    )
  }

  onProgress?.("Finishing plain background…", 92)
  const dataUrl = await finalizePlainBackgroundFromMaskBlobs(
    workBlob,
    maskBlob,
    bgColor,
    BG_JPEG_QUALITY
  )

  onProgress?.("Done", 100)
  return { dataUrl, maskUrl: URL.createObjectURL(maskBlob), usedAi: true }
}
