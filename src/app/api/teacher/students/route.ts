import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withStudentPhotoUrl } from "@/lib/student-photo-url"
import { normalizeFormValue } from "@/lib/field-resolver"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200)
    const search = url.searchParams.get("search")
    const classId = url.searchParams.get("classId")

    const where: any = { schoolId }
    if (classId) where.classId = classId
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
          formData: true,
          status: true,
          flagNote: true,
          submittedAt: true,
          class: { select: { name: true } },
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
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
    response.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
    return response
  } catch (error) {
    console.error("GET teacher students error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
