import { prisma } from "@/lib/prisma"
import { storageDownload } from "@/lib/storage"
import JSZip from "jszip"
import { csvCell } from "@/lib/spreadsheet-safety"
import { reportError } from "@/lib/observability"
import type { ExportArchivePayload } from "../types"
import { EXPORT_BUCKET, EXPORT_PREFIX } from "../types"
import { buildStudentExportEntry } from "@/lib/export/build-student-export-entry"
import { mapWithConcurrency } from "@/lib/export/concurrency"
import {
  EXPORT_DB_PAGE_SIZE,
  EXPORT_MAX_WARNINGS,
  EXPORT_PHOTO_CONCURRENCY,
} from "@/lib/export/constants"
import { uploadExportZip } from "@/lib/export/zip-upload"
import {
  buildStudentExcelBuffer,
  PhotoFileNameAllocator,
  safeExportFileName,
  STUDENT_EXPORT_HEADERS,
  type StudentPhotoMapping,
} from "@/lib/export/student-export"

type PhotoTask = {
  zipPath: string
  storagePath: string
  mapping: StudentPhotoMapping
  label: string
}

const STUDENT_SELECT = {
  id: true,
  serialNumber: true,
  status: true,
  formData: true,
  photoPath: true,
  photoUrl: true,
  qrCodeUrl: true,
  submittedAt: true,
  updatedAt: true,
  class: { select: { name: true } },
} as const

function pushWarning(warnings: string[], message: string) {
  if (warnings.length < EXPORT_MAX_WARNINGS) warnings.push(message)
}

async function addStorageFile(
  zip: JSZip,
  zipPath: string,
  storagePath: string,
  warnings: string[]
) {
  const { data, error } = await storageDownload(EXPORT_BUCKET, storagePath)
  if (!error && data) {
    zip.file(zipPath, data, { binary: true, compression: "STORE" })
    return true
  }

  pushWarning(warnings, `Missing storage file: ${storagePath}`)
  return false
}

export async function processExportArchive(
  jobId: string,
  schoolId: string,
  payload: ExportArchivePayload
) {
  const { classId, status, includePhotos, maxStudents, format = "archive" } = payload
  const isExcelExport = format === "excel"
  const startedAt = Date.now()

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: isExcelExport
      ? { id: true, name: true, address: true }
      : {
          id: true,
          name: true,
          address: true,
          contactEmail: true,
          templates: { orderBy: { createdAt: "asc" as const }, take: 1 },
          classes: { select: { id: true, name: true } },
        },
  })

  if (!school) throw new Error("School not found")

  const where: Record<string, unknown> = { schoolId: school.id }
  if (classId) where.classId = classId
  if (status) where.status = status

  const totalStudents = await prisma.student.count({ where })
  if (totalStudents > maxStudents) {
    throw new Error(
      `Export too large (${totalStudents} students, max ${maxStudents}). Use class or status filters.`
    )
  }

  const zip = new JSZip()
  const studentsFolder = isExcelExport ? null : zip.folder("students")
  const photosFolder = zip.folder("photos")
  const qrFolder = isExcelExport ? null : zip.folder("qr")
  const printFolder = isExcelExport ? null : zip.folder("print")

  const manifest: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    format,
    school: { id: school.id, name: school.name },
    filters: { classId, status, includePhotos, maxStudents, format },
    counts: { students: 0, photosIncluded: 0, photosMissing: 0, qrIncluded: 0 },
    performance: {
      dbPageSize: EXPORT_DB_PAGE_SIZE,
      photoConcurrency: EXPORT_PHOTO_CONCURRENCY,
    },
    warnings: [] as string[],
  }

  const csvRows: string[] = [[...STUDENT_EXPORT_HEADERS].map(csvCell).join(",")]
  const excelRows: Array<{ row: unknown[]; photoUrl?: string | null }> = []
  const photoAllocator = new PhotoFileNameAllocator()
  const photoMappings: StudentPhotoMapping[] = []
  const completeRecords: Record<string, unknown>[] = []
  const photoTasks: PhotoTask[] = []

  let lastId: string | undefined
  let hasMore = true
  const allStudents: Record<string, unknown>[] = []

  while (hasMore) {
    const students = await prisma.student.findMany({
      where,
      select: STUDENT_SELECT,
      orderBy: { id: "asc" },
      take: EXPORT_DB_PAGE_SIZE,
      skip: lastId ? 1 : 0,
      ...(lastId ? { cursor: { id: lastId } } : {}),
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
        school.name,
        photoAllocator
      )

      csvRows.push(entry.row.map(csvCell).join(","))
      excelRows.push({ row: entry.row, photoUrl: student.photoUrl })
      photoMappings.push(entry.mapping)
      completeRecords.push(entry.completeRecord)

      allStudents.push({
        id: student.id,
        serialNumber: student.serialNumber,
        schoolName: school.name,
        className: student.class?.name || "",
        fullName: entry.fullName,
        status: student.status,
        formData: student.formData,
        photoUrl: student.photoUrl,
        photoPath: student.photoPath,
        photoFile: entry.photoFile,
        qrCodeUrl: student.qrCodeUrl,
        submittedAt: student.submittedAt,
        updatedAt: student.updatedAt,
      })

      if (includePhotos && student.photoPath && entry.photoFile) {
        photoTasks.push({
          zipPath: `photos/${entry.photoFile}`,
          storagePath: student.photoPath,
          mapping: entry.mapping,
          label: `${entry.fullName || student.serialNumber} (${student.serialNumber})`,
        })
      } else if (includePhotos && student.photoPath) {
        ;(manifest.counts as Record<string, number>).photosMissing++
        pushWarning(manifest.warnings as string[], `Photo not saved for ${entry.fullName || student.serialNumber}`)
      }

      if (!isExcelExport && student.qrCodeUrl) {
        qrFolder?.file(
          `${safeExportFileName(student.serialNumber)}.png`,
          JSON.stringify({ qrCodeUrl: student.qrCodeUrl }, null, 2)
        )
      }
    }

    lastId = students[students.length - 1].id
  }

  if (includePhotos && photosFolder && photoTasks.length > 0) {
    await mapWithConcurrency(photoTasks, EXPORT_PHOTO_CONCURRENCY, async (task) => {
      const { data, error } = await storageDownload(EXPORT_BUCKET, task.storagePath)
      if (!error && data) {
        photosFolder.file(task.mapping.photoFile, data, { binary: true, compression: "STORE" })
        task.mapping.photoSaved = true
        ;(manifest.counts as Record<string, number>).photosIncluded++
        return true
      }

      task.mapping.photoSaved = false
      ;(manifest.counts as Record<string, number>).photosMissing++
      pushWarning(manifest.warnings as string[], `Photo missing for ${task.label}: ${task.storagePath}`)
      return false
    })
  }

  ;(manifest.counts as Record<string, number>).students = allStudents.length

  if (isExcelExport) {
    const excelBuffer = await buildStudentExcelBuffer(school.name, excelRows, {
      exportDate: new Date().toLocaleDateString(),
      totalStudents: allStudents.length,
      schoolAddress: school.address,
    })
    zip.file(`${safeExportFileName(school.name)}-students.xlsx`, excelBuffer, {
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    })
    zip.file("students-complete.json", JSON.stringify(completeRecords, null, 2), {
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    })
    zip.file("photo-mapping.json", JSON.stringify(photoMappings, null, 2), {
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    })
    zip.file(
      "README.txt",
      [
        `${school.name} - Student Export`,
        `Students: ${allStudents.length}`,
        `Photos saved: ${(manifest.counts as Record<string, number>).photosIncluded}`,
        "",
        "Each photo is saved using the student's name.",
        "students-complete.json contains a full backup of every field.",
      ].join("\n"),
      { compression: "DEFLATE", compressionOptions: { level: 1 } }
    )
  } else {
    studentsFolder?.file("students.csv", csvRows.join("\n"), {
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    })
    studentsFolder?.file("students.json", JSON.stringify(allStudents), {
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    })
    zip.file(
      "school.json",
      JSON.stringify(
        {
          id: school.id,
          name: school.name,
          address: school.address,
          contactEmail: "contactEmail" in school ? school.contactEmail : undefined,
          classes: "classes" in school ? school.classes : undefined,
          template: "templates" in school ? (school.templates as any[])?.[0] : undefined,
        },
        null,
        2
      ),
      { compression: "DEFLATE", compressionOptions: { level: 1 } }
    )

    const latestBatch = await prisma.printBatch.findFirst({
      where: { schoolId: school.id },
      orderBy: { createdAt: "desc" },
      select: { frontPdfPath: true, backPdfPath: true, manifestPath: true },
    })

    if (latestBatch && printFolder) {
      const printFiles = [
        { name: "front.pdf", path: latestBatch.frontPdfPath },
        { name: "back.pdf", path: latestBatch.backPdfPath },
        { name: "manifest.csv", path: latestBatch.manifestPath },
      ]

      await mapWithConcurrency(printFiles, 3, async (file) => {
        if (!file.path) return false
        return addStorageFile(zip, `print/${file.name}`, file.path, manifest.warnings as string[])
      })
    }
  }

  ;(manifest.performance as Record<string, number>).durationMs = Date.now() - startedAt
  zip.file("manifest.json", JSON.stringify(manifest, null, 2), {
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  })

  const suffix = isExcelExport ? "excel-export" : "archive"
  const fileName = `${safeExportFileName(school.name)}-${suffix}-${new Date().toISOString().slice(0, 10)}.zip`
  const storagePath = `${EXPORT_PREFIX}/${schoolId}/${jobId}/${fileName}`
  const { bytes, error } = await uploadExportZip(EXPORT_BUCKET, storagePath, zip, jobId)

  if (error) {
    await reportError(error, {
      type: "EXPORT_FAILED",
      schoolId,
      message: "Failed to upload archive to storage",
      metadata: { storagePath, students: allStudents.length },
    })
    throw new Error(error?.message || "Failed to upload archive")
  }

  return {
    fileName,
    storagePath,
    bytes,
    format,
    students: allStudents.length,
    photosIncluded: (manifest.counts as Record<string, number>).photosIncluded,
    photosMissing: (manifest.counts as Record<string, number>).photosMissing,
    durationMs: (manifest.performance as Record<string, number>).durationMs,
  }
}
