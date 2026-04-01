import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
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
      where.OR = [
        { serialNumber: { contains: q, mode: "insensitive" } },
        { formData: { path: ["fullName"], string_contains: q } },
        { formData: { path: ["Full Name"], string_contains: q } },
        { formData: { path: ["Student Name"], string_contains: q } },
        { formData: { path: ["Student_Name"], string_contains: q } },
        { formData: { path: ["name"], string_contains: q } },
      ]
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        select: {
          id: true,
          serialNumber: true,
          photoUrl: true,
          formData: true,
          status: true,
          flagNote: true,
          teacherComment: true,
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
      data: students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })

    // Cache for 5 seconds, serve stale for 10s while revalidating
    response.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=10")
    return response
  } catch (error) {
    console.error("GET students error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
