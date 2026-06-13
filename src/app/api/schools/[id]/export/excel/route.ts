import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageDownload } from "@/lib/storage"
import JSZip from "jszip"
import { buildStudentExportEntry } from "@/lib/export/build-student-export-entry"
import {
  buildStudentExcelBuffer,
  PhotoFileNameAllocator,
  safeExportFileName,
  type StudentPhotoMapping,
} from "@/lib/export/student-export"
import { EXPORT_BUCKET } from "@/lib/jobs/types"

export const maxDuration = 60

const SYNC_STUDENT_LIMIT = 400

async function addPhotoToZip(zip: JSZip, zipPath: string, storagePath: string) {
  const { data, error } = await storageDownload(EXPORT_BUCKET, storagePath)
  if (error || !data) return false
  zip.file(zipPath, data)
  return true
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
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

    const where: Record<string, unknown> = { schoolId: params.id }
    if (classId) where.classId = classId
    if (status) where.status = status

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      select: { name: true, address: true },
    })

    const totalStudents = await prisma.student.count({ where })
    if (totalStudents > SYNC_STUDENT_LIMIT) {
      return NextResponse.json(
        {
          error: "Export too large for direct download",
          totalStudents,
          maxStudents: SYNC_STUDENT_LIMIT,
          hint: "Use the Export tab Download Excel button, which prepares a zip with mapped data and photos.",
        },
        { status: 413 }
      )
    }

    const zip = new JSZip()
    const photosFolder = zip.folder("photos")
    const excelRows: Array<{ row: unknown[]; photoUrl?: string | null }> = []
    const photoAllocator = new PhotoFileNameAllocator()
    const photoMappings: StudentPhotoMapping[] = []
    const completeRecords: Record<string, unknown>[] = []
    let photosIncluded = 0
    let photosMissing = 0

    let cursor: string | undefined
    let hasMore = true

    while (hasMore) {
      const students = await prisma.student.findMany({
        where,
        include: { class: { select: { name: true } } },
        orderBy: { id: "asc" },
        take: 250,
        skip: cursor ? 1 : 0,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      })

      if (students.length === 0) {
        hasMore = false
        break
      }

      for (const student of students) {
        const entry = buildStudentExportEntry(
          {
            ...student,
            formData: (student.formData || {}) as Record<string, string>,
          },
          school?.name || "",
          photoAllocator
        )

        excelRows.push({ row: entry.row, photoUrl: student.photoUrl })
        photoMappings.push(entry.mapping)
        completeRecords.push(entry.completeRecord)

        if (student.photoPath && photosFolder && entry.photoFile) {
          const ok = await addPhotoToZip(photosFolder, entry.photoFile, student.photoPath)
          entry.mapping.photoSaved = ok
          if (ok) photosIncluded++
          else photosMissing++
        } else if (student.photoPath) {
          photosMissing++
        }
      }

      cursor = students[students.length - 1].id
    }

    const excelBuffer = await buildStudentExcelBuffer(school?.name || "School Export", excelRows, {
      exportDate: new Date().toLocaleDateString(),
      totalStudents: excelRows.length,
      schoolAddress: school?.address,
    })

    zip.file(`${safeExportFileName(school?.name || "students")}-students.xlsx`, excelBuffer)
    zip.file("students-complete.json", JSON.stringify(completeRecords, null, 2))
    zip.file("photo-mapping.json", JSON.stringify(photoMappings, null, 2))
    zip.file(
      "README.txt",
      [
        `${school?.name || "School"} — Student Export`,
        "",
        "Contents:",
        `- ${safeExportFileName(school?.name || "students")}-students.xlsx`,
        `- photos/ (${photosIncluded} saved by student name${photosMissing ? `, ${photosMissing} missing` : ""})`,
        "- students-complete.json — full data backup",
        "- photo-mapping.json — name-to-photo verification",
        "",
        "Each photo is saved using the student's name only (e.g. Rahul Kumar.jpg).",
      ].join("\n")
    )

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })

    const fileName = `${safeExportFileName(school?.name || "students")}-excel-export-${new Date().toISOString().slice(0, 10)}.zip`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error("Excel export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
