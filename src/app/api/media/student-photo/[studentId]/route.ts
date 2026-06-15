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

function safeFilePart(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "student"
}

export async function GET(req: Request, props: { params: Promise<{ studentId: string }> }) {
  const params = await props.params
  const searchParams = new URL(req.url).searchParams
  const forceDownload = searchParams.get("download") === "1"
  const variant = searchParams.get("variant") === "original" ? "original" : "current"
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const student = await prisma.student.findUnique({
    where: { id: params.studentId },
    select: {
      id: true,
      schoolId: true,
      classId: true,
      serialNumber: true,
      photoPath: true,
      photoUrl: true,
      originalPhotoPath: true,
      originalPhotoUrl: true,
      formData: true,
    },
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

  const selectedPath = variant === "original"
    ? student.originalPhotoPath || student.photoPath
    : student.photoPath
  const selectedUrl = variant === "original"
    ? student.originalPhotoUrl || student.photoUrl
    : student.photoUrl

  if (!selectedPath) {
    if (selectedUrl) {
      return NextResponse.redirect(selectedUrl)
    }
    return NextResponse.json({ error: "Photo not found" }, { status: 404 })
  }

  const { data, error } = await storageDownload(BUCKET, selectedPath)
  if (error || !data) {
    return NextResponse.json({ error: "Photo download failed" }, { status: 500 })
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentTypeFromPath(selectedPath),
      "Cache-Control": "private, max-age=0, must-revalidate",
      "Cross-Origin-Resource-Policy": "same-origin",
      ...(forceDownload ? {
        "Content-Disposition": `attachment; filename="${safeFilePart(student.serialNumber)}-${safeFilePart(
          ((student.formData as Record<string, string> | null)?.fullName ||
            (student.formData as Record<string, string> | null)?.["Full Name"] ||
            (student.formData as Record<string, string> | null)?.["Student Name"] ||
            "photo").toString()
        )}-${variant}.${selectedPath.split(".").pop()?.toLowerCase() || "jpg"}"`,
      } : {}),
    },
  })
}
