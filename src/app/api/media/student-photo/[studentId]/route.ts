import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageSignedUrl } from "@/lib/storage"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: { studentId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: { id: true, schoolId: true, classId: true, photoPath: true, photoUrl: true },
  })

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (session.user.role === "TEACHER") {
    if (session.user.schoolId !== student.schoolId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!session.user.isMainTeacher && session.user.classId && session.user.classId !== student.classId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  } else if (session.user.role !== "MANUFACTURER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!student.photoPath && student.photoUrl) {
    return NextResponse.redirect(student.photoUrl)
  }
  if (!student.photoPath) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 })
  }

  const url = await storageSignedUrl("student-photos", student.photoPath, 60 * 10)
  return NextResponse.redirect(url)
}
