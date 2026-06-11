import { describe, it, expect, vi, beforeEach } from "vitest"
import { runPendingJobs } from "@/lib/jobs/runner"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/jobs/processors/export-archive", () => ({
  processExportArchive: vi.fn().mockResolvedValue({
    fileName: "test.zip",
    storagePath: "exports/s1/job1/test.zip",
    bytes: 100,
    students: 1,
    photosIncluded: 0,
    photosMissing: 0,
  }),
}))

vi.mock("@/lib/jobs/processors/generate-qr", () => ({
  processGenerateQr: vi.fn().mockResolvedValue({ generated: 1, failed: 0 }),
}))

vi.mock("@/lib/jobs/processors/generate-print-batch", () => ({
  processGeneratePrintBatch: vi.fn().mockResolvedValue({ batchId: "b1", studentCount: 1 }),
  failPrintBatch: vi.fn(),
}))

vi.mock("@/lib/jobs/processors/export-platform-backup", () => ({
  processExportPlatformBackup: vi.fn().mockResolvedValue({
    fileName: "backup.json",
    storagePath: "backups/platform/backup.json",
    bytes: 1000,
    includeStudents: true,
    counts: { students: 1 },
  }),
}))

describe("runPendingJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.job.findFirst as any).mockResolvedValue(null)
  })

  it("returns empty when no pending jobs exist", async () => {
    const processed = await runPendingJobs(2)
    expect(processed).toEqual([])
  })

  it("claims and completes an export archive job", async () => {
    const job = {
      id: "job-1",
      type: "EXPORT_SCHOOL_ARCHIVE",
      status: "PENDING",
      schoolId: "s1",
      payload: { maxStudents: 100 },
      attempts: 0,
    }

    ;(prisma.job.findFirst as any).mockResolvedValueOnce(job)
    ;(prisma.job.updateMany as any).mockResolvedValueOnce({ count: 1 })
    ;(prisma.job.findUnique as any).mockResolvedValueOnce({ ...job, status: "RUNNING", attempts: 1 })
    ;(prisma.job.update as any).mockResolvedValue({})

    const processed = await runPendingJobs(1)

    expect(processed).toHaveLength(1)
    expect(processed[0]).toMatchObject({ jobId: "job-1", status: "COMPLETED" })
    expect(prisma.job.update).toHaveBeenCalled()
  })

  it("claims and completes a platform backup job without schoolId", async () => {
    const job = {
      id: "job-backup",
      type: "EXPORT_PLATFORM_BACKUP",
      status: "PENDING",
      schoolId: null,
      payload: { includeStudents: true },
      attempts: 0,
    }

    ;(prisma.job.findFirst as any).mockResolvedValueOnce(job)
    ;(prisma.job.updateMany as any).mockResolvedValueOnce({ count: 1 })
    ;(prisma.job.findUnique as any).mockResolvedValueOnce({ ...job, status: "RUNNING", attempts: 1 })
    ;(prisma.job.update as any).mockResolvedValue({})

    const processed = await runPendingJobs(1)

    expect(processed).toHaveLength(1)
    expect(processed[0]).toMatchObject({ jobId: "job-backup", status: "COMPLETED" })
  })
})
