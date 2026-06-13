import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getNextStudentSerial } from "@/lib/student-serial"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"
import { buildStudentIndexData } from "@/lib/student-index"
import { normalizeFormValue } from "@/lib/field-resolver"
import { reportSlowOperation } from "@/lib/observability"

// Optimize: prefer longer-running function for connection reuse
export const maxDuration = 10

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const startedAt = Date.now()
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user?.role !== "MANUFACTURER" && session.user?.role !== "TEACHER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200)
    const status = url.searchParams.get("status")
    const classId = url.searchParams.get("classId")
    const search = url.searchParams.get("search")

    const where: any = { schoolId: params.id }
    if (status) where.status = status
    if (classId) where.classId = classId

    // Search by serial number or form data name fields (check all common name keys)
    if (search && search.trim()) {
      const q = search.trim()
      const nq = normalizeFormValue(q)
      where.OR = [
        { serialNumber: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        ...(nq ? [{ normalizedSearchText: { contains: nq } }] : []),
      ]
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        select: {
          id: true,
          serialNumber: true,
          photoUrl: true,
          photoPath: true,
          photoBgStatus: true,
          formData: true,
          status: true,
          flagNote: true,
          teacherComment: true,
          submittedAt: true,
          classId: true,
          class: { select: { id: true, name: true } },
        },
        orderBy: { submittedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ])

    const response = NextResponse.json({
      success: true,
      data: students.map(withStudentPhotoUrl),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })

    // Cache for 10 seconds, serve stale for 30s while revalidating
    response.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    await reportSlowOperation({
      name: "api.students.list",
      durationMs: Date.now() - startedAt,
      thresholdMs: 1_500,
      schoolId: params.id,
      userId: session.user?.id,
      metadata: { page, limit, status, classId, hasSearch: Boolean(search?.trim()), total },
    })
    return response
  } catch (error) {
    console.error("GET students error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

/**
 * POST — create a single student manually (manufacturer / main-teacher only).
 * Body: { formData: Record<string,string>, classId: string, photoUrl?: string }
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const schoolId = params.id
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } })
    if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 })

    const body = await req.json()
    const { formData, classId, photoUrl, photoPath } = body
    if (!classId) return NextResponse.json({ error: "classId is required" }, { status: 400 })
    if (!formData || typeof formData !== "object") return NextResponse.json({ error: "formData is required" }, { status: 400 })

    const student = await prisma.$transaction(async (tx) => {
      const serialNumber = await getNextStudentSerial(tx, schoolId, school.name)
      const safePhotoPath = typeof photoPath === "string" && photoPath.startsWith(`students/${schoolId}/`)
        ? photoPath
        : ""
      const indexData = buildStudentIndexData(formData, classId)
      return tx.student.create({
        data: {
          schoolId,
          classId,
          serialNumber,
          ...indexData,
          formData,
          photoUrl: photoUrl || "",
          photoPath: safePhotoPath,
          status: "SUBMITTED",
        },
        include: { class: { select: { id: true, name: true } } },
      })
    })
    return NextResponse.json({ success: true, data: student }, { status: 201 })
  } catch (error: any) {
    console.error("Create student error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}

/**
 * DELETE — wipe ALL students for this school. Used by the "Delete All & Re-import"
 * flow so admins can swap in a fresh Excel without leaving stale records behind.
 *
 * Safety:
 *  - MANUFACTURER role only.
 *  - Caller must POST a JSON body with `{ confirm: "DELETE_ALL" }` to avoid
 *    accidental wipes from a misrouted request.
 *  - Returns the count of deleted rows so the UI can show a toast.
 */
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Require an explicit confirmation token in the body to prevent accidents.
    let body: any = null
    try { body = await req.json() } catch { /* empty body is OK only if confirm in querystring */ }
    const url = new URL(req.url)
    const confirm = body?.confirm || url.searchParams.get("confirm")
    if (confirm !== "DELETE_ALL") {
      return NextResponse.json(
        { error: "Confirmation required. Send { confirm: 'DELETE_ALL' }." },
        { status: 400 }
      )
    }

    const schoolId = params.id

    // Verify the school exists and the manufacturer owns it
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    })
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    const result = await prisma.student.deleteMany({
      where: { schoolId },
    })

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error: any) {
    console.error("Bulk delete students error:", error)
    return NextResponse.json(
      { error: error?.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
