import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const SERVICE_TIMEOUT_MS = 55_000

function configuredServiceUrl() {
  return (
    process.env.BIREFNET_REMOVAL_URL ||
    process.env.REMBG_SERVICE_URL ||
    process.env.BG_REMOVAL_SERVICE_URL ||
    ""
  ).replace(/\/+$/, "")
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  try {
    return {
      contentType: match[1],
      buffer: Buffer.from(match[2], "base64"),
    }
  } catch {
    return null
  }
}

async function readRequestImage(req: Request) {
  const contentType = req.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("image")
    if (!(file instanceof File)) {
      throw new Error("Image file is required")
    }
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "image/jpeg",
      fileName: file.name || "photo.jpg",
      bgColor: String(form.get("bgColor") || "#FFFFFF"),
    }
  }

  const body = await req.json().catch(() => null)
  const parsed = dataUrlToBuffer(String(body?.image || body?.dataUrl || ""))
  if (!parsed) throw new Error("Image data URL is required")
  return {
    buffer: parsed.buffer,
    contentType: parsed.contentType,
    fileName: "photo.jpg",
    bgColor: String(body?.bgColor || "#FFFFFF"),
  }
}

export async function POST(req: Request) {
  const serviceUrl = configuredServiceUrl()
  if (!serviceUrl) {
    return NextResponse.json(
      { error: "Professional background service is not configured" },
      { status: 503 }
    )
  }

  try {
    const image = await readRequestImage(req)
    const form = new FormData()
    form.append("image", new Blob([new Uint8Array(image.buffer)], { type: image.contentType }), image.fileName)
    form.append("bgColor", image.bgColor)
    form.append("model", process.env.BG_REMOVAL_MODEL || "birefnet-portrait")

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS)
    const headers: HeadersInit = {}
    if (process.env.BG_REMOVAL_SERVICE_TOKEN) {
      headers.authorization = `Bearer ${process.env.BG_REMOVAL_SERVICE_TOKEN}`
    }

    const response = await fetch(`${serviceUrl}/remove`, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))

    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      return NextResponse.json(
        { error: detail || "Professional background removal failed" },
        { status: response.status }
      )
    }

    const resultType = response.headers.get("content-type") || "image/png"
    if (resultType.includes("application/json")) {
      const json = await response.json()
      return NextResponse.json(json)
    }

    const result = await response.arrayBuffer()
    return new NextResponse(result, {
      headers: {
        "content-type": resultType,
        "cache-control": "no-store",
      },
    })
  } catch (error: any) {
    const aborted = error?.name === "AbortError"
    return NextResponse.json(
      {
        error: aborted
          ? "Professional background removal timed out"
          : error?.message || "Background removal failed",
      },
      { status: aborted ? 504 : 400 }
    )
  }
}
