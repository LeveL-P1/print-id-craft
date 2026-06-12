import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { csvCell } from "@/lib/spreadsheet-safety"
import { buildStudentExportRow, STUDENT_EXPORT_HEADERS } from "@/lib/export/student-export"

export const maxDuration = 60; // Vercel function timeout config

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { name: true },
    })

    const stream = new ReadableStream({
      async start(controller) {
        const headers = [...STUDENT_EXPORT_HEADERS].map(csvCell).join(",");
        controller.enqueue(new TextEncoder().encode(headers + "\n"));

        let lastId: string | undefined = undefined;
        let hasMore = true;

        while (hasMore) {
          const students: any[] = await prisma.student.findMany({
            where,
            include: { class: { select: { name: true } } },
            orderBy: { id: "asc" },
            take: 500,
            skip: lastId ? 1 : 0,
            ...(lastId ? { cursor: { id: lastId } } : {}),
          });

          if (students.length === 0) {
            hasMore = false;
            break;
          }

          const rows = students.map((s) => {
            const fd = (s.formData || {}) as Record<string, string>
            return buildStudentExportRow(
              {
                id: s.id,
                serialNumber: s.serialNumber,
                status: s.status,
                formData: fd,
                className: s.class?.name || "",
                schoolName: school?.name || "",
                photoPath: s.photoPath,
                photoUrl: s.photoUrl,
                submittedAt: s.submittedAt,
              },
              ""
            ).map(csvCell).join(",")
          }).join("\n");

          controller.enqueue(new TextEncoder().encode(rows + "\n"));
          lastId = students[students.length - 1].id;
        }

        controller.close();
      }
    });

    return new NextResponse(stream, {
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
