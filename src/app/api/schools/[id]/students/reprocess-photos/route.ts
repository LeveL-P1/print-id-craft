import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PHOTO_BG_STATUS } from "@/lib/photo-bg-status"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"
import { getDefaultTemplate, getTemplateForClass } from "@/lib/template-resolver"

export const maxDuration = 30

const PHOTO_BG_MODES = new Set(["skipped", "unprocessed", "all"])
const MAX_STUDENTS_LIST = 5000

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const classId = url.searchParams.get("classId")
    const modeParam = url.searchParams.get("mode") || "skipped"
    const mode = PHOTO_BG_MODES.has(modeParam) ? modeParam : "skipped"

    const baseWhere: Record<string, unknown> = {
      schoolId: params.id,
      photoPath: { not: "" },
    }
    if (classId) baseWhere.classId = classId

    const skippedWhere = { ...baseWhere, photoBgStatus: PHOTO_BG_STATUS.SKIPPED }
    const unprocessedWhere = { ...baseWhere, photoBgStatus: { in: ["", PHOTO_BG_STATUS.SKIPPED] } }
    const filterWhere = mode === "all" ? baseWhere : mode === "unprocessed" ? unprocessedWhere : skippedWhere

    const [filteredCount, template, students] = await Promise.all([
      prisma.student.count({ where: filterWhere }),
      classId ? getTemplateForClass(classId) : getDefaultTemplate(params.id),
      prisma.student.findMany({
        where: filterWhere,
        select: {
          id: true,
          serialNumber: true,
          photoPath: true,
          photoUrl: true,
          formData: true,
        },
        orderBy: { submittedAt: "asc" },
        take: MAX_STUDENTS_LIST,
      }),
    ])

    const studentList = students.map((s) => {
      const fd = (s.formData || {}) as Record<string, string>
      const withUrl = withStudentPhotoUrl(s)
      return {
        id: s.id,
        serialNumber: s.serialNumber,
        photoUrl: withUrl.photoUrl,
        name: fd.fullName || fd["Full Name"] || fd["Student Name"] || s.serialNumber,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        skippedCount: filteredCount,
        bgColor: template?.photoBgColor || "#FFFFFF",
        clientAiAvailable: true,
        students: studentList,
      },
    })
  } catch (error) {
    console.error("GET reprocess-photos error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

/** Legacy endpoint — batch processing now runs client-side on the manufacturer PC. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "Use client-side AI processing in the manufacturer dashboard.",
        schoolId: params.id,
      },
    })
  } catch (error) {
    console.error("POST reprocess-photos error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
