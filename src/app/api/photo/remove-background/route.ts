import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { durableRateLimit, getClientIp } from "@/lib/rate-limit"
import { isRembgConfigured, removeBackgroundRembg } from "@/lib/rembg-service"
import { compositePhotoBackground } from "@/lib/photo-composite-server"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

async function authorizePublicUpload(req: Request, submitToken: string, schoolId: string) {
  if (!submitToken || !schoolId) return false

  const classToken = await prisma.class.findFirst({
    where: {
      linkToken: submitToken,
      schoolId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  })
  if (classToken) return true

  const schoolToken = await prisma.school.findFirst({
    where: {
      id: schoolId,
      linkToken: submitToken,
      linkActive: true,
      OR: [{ linkExpiresAt: null }, { linkExpiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  })
  return Boolean(schoolToken)
}

export async function POST(req: Request) {
  try {
    if (!isRembgConfigured()) {
      return NextResponse.json(
        { error: "Server background removal is not configured (REMBG_SERVICE_URL)" },
        { status: 503 }
      )
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const bgColor = ((formData.get("bgColor") as string) || "#FFFFFF").trim()
    const submitToken = (formData.get("submitToken") as string) || ""
    const schoolId = (formData.get("schoolId") as string) || ""
    const returnFormat = (formData.get("format") as string) || "transparent"

    const session = await getServerSession(authOptions)
    const isManufacturer = session?.user?.role === "MANUFACTURER"

    if (!isManufacturer) {
      if (!file || !schoolId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const allowed = await authorizePublicUpload(req, submitToken, schoolId)
      if (!allowed) {
        return NextResponse.json({ error: "Invalid or expired submit token" }, { status: 403 })
      }
      const ip = getClientIp(req)
      const rl = await durableRateLimit(`bg-remove:${schoolId}:${submitToken}:${ip}`, 8, 60_000)
      if (!rl.success) {
        return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    const input = Buffer.from(await file.arrayBuffer())
    const transparent = await removeBackgroundRembg(input)

    if (returnFormat === "jpeg") {
      const jpeg = await compositePhotoBackground(transparent, bgColor)
      return new NextResponse(new Uint8Array(jpeg), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
        },
      })
    }

    return new NextResponse(new Uint8Array(transparent), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("POST /api/photo/remove-background error:", error)
    const message = error?.message || "Background removal failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    available: isRembgConfigured(),
  })
}
