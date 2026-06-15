/**
 * remove.bg API — server-side only (never expose REMOVEBG_API_KEY to the browser).
 * @see https://www.remove.bg/api
 */

export function isRemoveBgConfigured(): boolean {
  return !!(process.env.REMOVEBG_API_KEY?.trim())
}

function normalizeBgColorHex(bgColor?: string): string | undefined {
  const hex = bgColor?.replace(/^#/, "").trim()
  return hex && /^[0-9a-fA-F]{3,8}$/.test(hex) ? hex : undefined
}

export async function removeBackgroundWithRemoveBg(
  buffer: Buffer,
  contentType: string,
  fileName: string,
  bgColor?: string
): Promise<Buffer> {
  const apiKey = process.env.REMOVEBG_API_KEY?.trim()
  if (!apiKey) {
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