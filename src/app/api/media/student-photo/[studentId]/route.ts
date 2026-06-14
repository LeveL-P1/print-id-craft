import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageDownload } from "@/lib/storage"

export const dynamic = "force-dynamic"

const BUCKET = "student-photos"

function contentTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase()
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  return "image/jpeg"
}

export async function GET(_req: Request, props: { params: Promise<{ studentId: string }> }) {
  const params = await props.params
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

  if (!student.photoPath) {
    if (student.photoUrl) {
      return NextResponse.redirect(student.photoUrl)
    }
    return NextResponse.json({ error: "Photo not found" }, { status: 404 })
  }

  const { data, error } = await storageDownload(BUCKET, student.photoPath)
  if (error || !data) {
    return NextResponse.json({ error: "Photo download failed" }, { status: 500 })
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentTypeFromPath(student.photoPath),
      "Cache-Control": "private, max-age=300",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  })
}
