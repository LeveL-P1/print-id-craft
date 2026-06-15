import { NextResponse } from "next/server"
import { APP_BUILD_ID } from "@/lib/app-build-id"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(
    { buildId: APP_BUILD_ID, now: Date.now() },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  )
}
