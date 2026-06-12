import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { storageUpload, storagePublicUrl, ensureBucket } from "@/lib/storage"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"
import { durableRateLimit, getClientIp } from "@/lib/rate-limit"
import { reportError } from "@/lib/observability"
import sharp from "sharp"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const PUBLIC_MAX_FILE_SIZE = 2.5 * 1024 * 1024 // parent submit photos should already be compressed client-side
const PUBLIC_NORMALIZED_MAX_DIMENSION = 768
const MAX_IMAGE_PIXELS = 24_000_000
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const ALLOWED_SHARP_FORMATS = new Set(["jpeg", "png", "webp"])
const BUCKET_NAME = "student-photos"
const SAFE_FOLDER_RE = /^(students\/[a-zA-Z0-9_-]+|logos|templates|flags\/[a-zA-Z0-9_-]+)$/
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

// Track whether we've initialized the bucket
let bucketInitialized = false

async function validateAndPrepareImage(
  buffer: Buffer,
  options: { normalizePublicStudentPhoto: boolean }
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  let metadata: sharp.Metadata
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata()
  } catch {
    throw new Error("Invalid image file. Please upload a real JPEG, PNG, or WebP photo.")
  }

  if (!metadata.format || !ALLOWED_SHARP_FORMATS.has(metadata.format)) {
    throw new Error("Invalid image content. Allowed: JPEG, PNG, WebP.")
  }

  if (!metadata.width || !metadata.height || metadata.width < 80 || metadata.height < 80) {
    throw new Error("Image is too small. Please upload a clear student photo.")
  }

  if (!options.normalizePublicStudentPhoto) {
    const contentType =
      metadata.format === "png" ? "image/png" :
      metadata.format === "webp" ? "image/webp" :
      "image/jpeg"
    const extension = metadata.format === "jpeg" ? "jpg" : metadata.format
    return { buffer, contentType, extension }
  }

  const normalized = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: PUBLIC_NORMALIZED_MAX_DIMENSION,
      height: PUBLIC_NORMALIZED_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 86,
      mozjpeg: true,
    })
    .toBuffer()

  if (normalized.length > PUBLIC_MAX_FILE_SIZE) {
    throw new Error("Photo is still too large after compression. Please choose a smaller image.")
  }

  return { buffer: normalized, contentType: "image/jpeg", extension: "jpg" }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const folder = (formData.get("folder") as string) || "uploads"
    const submitToken = (formData.get("submitToken") as string) || ""

    if (!SAFE_FOLDER_RE.test(folder)) {
      return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 })
    }

    // Auth check: session-based for staff, token-bound for public student photo uploads.
    const session = await getServerSession(authOptions)
    const isPublicUpload = folder.startsWith("students/")
    if (!session) {
      if (!isPublicUpload || !submitToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const schoolId = folder.split("/")[1]
      const classToken = await prisma.class.findFirst({
        where: {
          linkToken: submitToken,
          schoolId,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      })

      let schoolToken: { id: string } | null = null
      if (!classToken) {
        schoolToken = await prisma.school.findFirst({
          where: {
            id: schoolId,
            linkToken: submitToken,
            linkActive: true,
            OR: [{ linkExpiresAt: null }, { linkExpiresAt: { gt: new Date() } }],
          },
          select: { id: true },
        })
      }

      if (!classToken && !schoolToken) {
        return NextResponse.json({ error: "Invalid or expired upload token" }, { status: 403 })
      }

      const ip = getClientIp(req)
      const rl = await durableRateLimit(`upload:${schoolId}:${submitToken}:${ip}`, 30, 60 * 1000)
      if (!rl.success) {
        return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 })
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const maxAllowedSize = !session && isPublicUpload ? PUBLIC_MAX_FILE_SIZE : MAX_FILE_SIZE
    if (file.size > maxAllowedSize) {
      return NextResponse.json(
        { error: `File too large. Max ${maxAllowedSize / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP" },
        { status: 400 }
      )
    }

    // Ensure storage bucket exists (once per server lifecycle)
    if (!bucketInitialized) {
      await ensureBucket(BUCKET_NAME)
      bucketInitialized = true
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    let prepared: { buffer: Buffer; contentType: string; extension: string }
    try {
      prepared = await validateAndPrepareImage(buffer, {
        normalizePublicStudentPhoto: !session && isPublicUpload,
      })
    } catch (imageError: any) {
      return NextResponse.json({ error: imageError?.message || "Invalid image" }, { status: 400 })
    }

    const ext = prepared.extension || EXT_BY_TYPE[file.type] || "jpg"
    const safeName = `${Date.now()}-${randomUUID()}.${ext}`
    const filePath = `${folder}/${safeName}`

    // Upload with retry + auto-bucket-creation
    const { data, error } = await storageUpload(BUCKET_NAME, filePath, prepared.buffer, {
      contentType: prepared.contentType,
      upsert: true,
    })

    if (error) {
      console.error("Upload failed after retries:", error)
      await reportError(error, {
        type: "UPLOAD_FAILED",
        schoolId: folder.startsWith("students/") ? folder.split("/")[1] : null,
        message: "Storage upload failed",
        metadata: { folder, fileType: file.type, fileSize: file.size },
      })
      return NextResponse.json(
        {
          error: "Upload failed. Please ensure the Supabase storage bucket 'student-photos' exists.",
          detail: error?.message || "Unknown storage error",
          fix: "Go to Supabase Dashboard → Storage → Create bucket named 'student-photos' (public).",
        },
        { status: 500 }
      )
    }

    const url = storagePublicUrl(BUCKET_NAME, filePath)
    return NextResponse.json({
      success: true,
      url,
      path: filePath,
    })
  } catch (error: any) {
    console.error("Upload error:", error)
    await reportError(error, {
      type: "UPLOAD_FAILED",
      message: "Upload route failed",
    })
    return NextResponse.json(
      { error: "Upload failed", detail: error?.message },
      { status: 500 }
    )
  }
}
