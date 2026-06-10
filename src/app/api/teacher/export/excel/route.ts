import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildExcelBuffer, columnWidthsFromRows } from "@/lib/excel"

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

    const where: Record<string, unknown> = { schoolId }
    if (classId) where.classId = classId

    const [students, school, classes] = await Promise.all([
      prisma.student.findMany({
        where,
        include: { class: { select: { name: true } } },
        orderBy: { serialNumber: "asc" },
      }),
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true },
      }),
      prisma.class.findMany({
        where: { schoolId },
        orderBy: { name: "asc" },
      }),
    ])

    const wsData: unknown[][] = [
      [school?.name || "School Export"],
      [`Export Date: ${new Date().toLocaleDateString()}`],
      [`Total Students: ${students.length}`],
      [],
      [
        "Serial Number",
        "Full Name",
        "Class",
        "Roll No.",
        "Date of Birth",
        "Blood Group",
        "Father Name",
        "Mother Name",
        "Phone",
        "Address",
        "Status",
        "Submitted At",
      ],
    ]

    students.forEach((s) => {
      const fd = s.formData as Record<string, string>
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

    const summaryData: unknown[][] = [
      ["Class Summary"],
      [],
      ["Class Name", "Total Students", "Submitted", "Approved", "Flagged", "Pending", "Printed"],
    ]

    classes.forEach((c) => {
      const classStudents = students.filter((s) => s.class?.name === c.name)
      summaryData.push([
        c.name,
        classStudents.length,
        classStudents.filter((s) => s.status === "SUBMITTED").length,
        classStudents.filter((s) => s.status === "APPROVED").length,
        classStudents.filter((s) => s.status === "FLAGGED").length,
        classStudents.filter((s) => s.status === "PENDING").length,
        classStudents.filter((s) => s.status === "PRINTED").length,
      ])
    })

    const buffer = await buildExcelBuffer([
      {
        name: "Students",
        rows: wsData,
        columnWidths: columnWidthsFromRows(wsData, 4),
      },
      {
        name: "Class Summary",
        rows: summaryData,
        columnWidths: columnWidthsFromRows(summaryData, 2),
      },
    ])

    const dateStr = new Date().toISOString().slice(0, 10)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${school?.name || "students"}-${dateStr}.xlsx"`,
      },
    })
  } catch (error) {
    console.error("Teacher Excel export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
