import { NextResponse } from "next/server"
import { runPendingJobs } from "@/lib/jobs/runner"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function isAuthorized(req: Request) {
  const secret = process.env.WORKER_SECRET || process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== "production"
  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  return token === secret
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") || 2), 5)
  const processed = await runPendingJobs(limit)

  return NextResponse.json({
    success: true,
    processed,
    count: processed.length,
    timestamp: new Date().toISOString(),
  })
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
