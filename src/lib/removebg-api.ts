/**
 * remove.bg API — server-side only (never expose REMOVEBG_API_KEY to the browser).
 * @see https://www.remove.bg/api
 */

export function isRemoveBgConfigured(): boolean {
  return !!(process.env.REMOVEBG_API_KEY?.trim())
}

export async function removeBackgroundWithRemoveBg(
  buffer: Buffer,
  contentType: string,
  fileName: string
): Promise<Buffer> {
  const apiKey = process.env.REMOVEBG_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("REMOVEBG_API_KEY is not configured")
  }

  const form = new FormData()
  form.append(
    "image_file",
    new Blob([new Uint8Array(buffer)], { type: contentType || "image/jpeg" }),
    fileName || "photo.jpg"
  )
  form.append("size", "auto")
  form.append("format", "png")
  form.append("type", "person")
  form.append("crop", "false")

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: form,
  })

  if (!response.ok) {
    let detail = await response.text().catch(() => "")
    try {
      const json = JSON.parse(detail) as { errors?: Array<{ title?: string }> }
      detail = json.errors?.[0]?.title || detail
    } catch {
      /* use raw text */
    }
    throw new Error(detail || `remove.bg failed (${response.status})`)
  }

  return Buffer.from(await response.arrayBuffer())
}