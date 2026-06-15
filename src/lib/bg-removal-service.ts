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
  timeoutMs = 90_000
): Promise<BgServiceHealth | null> {
  try {
    const response = await fetchWithTimeout(
      `${serviceUrl}/health`,
      { headers: bgRemovalServiceHeaders(), cache: "no-store" },
      timeoutMs
    )
    return (await response.json().catch(() => null)) as BgServiceHealth | null
  } catch {
    return null
  }
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
  let wokeService = false
  let health = await wakeBgRemovalService(serviceUrl, 90_000)
  if (health?.ok !== true) {
    await new Promise((resolve) => setTimeout(resolve, 4_000))
    health = await wakeBgRemovalService(serviceUrl, 90_000)
    wokeService = true
  }

  let response = await postBgRemovalRemove(serviceUrl, buildForm(), 260_000)
  if (response.ok || !isRetryableBgServiceStatus(response.status)) {
    return { response, wokeService }
  }

  await wakeBgRemovalService(serviceUrl, 60_000)
  response = await postBgRemovalRemove(serviceUrl, buildForm(), 260_000)
  return { response, wokeService: true }
}
