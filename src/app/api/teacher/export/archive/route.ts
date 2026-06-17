import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"
import type { ExportArchivePayload } from "@/lib/jobs/types"
import { EXPORT_DEFAULT_MAX_STUDENTS, EXPORT_MAX_STUDENTS } from "@/lib/export/constants"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "TEACHER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const schoolId = session.user.schoolId
  if (!schoolId) {
    return NextResponse.json({ error: "No school assigned" }, { status: 400 })
  }

  const url = new URL(req.url)
  const classId = url.searchParams.get("classId")
  const status = url.searchParams.get("status")
  const includePhotos = url.searchParams.get("photos") !== "false"
  const formatParam = url.searchParams.get("format")
  const format: ExportArchivePayload["format"] = formatParam === "excel" ? "excel" : "archive"
  const requestedLimit = Number(url.searchParams.get("limit") || EXPORT_DEFAULT_MAX_STUDENTS)
  const maxStudents = Math.min(
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : EXPORT_DEFAULT_MAX_STUDENTS,
    EXPORT_MAX_STUDENTS
  )

  // Validate school exists
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } })
  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 })
  }

  // Count students
  const where: Record<string, unknown> = { schoolId }
  if (classId) where.classId = classId
  if (status) where.status = status

  const totalStudents = await prisma.student.count({ where })
  if (totalStudents > maxStudents) {
    return NextResponse.json(
      {
        error: "Export too large for one request",
        totalStudents,
        maxStudents,
        hint: "Use class or status filters, or set photos=false for a faster metadata-only export.",
      },
      { status: 413 }
    )
  }

  const payload: ExportArchivePayload = {
    classId,
    status,
    includePhotos,
    format,
    maxStudents,
    totalStudents,
  }

  const job = await enqueueJob({
    type: "EXPORT_SCHOOL_ARCHIVE",
    schoolId,
    createdById: session.user.id,
    payload,
  })

  await kickJobWorker(new URL(req.url).origin)

  return NextResponse.json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      totalStudents,
      maxStudents,
      message: "Export queued. Large schools may take several minutes.",
    },
  })
}

export async function POST(req: Request) {
  return GET(req)
}
