import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageUpload, storagePublicUrl, ensureBucket } from "@/lib/storage"

const BUCKET = "student-photos"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id
    const formData = await req.formData()
    const studentId = formData.get("studentId") as string
    const photo = formData.get("photo") as File | null

    if (!studentId) {
      return NextResponse.json({ error: "Student ID is required" }, { status: 400 })
    }

    // Verify student belongs to this school
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId },
    })

    if (!student) {
      return NextResponse.json({ error: "Student not found in this school" }, { status: 404 })
    }

    if (!photo) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 })
    }

    // Ensure bucket exists
    await ensureBucket(BUCKET)

    // Upload photo
    const arrayBuffer = await photo.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = photo.name.split(".").pop()?.toLowerCase() || "jpg"
    const filePath = `students/${schoolId}/${student.id}.${ext}`

    const { error: uploadError } = await storageUpload(BUCKET, filePath, buffer, {
      contentType: photo.type,
      upsert: true,
    })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const publicUrl = storagePublicUrl(BUCKET, filePath)

    // Update student record
    await prisma.student.update({
      where: { id: student.id },
      data: { photoUrl: publicUrl },
    })

    const fd = student.formData as Record<string, string>

    return NextResponse.json({
      success: true,
      data: {
        studentId: student.id,
        studentName: fd?.fullName || fd?.["Full Name"] || fd?.["Student Name"] || "Unknown",
        serialNumber: student.serialNumber,
        photoUrl: publicUrl,
      },
    })
  } catch (error: any) {
    console.error("Assign photo error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
