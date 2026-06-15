import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageDownload, storageUpload, storagePublicUrl, ensureBucket } from "@/lib/storage"
import { PHOTO_BG_STATUS, type PhotoBgStatus } from "@/lib/photo-bg-status"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"

const BUCKET = "student-photos"

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id
    const formData = await req.formData()
    const studentId = formData.get("studentId") as string
    const photo = formData.get("photo") as File | null
    const photoBgStatusRaw = (formData.get("photoBgStatus") as string) || ""
    const photoBgStatus: PhotoBgStatus | undefined =
      photoBgStatusRaw === PHOTO_BG_STATUS.REPROCESSED ? PHOTO_BG_STATUS.REPROCESSED : undefined
    const isAiProcessed = photoBgStatus === PHOTO_BG_STATUS.REPROCESSED

    if (!studentId) {
      return NextResponse.json({ error: "Student ID is required" }, { status: 400 })
    }

    // Verify student belongs to this school
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        id: true,
        schoolId: true,
        photoPath: true,
        photoUrl: true,
        originalPhotoPath: true,
        originalPhotoUrl: true,
      },
    })

    if (!student) {
      return NextResponse.json({ error: "Student not found in this school" }, { status: 404 })
    }

    if (!photo) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 })
    }

    // Ensure bucket exists
    await ensureBucket(BUCKET)

    // Upload photo
    const arrayBuffer = await photo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = photo.name.split(".").pop()?.toLowerCase() || "jpg"
    const originalPath = student.originalPhotoPath || `students/${schoolId}/originals/${student.id}.${ext}`
    const filePath = isAiProcessed
      ? `students/${schoolId}/processed/${student.id}.${ext}`
      : originalPath

    let originalUrl = student.originalPhotoUrl
    if (!student.originalPhotoPath) {
      const originalBuffer = isAiProcessed && student.photoPath
        ? (await storageDownload(BUCKET, student.photoPath)).data || buffer
        : buffer
      const { error: originalUploadError } = await storageUpload(BUCKET, originalPath, originalBuffer, {
        contentType: photo.type,
        upsert: true,
      })
      if (originalUploadError) {
        return NextResponse.json({ error: `Original photo backup failed: ${originalUploadError.message}` }, { status: 500 })
      }
      originalUrl = storagePublicUrl(BUCKET, originalPath)
    }

    const { error: uploadError } = await storageUpload(BUCKET, filePath, buffer, {
      contentType: photo.type,
      upsert: true,
    })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const publicUrl = storagePublicUrl(BUCKET, filePath)

    // Update student record
    const updated = await prisma.student.update({
      where: { id: student.id },
      data: {
        photoUrl: publicUrl,
        photoPath: filePath,
        originalPhotoUrl: originalUrl,
        originalPhotoPath: originalPath,
        ...(photoBgStatus ? { photoBgStatus } : {}),
      },
      select: {
        id: true,
        photoPath: true,
        photoUrl: true,
        originalPhotoPath: true,
        originalPhotoUrl: true,
        updatedAt: true,
        serialNumber: true,
        formData: true,
      },
    })

    const fd = updated.formData as Record<string, string>
    const mediaUrl = withStudentPhotoUrl(updated).photoUrl

    return NextResponse.json({
      success: true,
      data: {
        studentId: updated.id,
        studentName: fd?.fullName || fd?.["Full Name"] || fd?.["Student Name"] || "Unknown",
        serialNumber: updated.serialNumber,
        photoUrl: mediaUrl,
        photoPath: updated.photoPath,
        originalPhotoUrl: updated.originalPhotoUrl,
        originalPhotoPath: updated.originalPhotoPath,
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error("Assign photo error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
