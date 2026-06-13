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

const nullableIdSchema = z.string().min(1).nullable()

export class JobValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "JobValidationError"
  }
}

export const exportArchivePayloadSchema = z.object({
  classId: nullableIdSchema,
  status: z.string().min(1).nullable(),
  includePhotos: z.boolean(),
  maxStudents: z.number().int().positive().max(15000),
  totalStudents: z.number().int().nonnegative(),
  format: z.enum(["archive", "excel"]).optional(),
}).strict()

export const generateQrPayloadSchema = z.object({
  students: z.array(z.object({
    id: z.string().min(1),
    serialNumber: z.string().min(1),
  }).strict()).max(5000),
}).strict()

export const generatePrintBatchPayloadSchema = z.object({
  batchId: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1).max(MAX_PRINT_BATCH_STUDENTS),
}).strict()

export const importStudentsPayloadSchema = z.object({
  storagePath: z.string().min(1),
  extension: z.string().min(1),
  classId: nullableIdSchema,
  fileName: z.string().min(1),
}).strict()

export const platformBackupPayloadSchema = z.object({
  includeStudents: z.boolean(),
}).strict()

export const reprocessPhotosPayloadSchema = z.object({
  classId: z.string().min(1).nullable().optional(),
  studentIds: z.array(z.string().min(1)).max(5000).optional(),
  maxStudents: z.number().int().positive().max(5000).optional(),
  mode: z.enum(["skipped", "all"]).optional(),
}).strict()

export type JobPayloadByType = {
  EXPORT_SCHOOL_ARCHIVE: ExportArchivePayload
  GENERATE_QR: GenerateQrPayload
  GENERATE_PRINT_BATCH: GeneratePrintBatchPayload
  IMPORT_STUDENTS: ImportStudentsPayload
  EXPORT_PLATFORM_BACKUP: PlatformBackupPayload
  REPROCESS_PHOTOS: ReprocessPhotosPayload
}

export type SupportedJobType = keyof JobPayloadByType
export type EnqueueableJobType = Exclude<SupportedJobType, "IMPORT_STUDENTS">
export type JobPayload = JobPayloadByType[SupportedJobType]

export type EnqueueInput<T extends EnqueueableJobType = EnqueueableJobType> = {
  [K in T]: {
    type: K
    schoolId?: string | null
    createdById?: string | null
    payload: JobPayloadByType[K]
  }
}[T]

export function isJobValidationError(error: unknown): error is JobValidationError {
  return error instanceof JobValidationError
}

export function validateJobPayload<T extends SupportedJobType>(
  type: T,
  payload: unknown
): JobPayloadByType[T] {
  try {
    switch (type) {
      case "EXPORT_SCHOOL_ARCHIVE":
        return exportArchivePayloadSchema.parse(payload) as JobPayloadByType[T]
      case "GENERATE_QR":
        return generateQrPayloadSchema.parse(payload) as JobPayloadByType[T]
      case "GENERATE_PRINT_BATCH":
        return generatePrintBatchPayloadSchema.parse(payload) as JobPayloadByType[T]
      case "IMPORT_STUDENTS":
        return importStudentsPayloadSchema.parse(payload) as JobPayloadByType[T]
      case "EXPORT_PLATFORM_BACKUP":
        return platformBackupPayloadSchema.parse(payload) as JobPayloadByType[T]
      case "REPROCESS_PHOTOS":
        return reprocessPhotosPayloadSchema.parse(payload) as JobPayloadByType[T]
      default:
        throw new JobValidationError(`Unsupported job type: ${type satisfies never}`)
    }
  } catch (error) {
    if (error instanceof JobValidationError) throw error
    if (error instanceof z.ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
        .join("; ")
      throw new JobValidationError(`Invalid ${type} payload: ${message}`)
    }
    throw error
  }
}
