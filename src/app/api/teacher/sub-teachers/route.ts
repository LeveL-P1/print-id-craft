import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

export const dynamic = "force-dynamic"

const createTeacherSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  classId: z.string().min(1, "Class is required"),
})

// GET — List sub-teachers for this school
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.user.isMainTeacher) {
      return NextResponse.json({ error: "Only main teacher can manage sub-teachers" }, { status: 403 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    const teachers = await prisma.user.findMany({
      where: {
        schoolId,
        role: "TEACHER",
        id: { not: session.user.id }, // Exclude self
      },
      select: {
        id: true,
        name: true,
        email: true,
        classId: true,
        isMainTeacher: true,
        class: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: teachers })
  } catch (error) {
    console.error("GET /api/teacher/sub-teachers error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// POST — Create a sub-teacher (class teacher)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.user.isMainTeacher) {
      return NextResponse.json({ error: "Only main teacher can add sub-teachers" }, { status: 403 })
    }

    const schoolId = session.user.schoolId
    if (!schoolId) {
      return NextResponse.json({ error: "No school assigned" }, { status: 400 })
    }

    const body = await req.json()
    const validated = createTeacherSchema.parse(body)

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: validated.email } })
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 })
    }

    // Verify class belongs to this school
    const cls = await prisma.class.findFirst({
      where: { id: validated.classId, schoolId },
    })
    if (!cls) {
      return NextResponse.json({ error: "Class not found in this school" }, { status: 404 })
    }

    const hashedPassword = await bcrypt.hash(validated.password, 12)

    const teacher = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        password: hashedPassword,
        role: "TEACHER",
        schoolId,
        classId: validated.classId,
        isMainTeacher: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        classId: true,
        class: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ success: true, data: teacher }, { status: 201 })
  } catch (error) {
    console.error("POST /api/teacher/sub-teachers error:", error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// DELETE — Remove a sub-teacher
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "TEACHER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!session.user.isMainTeacher) {
      return NextResponse.json({ error: "Only main teacher can remove sub-teachers" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const teacherId = searchParams.get("id")
    if (!teacherId) {
      return NextResponse.json({ error: "Teacher ID required" }, { status: 400 })
    }

    // Verify teacher belongs to same school and is not main teacher
    const teacher = await prisma.user.findFirst({
      where: {
        id: teacherId,
        schoolId: session.user.schoolId,
        isMainTeacher: false,
      },
    })

    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 })
    }

    await prisma.user.delete({ where: { id: teacherId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/teacher/sub-teachers error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
