import { NextResponse } from "next/server"
import {
  configuredBgRemovalServiceUrl,
  removeBackgroundViaService,
} from "@/lib/bg-removal-service"

export const runtime = "nodejs"
export const maxDuration = 300

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
      model: String(form.get("model") || "birefnet"),
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
    model: String(body?.model || "birefnet"),
  }
}

function buildRemoveForm(image: Awaited<ReturnType<typeof readRequestImage>>) {
  const form = new FormData()
  form.append(
    "image",
    new Blob([new Uint8Array(image.buffer)], { type: image.contentType }),
    image.fileName
  )
  form.append("bgColor", image.bgColor)
  form.append("model", process.env.BG_REMOVAL_MODEL || "birefnet-portrait")
  return form
}

export async function POST(req: Request) {
  try {
    const image = await readRequestImage(req)
    const requestedModel = image.model

    // ─── BiRefNet / rembg service path ───────────────────────
    if (requestedModel === "birefnet-portrait" || requestedModel === "birefnet") {
      const serviceUrl = configuredBgRemovalServiceUrl()
      if (!serviceUrl) {
        return NextResponse.json(
          { error: "Professional background service is not configured" },
          { status: 503 }
        )
      }

      const { response, wokeService } = await removeBackgroundViaService(
        serviceUrl,
        () => buildRemoveForm(image)
      )

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        return NextResponse.json(
          {
            error:
              detail ||
              (wokeService
                ? "Professional background service is still starting — try again in a moment"
                : "Professional background removal failed"),
          },
          { status: response.status }
        )
      }

      const resultType = response.headers.get("content-type") || "image/png"
      if (resultType.includes("application/json")) {
        const json = await response.json()
        return NextResponse.json(json)
      }

      const result = await response.arrayBuffer()
      const modelUsed = response.headers.get("x-bg-removal-model")
      return new NextResponse(result, {
        headers: {
          "content-type": resultType,
          "cache-control": "no-store",
          ...(modelUsed ? { "x-bg-removal-model": modelUsed } : {}),
          ...(wokeService ? { "x-bg-service-woke": "1" } : {}),
        },
      })
    }

    // ─── Unknown model → 400 ────────────────────────────────────────────
    return NextResponse.json(
      { error: `Unknown model: ${requestedModel}. Use "birefnet", or process locally with ISNet.` },
      { status: 400 }
    )
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === "AbortError"
    return NextResponse.json(
      {
        error: aborted
          ? "Background removal timed out"
          : error instanceof Error
            ? error.message
            : "Background removal failed",
      },
      { status: aborted ? 504 : 400 }
    )
  }
}
