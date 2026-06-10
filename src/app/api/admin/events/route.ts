import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "MANUFACTURER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500)
  const severity = url.searchParams.get("severity") || undefined
  const type = url.searchParams.get("type") || undefined
  const schoolId = url.searchParams.get("schoolId") || undefined

  const events = await prisma.systemEvent.findMany({
    where: {
      ...(severity ? { severity: severity as any } : {}),
      ...(type ? { type: type as any } : {}),
      ...(schoolId ? { schoolId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return NextResponse.json({ success: true, data: events })
}
