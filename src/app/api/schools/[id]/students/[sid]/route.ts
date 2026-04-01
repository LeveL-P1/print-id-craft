import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Both manufacturer and teacher can view students
    const role = session.user?.role
    if (role !== "MANUFACTURER" && role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const student = await prisma.student.findFirst({
      where: { id: params.sid, schoolId: params.id },
      include: { class: { select: { name: true } } },
    })

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 })
    }

    // Class teacher can only see students in their class
    if (role === "TEACHER" && !session.user.isMainTeacher && session.user.classId) {
      if (student.classId !== session.user.classId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }
    }

    return NextResponse.json({ success: true, data: student })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; sid: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = session.user?.role
    if (role !== "MANUFACTURER" && role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check teacher access to this student
    if (role === "TEACHER" && !session.user.isMainTeacher && session.user.classId) {
      const student = await prisma.student.findFirst({
        where: { id: params.sid, schoolId: params.id },
        select: { classId: true },
      })
      if (!student || student.classId !== session.user.classId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }
    }

    const body = await req.json()
    const { formData, photoUrl, teacherComment, status } = body

    // Build update object
    const updateData: any = {}
    if (formData) updateData.formData = formData
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl
    if (teacherComment !== undefined) updateData.teacherComment = teacherComment
    if (status) updateData.status = status

    const student = await prisma.student.update({
      where: { id: params.sid },
      data: updateData,
      include: { class: { select: { name: true } } },
    })

    return NextResponse.json({ success: true, data: student })
  } catch (error: any) {
    console.error("Update student error:", error)
    return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 })
  }
}
