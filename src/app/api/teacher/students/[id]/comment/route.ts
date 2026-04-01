import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// PUT — Update teacher comment on a student
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    const studentId = params.id
    const { teacherComment } = await req.json()

    // Verify student belongs to teacher's school (and class if sub-teacher)
    const whereClause: any = { id: studentId, schoolId }
    if (!session.user.isMainTeacher && session.user.classId) {
      whereClause.classId = session.user.classId
    }

    const student = await prisma.student.findFirst({ where: whereClause })
    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 })
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { teacherComment: teacherComment || null },
      select: { id: true, teacherComment: true },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error("PUT /api/teacher/students/[id]/comment error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
