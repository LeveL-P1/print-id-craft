/**
 * Shared helpers for the Hugging Face / rembg background removal service.
 * Handles cold-start wake-up (HF Spaces can take 60-120s to become ready).
 */

export function configuredBgRemovalServiceUrl(): string {
  return (
    process.env.BIREFNET_REMOVAL_URL ||
    process.env.REMBG_SERVICE_URL ||
    process.env.BG_REMOVAL_SERVICE_URL ||
    ""
  ).replace(/\/+$/, "")
}

export function bgRemovalServiceHeaders(): HeadersInit {
  const headers: HeadersInit = {}
  if (process.env.BG_REMOVAL_SERVICE_TOKEN) {
    headers.authorization = `Bearer ${process.env.BG_REMOVAL_SERVICE_TOKEN}`
  }
  return headers
}

export type BgServiceHealth = {
  ok?: boolean
  serviceVersion?: string
  mergeMask?: boolean
  mergeModel?: string | null
}

const RETRYABLE_STATUS = new Set([502, 503, 504, 524])

export function isRetryableBgServiceStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Ping /health - also wakes a sleeping Hugging Face Space. */
export async function wakeBgRemovalService(
  serviceUrl: string,
  timeoutMs = 120_000
): Promise<BgServiceHealth | null> {
  try {
    const response = await fetchWithTimeout(
      `${serviceUrl}/health`,
      { headers: bgRemovalServiceHeaders(), cache: "no-store" },
      timeoutMs
    )
    if (!response.ok) return null
    const body = (await response.json().catch(() => null)) as BgServiceHealth | null
    return body?.ok === true ? body : null
  } catch {
    return null
  }
}

/** Poll /health until the HF Space responds or attempts are exhausted. */
export async function ensureBgRemovalServiceReady(
  serviceUrl: string,
  maxAttempts = 10
): Promise<{ ready: boolean; health: BgServiceHealth | null }> {
  let health: BgServiceHealth | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    health = await wakeBgRemovalService(serviceUrl, 120_000)
    if (health?.ok === true) {
      return { ready: true, health }
    }
    if (attempt < maxAttempts - 1) {
      await sleep(8_000 + attempt * 4_000)
    }
  }
  return { ready: false, health }
}

export async function postBgRemovalRemove(
  serviceUrl: string,
  form: FormData,
  timeoutMs = 260_000
): Promise<Response> {
  return fetchWithTimeout(
    `${serviceUrl}/remove`,
    {
      method: "POST",
      headers: bgRemovalServiceHeaders(),
      body: form,
    },
    timeoutMs
  )
}

export async function removeBackgroundViaService(
  serviceUrl: string,
  buildForm: () => FormData
): Promise<{ response: Response; wokeService: boolean }> {
  const { ready } = await ensureBgRemovalServiceReady(serviceUrl)
  let wokeService = !ready

  const maxRemoveAttempts = 4
  let response = await postBgRemovalRemove(serviceUrl, buildForm(), 260_000)

  for (let attempt = 1; attempt < maxRemoveAttempts; attempt++) {
    if (response.ok || !isRetryableBgServiceStatus(response.status)) {
      return { response, wokeService }
    }
    wokeService = true
    await ensureBgRemovalServiceReady(serviceUrl, 6)
    await sleep(6_000)
    response = await postBgRemovalRemove(serviceUrl, buildForm(), 260_000)
  }

  return { response, wokeService }
}

export function formatBgServiceError(detail: string, status: number): string {
  if (isRetryableBgServiceStatus(status)) {
    try {
      const outer = JSON.parse(detail) as { error?: string }
      if (typeof outer.error === "string") {
        const inner = JSON.parse(outer.error) as { code?: number; message?: string }
        if (inner.code === 502 || inner.message?.toLowerCase().includes("failed to respond")) {
          return "Background removal server is waking up — wait 1–2 minutes and tap Retry."
        }
      }
    } catch {
      /* use generic message */
    }
    return "Background removal server is waking up — wait 1–2 minutes and tap Retry."
  }
  return detail || "Background removal failed"
}
