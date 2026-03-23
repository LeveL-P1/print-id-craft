import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
    const classId = url.searchParams.get("classId")

    const where: any = { schoolId }
    if (classId) where.classId = classId

    const [students, school] = await Promise.all([
      prisma.student.findMany({
        where,
        include: { class: { select: { name: true } } },
        orderBy: { serialNumber: "asc" },
      }),
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true },
      }),
    ])

    // Build CSV
    const headers = "Serial Number,Full Name,Class,Roll No.,Date of Birth,Blood Group,Status,Submitted At"
    const rows = students.map((s) => {
      const fd = s.formData as any
      return [
        s.serialNumber,
        fd.fullName || "",
        s.class?.name || "",
        fd.rollNo || "",
        fd.dob || "",
        fd.bloodGroup || "",
        s.status,
        s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    })

    const csv = [headers, ...rows].join("\n")
    const dateStr = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${school?.name || "students"}-${dateStr}.csv"`,
      },
    })
  } catch (error) {
    console.error("Teacher CSV export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
