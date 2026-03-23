import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

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

    const [students, school] = await Promise.all([
      prisma.student.findMany({
        where,
        include: { class: { select: { name: true } } },
        orderBy: { serialNumber: "asc" },
      }),
      prisma.school.findUnique({
        where: { id: params.id },
        select: { name: true },
      }),
    ])

    // Build worksheet data
    const wsData: any[][] = [
      [school?.name || "School Export"],
      [`Export Date: ${new Date().toLocaleDateString()}`],
      [],
      ["Serial Number", "Full Name", "Class", "Roll No.", "Date of Birth", "Blood Group", "Father Name", "Mother Name", "Phone", "Address", "Status", "Submitted At"],
    ]

    students.forEach((s) => {
      const fd = s.formData as any
      wsData.push([
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
      ])
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Auto column widths
    const colWidths = wsData[3].map((header: string, i: number) => {
      const maxLen = Math.max(
        header.length,
        ...wsData.slice(4).map((row) => String(row[i] || "").length)
      )
      return { wch: Math.min(maxLen + 2, 40) }
    })
    ws["!cols"] = colWidths

    // Bold headers (row 4)
    // XLSX doesn't support styling in community edition, but column widths work

    XLSX.utils.book_append_sheet(wb, ws, "Students")
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${school?.name || "students"}-export.xlsx"`,
      },
    })
  } catch (error) {
    console.error("Excel export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
