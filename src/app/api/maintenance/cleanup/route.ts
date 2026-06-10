import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 10

const DEFAULT_EVENT_RETENTION_DAYS = 90
const DEFAULT_COMPLETED_JOB_RETENTION_DAYS = 30

function retentionDate(envName: string, fallbackDays: number, now: Date) {
  const configured = Number(process.env[envName])
  const days = Number.isFinite(configured) && configured > 0 ? configured : fallbackDays
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function isAuthorized(req: Request) {
  const secret = process.env.MAINTENANCE_SECRET || process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== "production"
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  return token === secret
}

async function cleanup(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const rateLimits = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: now } },
  })
  const events = await prisma.systemEvent.deleteMany({
    where: { createdAt: { lt: retentionDate("EVENT_RETENTION_DAYS", DEFAULT_EVENT_RETENTION_DAYS, now) } },
  })
  const jobs = await prisma.job.deleteMany({
    where: {
      status: { in: ["COMPLETED", "FAILED"] },
      updatedAt: { lt: retentionDate("JOB_RETENTION_DAYS", DEFAULT_COMPLETED_JOB_RETENTION_DAYS, now) },
    },
  })

  return NextResponse.json({
    success: true,
    deleted: { rateLimits: rateLimits.count, events: events.count, jobs: jobs.count },
    timestamp: now.toISOString(),
  })
}

export async function GET(req: Request) {
  return cleanup(req)
}

export async function POST(req: Request) {
  return cleanup(req)
}
