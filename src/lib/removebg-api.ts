/**
 * remove.bg API — server-side only (never expose REMOVEBG_API_KEY to the browser).
 *
 * Submit fallback chain:
 *   1. Remove.bg (or REMOVEBG_API_URL replica)
 *   2. Poof.bg when remove.bg credits run out
 *   3. rembg + InSPyReNet, then isnet-general-use (BG_REMOVAL_SERVICE_URL)
 *
 * @see https://www.remove.bg/api
 * @see https://github.com/danielgatis/rembg
 * @see docker/removebg-replica/README.md
 */

import {
  configuredBgRemovalServiceUrl,
  formatBgServiceError,
  removeBackgroundViaService,
} from "@/lib/bg-removal-service"

const POOFBG_API_URL = "https://api.poof.bg/v1/remove"
const REMBG_SUBMIT_FALLBACK_MODELS = (
  process.env.BG_REMOVAL_SUBMIT_FALLBACK_MODELS || "inspyrenet,isnet-general-use"
)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)

export type SubmitBgProvider = "removebg" | "poofbg" | "rembg-inspyrenet" | "rembg-isnet"

export function isPoofBgConfigured(): boolean {
  return !!process.env.POOFBG_API_KEY?.trim()
}

function poofBgColorValue(bgColor?: string): string | undefined {
  const hex = normalizeBgColorHex(bgColor)
  return hex ? `#${hex}` : undefined
}

export async function removeBackgroundWithPoofBg(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<Buffer> {
  const apiKey = process.env.POOFBG_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("POOFBG_API_KEY is not configured")
  }

  const bg = poofBgColorValue(bgColor)

  const form = new FormData()
  form.append(
    "image_file",
    new Blob([new Uint8Array(buffer)], { type: contentType || "image/jpeg" }),
    fileName || "photo.jpg"
  )
  form.append("size", "auto")
  form.append("crop", "false")
  if (bg) {
    form.append("format", "jpg")
    form.append("channels", "rgb")
    form.append("bg_color", bg)
  } else {
    form.append("format", "png")
    form.append("channels", "rgba")
  }

  const response = await fetch(POOFBG_API_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  })

  if (!response.ok) {
    let detail = await response.text().catch(() => "")
    try {
      const json = JSON.parse(detail) as { error?: { message?: string }; message?: string }
      detail = json.error?.message || json.message || detail
    } catch {
      /* use raw text */
    }
    const err = new Error(detail || `Poof.bg failed (${response.status})`) as Error & {
      status?: number
    }
    err.status = response.status
    throw err
  }

  return Buffer.from(await response.arrayBuffer())
}

export function isRemoveBgConfigured(): boolean {
  if (process.env.REMOVEBG_API_URL?.trim()) return true
  return !!process.env.REMOVEBG_API_KEY?.trim()
}

export function isRembgFallbackConfigured(): boolean {
  return !!configuredBgRemovalServiceUrl()
}

/** True when submit flow can run (paid APIs and/or rembg service). */
export function isSubmitPhotoBgConfigured(): boolean {
  return isRemoveBgConfigured() || isPoofBgConfigured() || isRembgFallbackConfigured()
}

function getErrorStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    return Number((error as { status?: number }).status) || 0
  }
  return 0
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isPaidApiCreditsExhausted(status: number, detail: string): boolean {
  if (status === 402) return true
  const lower = detail.toLowerCase()
  return (
    lower.includes("credit") &&
    (lower.includes("exhaust") ||
      lower.includes("insufficient") ||
      lower.includes("not enough") ||
      lower.includes("limit") ||
      lower.includes("payment_required"))
  )
}

function usesOfficialRemoveBg(): boolean {
  return !!process.env.REMOVEBG_API_KEY?.trim() && !process.env.REMOVEBG_API_URL?.trim()
}

function isRemoveBgCreditsExhausted(status: number, detail: string): boolean {
  return isPaidApiCreditsExhausted(status, detail)
}

function normalizeBgColorHex(bgColor?: string): string | undefined {
  const hex = bgColor?.replace(/^#/, "").trim()
  return hex && /^[0-9a-fA-F]{3,8}$/.test(hex) ? hex : undefined
}

function removeBgApiUrl(): string {
  return (
    process.env.REMOVEBG_API_URL?.trim() || "https://api.remove.bg/v1.0/removebg"
  ).replace(/\/+$/, "")
}

function removeBgRequestHeaders(): HeadersInit {
  const apiKey = process.env.REMOVEBG_API_KEY?.trim()
  if (apiKey) {
    return { "X-Api-Key": apiKey }
  }

  const serviceToken = process.env.BG_REMOVAL_SERVICE_TOKEN?.trim()
  if (serviceToken && process.env.REMOVEBG_API_URL?.trim()) {
    return { Authorization: `Bearer ${serviceToken}` }
  }

  return {}
}

export async function removeBackgroundWithRemoveBg(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<Buffer> {
  const usingLocalReplica = !!process.env.REMOVEBG_API_URL?.trim()
  const apiKey = process.env.REMOVEBG_API_KEY?.trim()
  if (!usingLocalReplica && !apiKey) {
    throw new Error("REMOVEBG_API_KEY is not configured")
  }

  const bgHex = normalizeBgColorHex(bgColor)

  const form = new FormData()
  form.append(
    "image_file",
    new Blob([new Uint8Array(buffer)], { type: contentType || "image/jpeg" }),
    fileName || "photo.jpg"
  )
  form.append("size", "auto")
  form.append("format", bgHex ? "jpg" : "png")
  form.append("type", "person")
  form.append("crop", "false")
  if (bgHex) {
    form.append("bg_color", bgHex)
  }

  const response = await fetch(removeBgApiUrl(), {
    method: "POST",
    headers: removeBgRequestHeaders(),
    body: form,
  })

  if (!response.ok) {
    let detail = await response.text().catch(() => "")
    try {
      const json = JSON.parse(detail) as { errors?: Array<{ title?: string }>; detail?: string }
      detail = json.errors?.[0]?.title || json.detail || detail
    } catch {
      /* use raw text */
    }
    const err = new Error(detail || `Background removal failed (${response.status})`) as Error & {
      status?: number
    }
    err.status = response.status
    throw err
  }

  return Buffer.from(await response.arrayBuffer())
}

  return Buffer.from(await response.arrayBuffer())
}

function providerForRembgModel(model: string): SubmitBgProvider {
  if (model.toLowerCase().replace(/[_-]/g, "") === "inspyrenet") {
    return "rembg-inspyrenet"
  }
  return "rembg-isnet"
}

async function removeBackgroundWithRembgModel(
  model: string,
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<Buffer> {
  const serviceUrl = configuredBgRemovalServiceUrl()
  if (!serviceUrl) {
    throw new Error("rembg service is not configured — set BG_REMOVAL_SERVICE_URL")
  }

  const buildForm = () => {
    const form = new FormData()
    form.append(
      "image",
      new Blob([new Uint8Array(buffer)], { type: contentType || "image/jpeg" }),
      fileName || "photo.jpg"
    )
    form.append("model", model)
    form.append("format", "jpg")
    if (bgColor?.trim()) {
      form.append("bgColor", bgColor)
    }
    return form
  }

  const { response } = await removeBackgroundViaService(serviceUrl, buildForm)
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(formatBgServiceError(detail, response.status))
  }

  return Buffer.from(await response.arrayBuffer())
}

async function tryRembgFallback(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<{ buffer: Buffer; provider: SubmitBgProvider }> {
  if (!isRembgFallbackConfigured()) {
    throw new Error(
      "All paid background removal providers failed and rembg is not configured (BG_REMOVAL_SERVICE_URL)"
    )
  }

  let lastError: unknown = null
  for (const model of REMBG_SUBMIT_FALLBACK_MODELS) {
    try {
      console.warn(
        `[photo-bg] Trying rembg fallback model "${model}" via ${configuredBgRemovalServiceUrl()}`
      )
      const result = await removeBackgroundWithRembgModel(
        model,
        buffer,
        contentType,
        fileName,
        bgColor
      )
      return { buffer: result, provider: providerForRembgModel(model) }
    } catch (error) {
      lastError = error
      console.warn(`[photo-bg] rembg model "${model}" failed:`, getErrorMessage(error))
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All rembg fallback models failed")
}

/**
 * Submit form fallback chain: remove.bg → Poof.bg → rembg (InSPyReNet → ISNet).
 */
export async function removeBackgroundForSubmit(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<{ buffer: Buffer; provider: SubmitBgProvider }> {
  if (isRemoveBgConfigured()) {
    try {
      const result = await removeBackgroundWithRemoveBg(buffer, contentType, fileName, bgColor)
      return { buffer: result, provider: "removebg" }
    } catch (removeBgErr) {
      const status = getErrorStatus(removeBgErr)
      const message = getErrorMessage(removeBgErr)

      if (usesOfficialRemoveBg() && isRemoveBgCreditsExhausted(status, message)) {
        if (isPoofBgConfigured()) {
          try {
            console.warn("[photo-bg] remove.bg credits exhausted — trying Poof.bg")
            const result = await removeBackgroundWithPoofBg(buffer, contentType, fileName, bgColor)
            return { buffer: result, provider: "poofbg" }
          } catch (poofErr) {
            console.warn("[photo-bg] Poof.bg failed — trying rembg+ISNet:", getErrorMessage(poofErr))
            return tryRembgFallback(buffer, contentType, fileName, bgColor)
          }
        }

        return tryRembgFallback(buffer, contentType, fileName, bgColor)
      }

      if (isRembgFallbackConfigured()) {
        console.warn("[photo-bg] remove.bg failed — trying rembg+ISNet:", message)
        return tryRembgFallback(buffer, contentType, fileName, bgColor)
      }

      throw removeBgErr
    }
  }

  if (isPoofBgConfigured()) {
    try {
      const result = await removeBackgroundWithPoofBg(buffer, contentType, fileName, bgColor)
      return { buffer: result, provider: "poofbg" }
    } catch (poofErr) {
      console.warn("[photo-bg] Poof.bg failed — trying rembg+ISNet:", getErrorMessage(poofErr))
      return tryRembgFallback(buffer, contentType, fileName, bgColor)
    }
  }

  return tryRembgFallback(buffer, contentType, fileName, bgColor)
}