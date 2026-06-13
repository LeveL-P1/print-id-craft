import type { JobType } from "@prisma/client"
import { z } from "zod"

export const MAX_JOBS_PER_RUN = 2
export const JOB_RUN_TIME_BUDGET_MS = 270_000
export const JOB_MAX_ATTEMPTS = 3
export const JOB_STALE_RUNNING_MINUTES = 30
export const MAX_PRINT_BATCH_STUDENTS = 1500
export const EXPORT_BUCKET = "student-photos"
export const EXPORT_PREFIX = "exports"

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
  payload: JobPayload
}

const nullableIdSchema = z.string().min(1).nullable()

export const exportArchivePayloadSchema = z.object({
  classId: nullableIdSchema,
  status: z.string().min(1).nullable(),
  includePhotos: z.boolean(),
  maxStudents: z.number().int().positive().max(15000),
  totalStudents: z.number().int().nonnegative(),
  format: z.enum(["archive", "excel"]).optional(),
})

export const generateQrPayloadSchema = z.object({
  students: z.array(z.object({
    id: z.string().min(1),
    serialNumber: z.string().min(1),
  })).max(5000),
})

export const generatePrintBatchPayloadSchema = z.object({
  batchId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1).max(MAX_PRINT_BATCH_STUDENTS),
})

export const importStudentsPayloadSchema = z.object({
  storagePath: z.string().min(1),
  extension: z.string().min(1),
  classId: nullableIdSchema,
  fileName: z.string().min(1),
})

export const platformBackupPayloadSchema = z.object({
  includeStudents: z.boolean(),
})

export const reprocessPhotosPayloadSchema = z.object({
  classId: z.string().min(1).nullable().optional(),
  studentIds: z.array(z.string().min(1)).max(5000).optional(),
  maxStudents: z.number().int().positive().max(5000).optional(),
  mode: z.enum(["skipped", "all"]).optional(),
})

export type JobPayload =
  | ExportArchivePayload
  | GenerateQrPayload
  | GeneratePrintBatchPayload
  | ImportStudentsPayload
  | PlatformBackupPayload
  | ReprocessPhotosPayload

export function validateJobPayload(type: JobType, payload: unknown): JobPayload {
  switch (type) {
    case "EXPORT_SCHOOL_ARCHIVE":
      return exportArchivePayloadSchema.parse(payload)
    case "GENERATE_QR":
      return generateQrPayloadSchema.parse(payload)
    case "GENERATE_PRINT_BATCH":
      return generatePrintBatchPayloadSchema.parse(payload)
    case "IMPORT_STUDENTS":
      return importStudentsPayloadSchema.parse(payload)
    case "EXPORT_PLATFORM_BACKUP":
      return platformBackupPayloadSchema.parse(payload)
    case "REPROCESS_PHOTOS":
      return reprocessPhotosPayloadSchema.parse(payload)
    default:
      throw new Error(`Unsupported job type: ${type}`)
  }
}
