import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { EnqueueInput } from "./types"

export async function enqueueJob(input: EnqueueInput) {
  return prisma.job.create({
    data: {
      type: input.type,
      status: "PENDING",
      schoolId: input.schoolId || null,
      createdById: input.createdById || null,
      payload: input.payload as Prisma.InputJsonValue,
    },
  })
}

export async function kickJobWorker(baseUrl?: string) {
  const origin =
    baseUrl ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (!origin) return

  const secret = process.env.WORKER_SECRET || process.env.CRON_SECRET
  if (!secret) return

  fetch(`${origin}/api/jobs/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {
    // Best-effort wake-up; cron will retry.
  })
}
