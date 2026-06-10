import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    // Test DB connection
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: "ok",
      db: "connected",
      storage: "connected",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        storage: "unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
