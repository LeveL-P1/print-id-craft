import type { JobType } from "@prisma/client"

export type ExportArchivePayload = {
  classId: string | null
  status: string | null
  includePhotos: boolean
  maxStudents: number
  totalStudents: number
  /** archive = full zip; excel = mapped spreadsheet + local photos only */
  format?: "archive" | "excel"
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

export type PlatformBackupPayload = {
  includeStudents: boolean
}

export type ReprocessPhotosPayload = {
  classId?: string | null
  studentIds?: string[]
  maxStudents?: number
  /** "skipped" (default) = only SKIPPED status; "all" = empty + SKIPPED */
  mode?: "skipped" | "all"
}

export type EnqueueInput = {
  type: JobType
  schoolId?: string | null
  createdById?: string | null
  payload: Record<string, unknown>
}

export const MAX_JOBS_PER_RUN = 2
export const JOB_RUN_TIME_BUDGET_MS = 270_000
export const JOB_MAX_ATTEMPTS = 3
export const JOB_STALE_RUNNING_MINUTES = 30
export const MAX_PRINT_BATCH_STUDENTS = 1500
export const EXPORT_BUCKET = "student-photos"
export const EXPORT_PREFIX = "exports"
