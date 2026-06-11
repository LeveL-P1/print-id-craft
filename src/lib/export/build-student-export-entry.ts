import {
  buildStudentExportRow,
  buildStudentPhotoFileName,
  getStudentFullName,
  PhotoFileNameAllocator,
  type StudentExportRecord,
  type StudentPhotoMapping,
} from "./student-export"

type StudentInput = {
  id: string
  serialNumber: string
  status: string
  formData: Record<string, string>
  class?: { name: string } | null
  photoPath?: string | null
  photoUrl?: string | null
  submittedAt?: Date | null
}

export function buildStudentExportEntry(
  student: StudentInput,
  schoolName: string,
  photoAllocator: PhotoFileNameAllocator
) {
  const fd = student.formData || {}
  const fullName = getStudentFullName(fd)
  const photoFile = buildStudentPhotoFileName(
    student.serialNumber,
    fullName,
    student.id,
    student.photoPath || "",
    photoAllocator
  )

  const exportRecord: StudentExportRecord = {
    id: student.id,
    serialNumber: student.serialNumber,
    status: student.status,
    formData: fd,
    className: student.class?.name || "",
    schoolName,
    photoPath: student.photoPath,
    photoUrl: student.photoUrl,
    submittedAt: student.submittedAt,
  }

  const mapping: StudentPhotoMapping = {
    studentId: student.id,
    serialNumber: student.serialNumber,
    fullName,
    className: exportRecord.className,
    photoFile,
    photoSaved: false,
  }

  return {
    exportRecord,
    photoFile,
    fullName,
    row: buildStudentExportRow(exportRecord, photoFile),
    mapping,
    completeRecord: {
      id: student.id,
      serialNumber: student.serialNumber,
      schoolName,
      className: exportRecord.className,
      fullName,
      status: student.status,
      formData: student.formData,
      photoFile,
      photoUrl: student.photoUrl,
      photoPath: student.photoPath,
      submittedAt: student.submittedAt,
    },
  }
}
