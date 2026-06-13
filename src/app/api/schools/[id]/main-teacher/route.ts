import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await req.json().catch(() => ({}))
    const { email: manualEmail, reset } = body

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      include: { teachers: { where: { isMainTeacher: true } } }
    })

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    if (reset && school.teachers.length > 0) {
      const teacher = school.teachers[0]
      const defaultPassword = await bcrypt.hash("Teacher@123", 12)
      await prisma.user.update({
        where: { id: teacher.id },
        data: { password: defaultPassword }
      })
      return NextResponse.json({ success: true, message: "Password reset to Teacher@123" })
    }

    if (school.teachers.length > 0 && !manualEmail) {
      return NextResponse.json({ error: "Main teacher already exists" }, { status: 400 })
    }

    const defaultPassword = await bcrypt.hash("Teacher@123", 12)
    const email = manualEmail || school.contactEmail || `admin_${school.id.substring(0, 8)}@school.com`

    // Check if email already taken
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser && existingUser.schoolId !== school.id) {
        return NextResponse.json({ error: "This email is already in use by another account." }, { status: 400 })
    }

    if (existingUser) {
        await prisma.user.update({
            where: { id: existingUser.id },
            data: { isMainTeacher: true, role: "TEACHER", schoolId: school.id }
        })
    } else {
        await prisma.user.create({
            data: {
                email,
                password: defaultPassword,
                name: `${school.name} Admin`,
                role: "TEACHER",
                schoolId: school.id,
                isMainTeacher: true,
            }
        })
    }

    return NextResponse.json({ success: true, message: "Main teacher account updated successfully" })
  } catch (error) {
    console.error(`POST /api/schools/${params.id}/main-teacher error:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
