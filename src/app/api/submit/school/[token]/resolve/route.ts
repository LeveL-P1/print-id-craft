import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Public helper: maps a (school linkToken, classId) pair to that
 * class's per-class linkToken so the school-wide entry page can
 * redirect the parent to the existing per-class submission form
 * without requiring us to expose every class token in the public
 * GET payload.
 */
export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const { searchParams } = new URL(req.url)
    const classId = searchParams.get("classId") || ""
    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 })
    }

    const school = await prisma.school.findUnique({
      where: { linkToken: params.token },
      select: { id: true, linkActive: true, linkExpiresAt: true },
    })
    if (!school) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 })
    }
    if (!school.linkActive) {
      return NextResponse.json({ error: "This link is closed" }, { status: 410 })
    }
    if (school.linkExpiresAt && new Date() > school.linkExpiresAt) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 })
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId: school.id, isActive: true },
      select: { linkToken: true, expiresAt: true },
    })
    if (!cls) {
      return NextResponse.json({ error: "Class not available" }, { status: 404 })
    }
    if (cls.expiresAt && new Date() > cls.expiresAt) {
      return NextResponse.json({ error: "This class is closed for registration" }, { status: 410 })
    }

    return NextResponse.json({
      success: true,
      data: { classToken: cls.linkToken },
    })
  } catch (error) {
    console.error("GET /api/submit/school/[token]/resolve error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
