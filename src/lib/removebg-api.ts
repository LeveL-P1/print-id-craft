/**
 * Paid background removal APIs — server-side only (never expose keys to the browser).
 *
 * Submit fallback chain:
 *   1. Poof.bg — all free keys first, then paid (see buildPoofApiKeyOrder)
 *   2. Remove.bg (REMOVEBG_API_KEYS rotation)
 *   3. rembg + InSPyReNet, then isnet-general-use (BG_REMOVAL_SERVICE_URL)
 *
 * Poof env (free keys are always tried before paid):
 *   POOFBG_FREE_API_KEY_1 … POOFBG_FREE_API_KEY_13  (one key per Vercel variable)
 *   or POOFBG_FREE_API_KEYS=free1,free2,free3        (comma-separated — single variable)
 *   POOFBG_PAID_API_KEY=your-mega-plan-key
 *   (legacy: POOFBG_API_KEYS = free list, POOFBG_API_KEY = paid — paid is appended last)
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
  process.env.BG_REMOVAL_SUBMIT_FALLBACK_MODELS || "isnet-general-use"
)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)

export type SubmitBgProvider = "removebg" | "poofbg" | "rembg-inspyrenet" | "rembg-isnet"

export function parseApiKeys(singleEnv?: string, listEnv?: string): string[] {
  const fromList = (listEnv || "")
    .split(/[,;\n]+/)
    .map((key) => key.trim())
    .filter(Boolean)
  if (fromList.length > 0) {
    return [...new Set(fromList)]
  }
  const single = singleEnv?.trim()
  return single ? [single] : []
}

export function collectNumberedEnvKeys(prefix: string, max = 20): string[] {
  const keys: string[] = []
  for (let i = 1; i <= max; i++) {
    const value = process.env[`${prefix}_${i}`]?.trim()
    if (value) keys.push(value)
  }
  return keys
}

export function buildPoofApiKeyOrder(options: {
  numberedFreeKeys?: string[]
  freeList?: string
  legacyList?: string
  paidSingle?: string
}): string[] {
  const paidKey = options.paidSingle?.trim() || ""
  const freeKeys = [
    ...(options.numberedFreeKeys || []),
    ...parseApiKeys(undefined, options.freeList),
    ...parseApiKeys(undefined, options.legacyList).filter((key) => key !== paidKey),
  ]
  const uniqueFree = [...new Set(freeKeys.filter(Boolean))]
  if (uniqueFree.length > 0 || paidKey) {
    return paidKey ? [...uniqueFree, paidKey] : uniqueFree
  }
  return []
}

function getPoofBgApiKeys(): string[] {
  return buildPoofApiKeyOrder({
    numberedFreeKeys: collectNumberedEnvKeys("POOFBG_FREE_API_KEY"),
    freeList: process.env.POOFBG_FREE_API_KEYS,
    legacyList: process.env.POOFBG_API_KEYS,
    paidSingle: process.env.POOFBG_PAID_API_KEY || process.env.POOFBG_API_KEY,
  })
}

function getRemoveBgApiKeys(): string[] {
  return parseApiKeys(process.env.REMOVEBG_API_KEY, process.env.REMOVEBG_API_KEYS)
}

export function isPoofBgConfigured(): boolean {
  return getPoofBgApiKeys().length > 0
}

function poofBgColorValue(bgColor?: string): string | undefined {
  const hex = normalizeBgColorHex(bgColor)
  return hex ? `#${hex}` : undefined
}

function poofBgSize(): string {
  const configured = process.env.POOFBG_SIZE?.trim()
  if (configured && ["preview", "medium", "hd", "full"].includes(configured)) {
    return configured
  }
  return "full"
}

export async function removeBackgroundWithPoofBg(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string,
  apiKey?: string
): Promise<Buffer> {
  const key = apiKey?.trim() || getPoofBgApiKeys()[0]
  if (!key) {
    throw new Error("Poof.bg is not configured — set POOFBG_FREE_API_KEY_1…N, POOFBG_FREE_API_KEYS, and/or POOFBG_PAID_API_KEY")
  }

  const bg = poofBgColorValue(bgColor)

  const form = new FormData()
  form.append(
    "image_file",
    new Blob([new Uint8Array(buffer)], { type: contentType || "image/jpeg" }),
    fileName || "photo.jpg"
  )
  form.append("size", poofBgSize())
  if (bg) {
    form.append("format", "jpg")
    form.append("bg_color", bg)
  } else {
    form.append("format", "png")
  }

  const response = await fetch(POOFBG_API_URL, {
    method: "POST",
    headers: { "x-api-key": key },
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
  return getRemoveBgApiKeys().length > 0
}

export function isRembgFallbackConfigured(): boolean {
  return !!configuredBgRemovalServiceUrl()
}

/** True when submit flow can run (paid APIs and/or rembg service). */
export function isSubmitPhotoBgConfigured(): boolean {
  return isPoofBgConfigured() || isRemoveBgConfigured() || isRembgFallbackConfigured()
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

function isImageValidationError(status: number, detail: string): boolean {
  if (status !== 400 && status !== 422) return false
  const lower = detail.toLowerCase()
  return (
    lower.includes("image") ||
    lower.includes("file") ||
    lower.includes("format") ||
    lower.includes("size") ||
    lower.includes("invalid") ||
    lower.includes("too large")
  )
}

function shouldTryNextApiKey(status: number, detail: string): boolean {
  if (isImageValidationError(status, detail)) return false
  if (isPaidApiCreditsExhausted(status, detail)) return true
  if (status === 401 || status === 403 || status === 429) return true
  const lower = detail.toLowerCase()
  if (
    lower.includes("quota") ||
    lower.includes("monthly") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return true
  }
  // Transient provider errors — try the next key silently before surfacing to the user.
  if (status >= 500 && status < 600) return true
  return false
}

function usesOfficialRemoveBg(): boolean {
  return getRemoveBgApiKeys().length > 0 && !process.env.REMOVEBG_API_URL?.trim()
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

function removeBgRequestHeaders(apiKey?: string): HeadersInit {
  const key = apiKey?.trim() || getRemoveBgApiKeys()[0]
  if (key) {
    return { "X-Api-Key": key }
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
  bgColor?: string,
  apiKey?: string
): Promise<Buffer> {
  const usingLocalReplica = !!process.env.REMOVEBG_API_URL?.trim()
  const key = apiKey?.trim() || getRemoveBgApiKeys()[0]
  if (!usingLocalReplica && !key) {
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
    headers: removeBgRequestHeaders(key),
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

async function tryPoofBgWithKeyRotation(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<Buffer> {
  const keys = getPoofBgApiKeys()
  if (!keys.length) {
    throw new Error("Poof.bg is not configured — set POOFBG_FREE_API_KEY_1…N, POOFBG_FREE_API_KEYS, and/or POOFBG_PAID_API_KEY")
  }

  let lastError: unknown = null
  for (let i = 0; i < keys.length; i++) {
    try {
      const result = await removeBackgroundWithPoofBg(
        buffer,
        contentType,
        fileName,
        bgColor,
        keys[i]
      )
      if (i > 0) {
        console.warn(`[photo-bg] Poof.bg succeeded with key #${i + 1} of ${keys.length}`)
      }
      return result
    } catch (error) {
      lastError = error
      const status = getErrorStatus(error)
      const message = getErrorMessage(error)
      const hasNextKey = i < keys.length - 1
      if (hasNextKey && shouldTryNextApiKey(status, message)) {
        console.warn(
          `[photo-bg] Poof.bg key #${i + 1} of ${keys.length} unavailable (${status || "error"}) — trying next key`
        )
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All Poof.bg API keys failed")
}

async function tryRemoveBgWithKeyRotation(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<Buffer> {
  const usingLocalReplica = !!process.env.REMOVEBG_API_URL?.trim()
  if (usingLocalReplica) {
    return removeBackgroundWithRemoveBg(buffer, contentType, fileName, bgColor)
  }

  const keys = getRemoveBgApiKeys()
  if (!keys.length) {
    throw new Error("REMOVEBG_API_KEY is not configured")
  }

  let lastError: unknown = null
  for (let i = 0; i < keys.length; i++) {
    try {
      const result = await removeBackgroundWithRemoveBg(
        buffer,
        contentType,
        fileName,
        bgColor,
        keys[i]
      )
      if (i > 0) {
        console.warn(`[photo-bg] remove.bg succeeded with key #${i + 1} of ${keys.length}`)
      }
      return result
    } catch (error) {
      lastError = error
      const status = getErrorStatus(error)
      const message = getErrorMessage(error)
      const hasNextKey = i < keys.length - 1
      if (hasNextKey && shouldTryNextApiKey(status, message)) {
        console.warn(
          `[photo-bg] remove.bg key #${i + 1} of ${keys.length} unavailable (${status || "error"}) — trying next key`
        )
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All remove.bg API keys failed")
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
 * Submit form fallback chain: Poof.bg → remove.bg → rembg (InSPyReNet → ISNet).
 * Each paid provider rotates through comma-separated API keys until credits run out.
 */
export async function removeBackgroundForSubmit(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<{ buffer: Buffer; provider: SubmitBgProvider }> {
  if (isPoofBgConfigured()) {
    try {
      const result = await tryPoofBgWithKeyRotation(buffer, contentType, fileName, bgColor)
      return { buffer: result, provider: "poofbg" }
    } catch (poofErr) {
      console.warn("[photo-bg] All Poof.bg keys failed — trying remove.bg:", getErrorMessage(poofErr))
    }
  }

  if (isRemoveBgConfigured()) {
    try {
      const result = await tryRemoveBgWithKeyRotation(buffer, contentType, fileName, bgColor)
      return { buffer: result, provider: "removebg" }
    } catch (removeBgErr) {
      const message = getErrorMessage(removeBgErr)
      if (isRembgFallbackConfigured()) {
        console.warn("[photo-bg] remove.bg failed — trying rembg+ISNet:", message)
        return tryRembgFallback(buffer, contentType, fileName, bgColor)
      }
      throw removeBgErr
    }
  }

  return tryRembgFallback(buffer, contentType, fileName, bgColor)
}
