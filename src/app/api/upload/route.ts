import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { storageUpload, storagePublicUrl, ensureBucket } from "@/lib/storage"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const BUCKET_NAME = "student-photos"

// Track whether we've initialized the bucket
let bucketInitialized = false

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const folder = (formData.get("folder") as string) || "uploads"

    // Auth check: session-based for manufacturers, open for student photo uploads
    const session = await getServerSession(authOptions)
    const isPublicUpload = folder.startsWith("students/")
    if (!session && !isPublicUpload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024}MB` },
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

    const ext = file.name.split(".").pop() || "jpg"
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const filePath = `${folder}/${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload with retry + auto-bucket-creation
    const { data, error } = await storageUpload(BUCKET_NAME, filePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

    if (error) {
      console.error("Upload failed after retries:", error)
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
    return NextResponse.json(
      { error: "Upload failed", detail: error?.message },
      { status: 500 }
    )
  }
}
