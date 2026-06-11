import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"
import type { ExportArchivePayload } from "@/lib/jobs/types"
import { EXPORT_DEFAULT_MAX_STUDENTS, EXPORT_MAX_STUDENTS } from "@/lib/export/constants"

export const dynamic = "force-dynamic"

function parseFilters(req: Request, schoolId: string) {
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

  return { classId, status, includePhotos, format, maxStudents, schoolId }
}

async function validateArchiveRequest(schoolId: string, filters: ReturnType<typeof parseFilters>) {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } })
  if (!school) {
    return { error: NextResponse.json({ error: "School not found" }, { status: 404 }) }
  }

  const where: Record<string, unknown> = { schoolId }
  if (filters.classId) where.classId = filters.classId
  if (filters.status) where.status = filters.status

  const totalStudents = await prisma.student.count({ where })
  if (totalStudents > filters.maxStudents) {
    return {
      error: NextResponse.json(
        {
          error: "Archive too large for one request",
          totalStudents,
          maxStudents: filters.maxStudents,
          hint: "Use class or status filters, or set photos=false for a faster metadata-only export.",
        },
        { status: 413 }
      ),
    }
  }

  return { totalStudents }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "MANUFACTURER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const filters = parseFilters(req, params.id)
  const validation = await validateArchiveRequest(params.id, filters)
  if ("error" in validation && validation.error) return validation.error

  const payload: ExportArchivePayload = {
    classId: filters.classId,
    status: filters.status,
    includePhotos: filters.includePhotos,
    format: filters.format,
    maxStudents: filters.maxStudents,
    totalStudents: validation.totalStudents as number,
  }

  const job = await enqueueJob({
    type: "EXPORT_SCHOOL_ARCHIVE",
    schoolId: params.id,
    createdById: session.user.id,
    payload,
  })

  await kickJobWorker(new URL(req.url).origin)

  return NextResponse.json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      totalStudents: validation.totalStudents,
      maxStudents: filters.maxStudents,
      message: "Export queued. Large schools (up to 15,000 students) may take several minutes.",
    },
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return GET(req, { params })
}
