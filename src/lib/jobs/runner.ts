import type { Job, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { reportError } from "@/lib/observability"
import { JOB_MAX_ATTEMPTS, MAX_JOBS_PER_RUN } from "./types"
import type {
  ExportArchivePayload,
  GeneratePrintBatchPayload,
  GenerateQrPayload,
} from "./types"
import { processExportArchive } from "./processors/export-archive"
import { processGenerateQr } from "./processors/generate-qr"
import { processExportPlatformBackup } from "./processors/export-platform-backup"
import type { PlatformBackupPayload } from "./types"
import { failPrintBatch, processGeneratePrintBatch } from "./processors/generate-print-batch"

async function claimNextJob(): Promise<Job | null> {
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

async function failJob(job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const shouldRetry = job.attempts < JOB_MAX_ATTEMPTS

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
      metadata: { jobId: job.id, attempts: job.attempts },
    })
  }
}

async function executeJob(job: Job) {
  switch (job.type) {
    case "EXPORT_PLATFORM_BACKUP": {
      const result = await processExportPlatformBackup(
        job.id,
        (job.payload || {}) as unknown as PlatformBackupPayload
      )
      await completeJob(job.id, result)
      return result
    }
    default: {
      const schoolId = job.schoolId
      if (!schoolId) {
        throw new Error("Job missing schoolId")
      }

      switch (job.type) {
        case "EXPORT_SCHOOL_ARCHIVE": {
          const result = await processExportArchive(job.id, schoolId, job.payload as unknown as ExportArchivePayload)
          await completeJob(job.id, result)
          return result
        }
        case "GENERATE_QR": {
          const result = await processGenerateQr(schoolId, job.payload as unknown as GenerateQrPayload)
          await completeJob(job.id, result)
          return result
        }
        case "GENERATE_PRINT_BATCH": {
          const payload = job.payload as unknown as GeneratePrintBatchPayload
          try {
            const result = await processGeneratePrintBatch(schoolId, payload)
            await completeJob(job.id, result)
            return result
          } catch (error) {
            await failPrintBatch(payload.batchId, error)
            throw error
          }
        }
        default:
          throw new Error(`Unsupported job type: ${job.type}`)
      }
    }
  }
}

export async function runPendingJobs(limit = MAX_JOBS_PER_RUN) {
  const processed: Array<{ jobId: string; type: string; status: string }> = []

  for (let i = 0; i < limit; i++) {
    const job = await claimNextJob()
    if (!job) break

    try {
      await executeJob(job)
      processed.push({ jobId: job.id, type: job.type, status: "COMPLETED" })
    } catch (error) {
      await failJob(job, error)
      processed.push({
        jobId: job.id,
        type: job.type,
        status: job.attempts >= JOB_MAX_ATTEMPTS ? "FAILED" : "RETRY",
      })
    }
  }

  return processed
}
