import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"
import type { ExportArchivePayload } from "@/lib/jobs/types"
import { EXPORT_DEFAULT_MAX_STUDENTS, EXPORT_MAX_STUDENTS } from "@/lib/export/constants"

export const dynamic = "force-dynamic"

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user?.role === "TEACHER") {
      if (session.user.schoolId !== params.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else if (session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const classId = url.searchParams.get("classId")
    const status = url.searchParams.get("status")

    const where: Record<string, unknown> = { schoolId: params.id }
    if (classId) where.classId = classId
    if (status) where.status = status

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { name: true, address: true },
    })

    const totalStudents = await prisma.student.count({ where })
    if (totalStudents > SYNC_STUDENT_LIMIT) {
      return NextResponse.json(
        {
          error: "Export too large for direct download",
          totalStudents,
          maxStudents: SYNC_STUDENT_LIMIT,
          hint: "Use the Export tab Download Excel button, which prepares a zip with mapped data and photos.",
        },
        { status: 413 }
      )
    }

    const zip = new JSZip()
    const photosFolder = zip.folder("photos")
    const excelRows: Array<{ row: unknown[]; photoUrl?: string | null }> = []
    const photoAllocator = new PhotoFileNameAllocator()
    const photoMappings: StudentPhotoMapping[] = []
    const completeRecords: Record<string, unknown>[] = []
    let photosIncluded = 0
    let photosMissing = 0

    let cursor: string | undefined
    let hasMore = true

    while (hasMore) {
      const students = await prisma.student.findMany({
        where,
        include: { class: { select: { name: true } } },
        orderBy: { id: "asc" },
        take: 250,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      })

      if (students.length === 0) {
        hasMore = false
        break
      }

      for (const student of students) {
        const entry = buildStudentExportEntry(
          {
            ...student,
            formData: (student.formData || {}) as Record<string, string>,
          },
          school?.name || "",
          photoAllocator
        )

        excelRows.push({ row: entry.row, photoUrl: student.photoUrl })
        photoMappings.push(entry.mapping)
        completeRecords.push(entry.completeRecord)

        if (student.photoPath && photosFolder && entry.photoFile) {
          const ok = await addPhotoToZip(photosFolder, entry.photoFile, student.photoPath)
          entry.mapping.photoSaved = ok
          if (ok) photosIncluded++
          else photosMissing++
        } else if (student.photoPath) {
          photosMissing++
        }
      }

      cursor = students[students.length - 1].id
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user?.role === "TEACHER") {
    if (session.user.schoolId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  } else if (session.user?.role !== "MANUFACTURER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const classId = url.searchParams.get("classId")
  const status = url.searchParams.get("status")
  const requestedLimit = Number(url.searchParams.get("limit") || EXPORT_DEFAULT_MAX_STUDENTS)
  const maxStudents = Math.min(
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : EXPORT_DEFAULT_MAX_STUDENTS,
    EXPORT_MAX_STUDENTS
  )

  const where: Record<string, unknown> = { schoolId: params.id }
  if (classId) where.classId = classId
  if (status) where.status = status

  const [school, totalStudents] = await Promise.all([
    prisma.school.findUnique({ where: { id: params.id }, select: { id: true } }),
    prisma.student.count({ where }),
  ])

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 })
  }
  if (totalStudents > maxStudents) {
    return NextResponse.json(
      {
        error: "Export too large for one request",
        totalStudents,
        maxStudents,
        hint: "Use class/status filters or increase limit up to the configured export maximum.",
      },
      { status: 413 }
    )
  }

  const payload: ExportArchivePayload = {
    classId,
    status,
    includePhotos: true,
    format: "excel",
    maxStudents,
    totalStudents,
  }

  const job = await enqueueJob({
    type: "EXPORT_SCHOOL_ARCHIVE",
    schoolId: params.id,
    createdById: session.user.id,
    payload,
  })

  await kickJobWorker(url.origin)

  return NextResponse.json(
    {
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        totalStudents,
        downloadUrl: `/api/jobs/${job.id}/download`,
        message: "Excel export queued. Poll /api/jobs/{jobId}; download when completed.",
      },
    },
    { status: 202 }
  )
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return GET(req, { params })
}
