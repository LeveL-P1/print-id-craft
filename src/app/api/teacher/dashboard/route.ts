import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getDefaultTemplate } from "@/lib/template-resolver"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isMainTeacher: true, classId: true, schoolId: true }
    })

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const schoolId = currentUser.schoolId
    if (!schoolId) {
        return NextResponse.json({ error: "No school assigned to this teacher yet." }, { status: 400 })
    }

    const isMainTeacher = !!currentUser.isMainTeacher
    const assignedClassId = currentUser.classId

    // Parse pagination params
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get("limit") || "100")))
    const skip = (page - 1) * limit

    // Build student filter — class teacher sees only their class
    const studentWhere: any = { schoolId: schoolId as string }
    if (!isMainTeacher && assignedClassId) {
      studentWhere.classId = assignedClassId
    }

    // Warm the DB connection to prevent cold-start pool exhaustion
    await prisma.$connect()

    // Run all queries in parallel — each wrapped individually so one failure
    // doesn't zero-out the entire dashboard (root cause of "0 values" bug)
    const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn() } catch (e) { console.error("Dashboard query failed:", e); return fallback }
    }

    const [school, classes, students, totalCount, statusCounts, template] = await Promise.all([
      safeQuery(() => prisma.school.findUnique({
        where: { id: schoolId as string },
        select: { name: true, logoUrl: true },
      }), null),
      // Main teacher sees all classes; class teacher sees only their class
      safeQuery(() => prisma.class.findMany({
        where: isMainTeacher
          ? { schoolId: schoolId as string }
          : assignedClassId
            ? { id: assignedClassId as string }
            : { schoolId: schoolId as string },
        include: {
          _count: { select: { students: true } },
          teachers: {
            where: { role: "TEACHER" },
            select: { id: true, name: true, email: true, isMainTeacher: true },
          },
        },
        orderBy: { name: "asc" },
      }), []),
      // Paginated student list — only select needed fields
      safeQuery(() => prisma.student.findMany({
        where: studentWhere,
        select: {
          id: true,
          serialNumber: true,
          photoUrl: true,
          photoPath: true,
          formData: true,
          status: true,
          flagNote: true,
          teacherComment: true,
          submittedAt: true,
          class: { select: { name: true, linkToken: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: limit,
        skip,
      }), []),
      // Total count for pagination
      safeQuery(() => prisma.student.count({ where: studentWhere }), 0),
      // DB-level aggregation for stats
      safeQuery(() => prisma.student.groupBy({
        by: ["status"],
        where: studentWhere,
        _count: { status: true },
      }), []),
      // Include template meta for card preview in modal
      safeQuery(() => getDefaultTemplate(schoolId as string), null)
    ])

    // Build stats from groupBy result
    const statsMap: Record<string, number> = {}
    for (const item of statusCounts) {
      statsMap[item.status] = item._count.status
    }
    const stats = {
      total: totalCount,
      submitted: statsMap["SUBMITTED"] || 0,
      approved: statsMap["APPROVED"] || 0,
      flagged: statsMap["FLAGGED"] || 0,
      pending: statsMap["PENDING"] || 0,
      printed: statsMap["PRINTED"] || 0,
    }

    const response = NextResponse.json({
      success: true,
      data: {
        school,
        classes,
        students: students.map(withStudentPhotoUrl),
        stats,
        template,
        isMainTeacher,
        assignedClassId,
      },
      pagination: { page, limit, total: totalCount, pages: Math.ceil(totalCount / limit) },
    })

    response.headers.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate")
    return response
  } catch (error) {
    console.error("Teacher dashboard error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
