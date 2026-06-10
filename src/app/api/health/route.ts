import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storageList } from "@/lib/storage"

export const dynamic = "force-dynamic"
export const maxDuration = 10

export async function GET() {
  const timestamp = new Date().toISOString()

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        storage: "unknown",
        timestamp,
      },
      { status: 503 }
    )
  }

  const storage = await storageList("student-photos", "")
  if (storage.error) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "connected",
        storage: "disconnected",
        timestamp,
      },
      { status: 503 }
    )
  }

  return NextResponse.json({
    status: "ok",
    db: "connected",
    storage: "connected",
    timestamp,
  })
}
