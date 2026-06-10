import { prisma } from "@/lib/prisma"
import { storageDownload, storageUpload } from "@/lib/storage"
import JSZip from "jszip"
import { csvCell } from "@/lib/spreadsheet-safety"
import { reportError } from "@/lib/observability"
import type { ExportArchivePayload } from "../types"
import { EXPORT_BUCKET, EXPORT_PREFIX } from "../types"

function safeName(value: string): string {
  return (value || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file"
}

function extFromPath(path: string, fallback = "jpg"): string {
  const ext = path.split(".").pop()?.toLowerCase()
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback
}

async function addStorageFile(zip: JSZip, zipPath: string, storagePath?: string | null) {
  if (!storagePath) return false
  const { data, error } = await storageDownload(EXPORT_BUCKET, storagePath)
  if (error || !data) return false
  zip.file(zipPath, data)
  return true
}

export async function processExportArchive(jobId: string, schoolId: string, payload: ExportArchivePayload) {
  const { classId, status, includePhotos, maxStudents } = payload

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      template: true,
      classes: { select: { id: true, name: true } },
    },
  })

  if (!school) {
    throw new Error("School not found")
  }

  const where: Record<string, unknown> = { schoolId: school.id }
  if (classId) where.classId = classId
  if (status) where.status = status

  const totalStudents = await prisma.student.count({ where })
  if (totalStudents > maxStudents) {
    throw new Error(
      `Archive too large (${totalStudents} students, max ${maxStudents}). Use filters or photos=false.`
    )
  }

  const zip = new JSZip()
  const studentsFolder = zip.folder("students")
  const photosFolder = zip.folder("photos")
  const qrFolder = zip.folder("qr")
  const printFolder = zip.folder("print")

  const manifest: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    school: { id: school.id, name: school.name },
    filters: { classId, status, includePhotos, maxStudents },
    counts: { students: 0, photosIncluded: 0, photosMissing: 0, qrIncluded: 0 },
    warnings: [] as string[],
  }

  const csvRows: string[] = [
    [
      "Serial Number",
      "Full Name",
      "Class",
      "Roll No.",
      "Status",
      "Photo File",
      "Photo Path",
      "Photo URL",
      "Submitted At",
    ].map(csvCell).join(","),
  ]

  let lastId: string | undefined
  let hasMore = true
  const allStudents: Record<string, unknown>[] = []
  const warnings = manifest.warnings as string[]

  while (hasMore) {
    const students = await prisma.student.findMany({
      where,
      include: { class: { select: { id: true, name: true } } },
      orderBy: { id: "asc" },
      take: 250,
      skip: lastId ? 1 : 0,
      ...(lastId ? { cursor: { id: lastId } } : {}),
    })

    if (students.length === 0) {
      hasMore = false
      break
    }

    for (const student of students) {
      const fd = (student.formData || {}) as Record<string, string>
      const fullName = fd.fullName || fd["Full Name"] || fd["Student Name"] || fd.name || ""
      const photoFile = student.photoPath
        ? `${safeName(student.serialNumber)}_${safeName(fullName || student.id)}.${extFromPath(student.photoPath)}`
        : ""

      csvRows.push([
        student.serialNumber,
        fullName,
        student.class?.name || "",
        fd.rollNo || fd["Roll No."] || fd.roll || "",
        student.status,
        photoFile,
        student.photoPath || "",
        student.photoUrl || "",
        student.submittedAt ? new Date(student.submittedAt).toISOString() : "",
      ].map(csvCell).join(","))

      allStudents.push({
        id: student.id,
        serialNumber: student.serialNumber,
        className: student.class?.name || "",
        status: student.status,
        formData: student.formData,
        photoUrl: student.photoUrl,
        photoPath: student.photoPath,
        photoFile,
        qrCodeUrl: student.qrCodeUrl,
        submittedAt: student.submittedAt,
        updatedAt: student.updatedAt,
      })

      if (includePhotos && student.photoPath && photosFolder) {
        const ok = await addStorageFile(photosFolder, photoFile, student.photoPath)
        if (ok) (manifest.counts as Record<string, number>).photosIncluded++
        else {
          ;(manifest.counts as Record<string, number>).photosMissing++
          warnings.push(`Missing photo for ${student.serialNumber}: ${student.photoPath}`)
        }
      } else if (includePhotos) {
        ;(manifest.counts as Record<string, number>).photosMissing++
      }

      const qrPath = `students/${school.id}/qr/${student.id}.png`
      if (qrFolder && (await addStorageFile(qrFolder, `${safeName(student.serialNumber)}.png`, qrPath))) {
        ;(manifest.counts as Record<string, number>).qrIncluded++
      }
    }

    lastId = students[students.length - 1].id
  }

  ;(manifest.counts as Record<string, number>).students = allStudents.length

  studentsFolder?.file("students.csv", csvRows.join("\n"))
  studentsFolder?.file("students.json", JSON.stringify(allStudents, null, 2))
  zip.file(
    "school.json",
    JSON.stringify(
      {
        id: school.id,
        name: school.name,
        address: school.address,
        contactEmail: school.contactEmail,
        classes: school.classes,
        template: school.template,
      },
      null,
      2
    )
  )

  const latestBatch = await prisma.printBatch.findFirst({
    where: { schoolId: school.id },
    orderBy: { createdAt: "desc" },
  })

  if (latestBatch && printFolder) {
    await addStorageFile(printFolder, "front.pdf", latestBatch.frontPdfPath)
    await addStorageFile(printFolder, "back.pdf", latestBatch.backPdfPath)
    await addStorageFile(printFolder, "manifest.csv", latestBatch.manifestPath)
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2))

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  const fileName = `${safeName(school.name)}-archive-${new Date().toISOString().slice(0, 10)}.zip`
  const storagePath = `${EXPORT_PREFIX}/${schoolId}/${jobId}/${fileName}`

  const { error } = await storageUpload(EXPORT_BUCKET, storagePath, buffer, {
    contentType: "application/zip",
    upsert: true,
  })

  if (error) {
    await reportError(error, {
      type: "EXPORT_FAILED",
      schoolId,
      message: "Failed to upload archive to storage",
      metadata: { storagePath },
    })
    throw new Error(error?.message || "Failed to upload archive")
  }

  return {
    fileName,
    storagePath,
    bytes: buffer.length,
    students: (manifest.counts as Record<string, number>).students,
    photosIncluded: (manifest.counts as Record<string, number>).photosIncluded,
    photosMissing: (manifest.counts as Record<string, number>).photosMissing,
  }
}
