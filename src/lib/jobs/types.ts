import type { JobType } from "@prisma/client"

export type ExportArchivePayload = {
  classId: string | null
  status: string | null
  includePhotos: boolean
  maxStudents: number
  totalStudents: number
}

export type GenerateQrPayload = {
  students: Array<{ id: string; serialNumber: string }>
}

export type GeneratePrintBatchPayload = {
  batchId: string
  studentIds: string[]
}

export type ImportStudentsPayload = {
  storagePath: string
  extension: string
  classId: string | null
  fileName: string
}

export type EnqueueInput = {
  type: JobType
  schoolId: string
  createdById?: string | null
  payload: Record<string, unknown>
}

export const MAX_JOBS_PER_RUN = 2
export const JOB_MAX_ATTEMPTS = 3
export const EXPORT_BUCKET = "student-photos"
export const EXPORT_PREFIX = "exports"
