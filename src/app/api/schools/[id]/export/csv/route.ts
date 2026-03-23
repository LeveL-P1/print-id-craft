import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    // Manufacturer can export any school; Teacher can only export their own
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

    const where: any = { schoolId: params.id }
    if (classId) where.classId = classId
    if (status) where.status = status

    const students = await prisma.student.findMany({
      where,
      include: { class: { select: { name: true } } },
      orderBy: { serialNumber: "asc" },
    })

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { name: true },
    })

    // Build CSV
    const headers = "Serial Number,Full Name,Class,Roll No.,Date of Birth,Blood Group,Father Name,Mother Name,Phone,Address,Status,Submitted At"
    const rows = students.map((s) => {
      const fd = s.formData as any
      return [
        s.serialNumber,
        fd.fullName || "",
        s.class?.name || "",
        fd.rollNo || "",
        fd.dob || "",
        fd.bloodGroup || "",
        fd.fatherName || "",
        fd.motherName || "",
        fd.phone || "",
        fd.address || "",
        s.status,
        s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    })

    const csv = [headers, ...rows].join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${school?.name || "students"}-export.csv"`,
      },
    })
  } catch (error) {
    console.error("CSV export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
