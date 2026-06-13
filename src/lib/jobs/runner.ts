import type { Job, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { reportError } from "@/lib/observability"
import {
  JOB_MAX_ATTEMPTS,
  JOB_RUN_TIME_BUDGET_MS,
  JOB_STALE_RUNNING_MINUTES,
  JobValidationError,
  MAX_JOBS_PER_RUN,
  isJobValidationError,
  validateJobPayload,
} from "./types"
import { processExportArchive } from "./processors/export-archive"
import { processGenerateQr } from "./processors/generate-qr"
import { processExportPlatformBackup } from "./processors/export-platform-backup"
import { failPrintBatch, processGeneratePrintBatch } from "./processors/generate-print-batch"
import { processReprocessPhotos } from "./processors/reprocess-photos"

async function claimNextJob(): Promise<Job | null> {
  const staleStartedBefore = new Date(Date.now() - JOB_STALE_RUNNING_MINUTES * 60 * 1000)
  await prisma.job.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: staleStartedBefore },
      attempts: { lt: JOB_MAX_ATTEMPTS },
    },
    data: {
      status: "PENDING",
      error: `Recovered stale RUNNING job after ${JOB_STALE_RUNNING_MINUTES} minutes`,
      startedAt: null,
    },
  })

  await prisma.job.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: staleStartedBefore },
      attempts: { gte: JOB_MAX_ATTEMPTS },
    },
    data: {
      status: "FAILED",
      error: `Stale RUNNING job exceeded ${JOB_MAX_ATTEMPTS} attempts`,
      completedAt: new Date(),
    },
  })

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = await prisma.job.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    })
    if (!candidate) return null

    const claimed = await prisma.job.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    })

    if (claimed.count === 1) {
      return prisma.job.findUnique({ where: { id: candidate.id } })
    }
  }
  return null
}

async function completeJob(jobId: string, result: Prisma.InputJsonValue) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      result,
      error: null,
    },
  })
}

async function failJob(job: Job, error: unknown): Promise<"FAILED" | "RETRY"> {
  const message = error instanceof Error ? error.message : String(error)
  const isValidationFailure = isJobValidationError(error)
  const shouldRetry = !isValidationFailure && job.attempts < JOB_MAX_ATTEMPTS
  const status = shouldRetry ? "RETRY" : "FAILED"

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: shouldRetry ? "PENDING" : "FAILED",
      error: message,
      completedAt: shouldRetry ? null : new Date(),
    },
  })

  if (!shouldRetry) {
    await reportError(error, {
      type: "JOB_FAILED",
      schoolId: job.schoolId,
      message: `Job ${job.type} failed`,
      metadata: { jobId: job.id, attempts: job.attempts, retryable: !isValidationFailure },
    })
  }

  return status
}

async function executeJob(job: Job) {
  switch (job.type) {
    case "EXPORT_PLATFORM_BACKUP": {
      const payload = validateJobPayload("EXPORT_PLATFORM_BACKUP", job.payload || {})
      const result = await processExportPlatformBackup(
        job.id,
        payload
      )
      await completeJob(job.id, result)
      return result
    }
    default: {
      const schoolId = job.schoolId
      if (!schoolId) {
        throw new JobValidationError(`Job ${job.type} missing schoolId`)
      }

      switch (job.type) {
        case "EXPORT_SCHOOL_ARCHIVE": {
          const payload = validateJobPayload("EXPORT_SCHOOL_ARCHIVE", job.payload || {})
          const result = await processExportArchive(job.id, schoolId, payload)
          await completeJob(job.id, result)
          return result
        }
        case "GENERATE_QR": {
          const payload = validateJobPayload("GENERATE_QR", job.payload || {})
          const result = await processGenerateQr(schoolId, payload)
          await completeJob(job.id, result)
          return result
        }
        case "GENERATE_PRINT_BATCH": {
          const printPayload = validateJobPayload("GENERATE_PRINT_BATCH", job.payload || {})
          try {
            const result = await processGeneratePrintBatch(schoolId, printPayload)
            await completeJob(job.id, result)
            return result
          } catch (error) {
            await failPrintBatch(printPayload.batchId, error)
            throw error
          }
        }
        case "REPROCESS_PHOTOS": {
          const payload = validateJobPayload("REPROCESS_PHOTOS", job.payload || {})
          const result = await processReprocessPhotos(
            job.id,
            schoolId,
            payload
          )
          await completeJob(job.id, result)
          return result
        }
        default:
          throw new JobValidationError(`Unsupported job type: ${job.type}`)
      }
    }
  }
}

export async function runPendingJobs(limit = MAX_JOBS_PER_RUN) {
  const processed: Array<{ jobId: string; type: string; status: string }> = []
  const startedAt = Date.now()

  for (let i = 0; i < limit; i++) {
    if (Date.now() - startedAt > JOB_RUN_TIME_BUDGET_MS) break

    const job = await claimNextJob()
    if (!job) break

    try {
      await executeJob(job)
      processed.push({ jobId: job.id, type: job.type, status: "COMPLETED" })
    } catch (error) {
      const status = await failJob(job, error)
      processed.push({
        jobId: job.id,
        type: job.type,
        status,
      })
    }

    if (Date.now() - startedAt > JOB_RUN_TIME_BUDGET_MS) break
  }

  return processed
}
