import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [users, schools, classes, templates, students, batches] = await Promise.all([
      prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, schoolId: true, createdAt: true } }),
      prisma.school.findMany(),
      prisma.class.findMany(),
      prisma.template.findMany(),
      prisma.student.findMany(),
      prisma.printBatch.findMany(),
    ])

    const dump = {
      exportedAt: new Date().toISOString(),
      users,
      schools,
      classes,
      templates,
      students,
      batches,
    }

    const json = JSON.stringify(dump, null, 2)

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="print-id-craft-db-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (error) {
    console.error("DB export error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
