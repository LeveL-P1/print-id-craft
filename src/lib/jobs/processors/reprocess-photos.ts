import { prisma } from "@/lib/prisma"
import { storageDownload, storagePublicUrl, storageUpload } from "@/lib/storage"
import { removeBackgroundRembg, isRembgConfigured } from "@/lib/rembg-service"
import { compositePhotoBackground } from "@/lib/photo-composite-server"
import { PHOTO_BG_STATUS } from "@/lib/photo-bg-status"
import type { ReprocessPhotosPayload } from "../types"

const BUCKET = "student-photos"
const PAGE_SIZE = 25

type ReprocessResult = {
  processed: number
  failed: number
  skipped: number
  errors: Array<{ studentId: string; serialNumber: string; error: string }>
}

export async function processReprocessPhotos(
  jobId: string,
  schoolId: string,
  payload: ReprocessPhotosPayload
): Promise<ReprocessResult> {
  if (!isRembgConfigured()) {
    throw new Error("REMBG_SERVICE_URL is not configured")
  }

  const template = await prisma.template.findFirst({
    where: { schoolId },
    orderBy: { updatedAt: "desc" },
    select: { photoBgColor: true },
  })
  const bgColor = template?.photoBgColor || "#FFFFFF"

  const where: {
    schoolId: string
    photoBgStatus: string
    photoPath: { not: string }
    classId?: string
    id?: { in: string[] }
  } = {
    schoolId,
    photoBgStatus: PHOTO_BG_STATUS.SKIPPED,
    photoPath: { not: "" },
  }
  if (payload.classId) where.classId = payload.classId
  if (payload.studentIds?.length) where.id = { in: payload.studentIds }

  const result: ReprocessResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  let remaining = payload.maxStudents || 5000

  while (remaining > 0) {
    const students = await prisma.student.findMany({
      where,
      select: {
        id: true,
        serialNumber: true,
        photoPath: true,
      },
      orderBy: { submittedAt: "asc" },
      take: Math.min(PAGE_SIZE, remaining),
    })

    if (students.length === 0) break

    for (const student of students) {
      try {
        const { data, error } = await storageDownload(BUCKET, student.photoPath)
        if (error || !data) {
          throw new Error("Photo download failed")
        }

        const transparent = await removeBackgroundRembg(data)
        const jpeg = await compositePhotoBackground(transparent, bgColor)
        const filePath = student.photoPath.replace(/\.[^.]+$/, "") + ".jpg"

        const { error: uploadError } = await storageUpload(BUCKET, filePath, jpeg, {
          contentType: "image/jpeg",
          upsert: true,
        })
        if (uploadError) {
          throw new Error(uploadError.message || "Upload failed")
        }

        const photoUrl = storagePublicUrl(BUCKET, filePath)
        await prisma.student.update({
          where: { id: student.id },
          data: {
            photoUrl,
            photoPath: filePath,
            photoBgStatus: PHOTO_BG_STATUS.REPROCESSED,
          },
        })
        result.processed++
      } catch (err: unknown) {
        result.failed++
        const message = err instanceof Error ? err.message : String(err)
        if (result.errors.length < 50) {
          result.errors.push({
            studentId: student.id,
            serialNumber: student.serialNumber,
            error: message,
          })
        }
      }

      remaining--
      if (remaining <= 0) break

      await prisma.job.update({
        where: { id: jobId },
        data: {
          result: {
            ...result,
            inProgress: true,
            bgColor,
          },
        },
      })
    }

    if (students.length < PAGE_SIZE) break
  }

  return result
}
