import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const schools = await prisma.school.findMany({
      select: {
        id: true,
        _count: { select: { classes: true } },
      },
    })
    return NextResponse.json(schools)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
