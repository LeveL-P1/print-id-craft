import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const school = await prisma.school.findUnique({
      where: { id: params.id },
      include: { teachers: { where: { isMainTeacher: true } } }
    })

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    if (school.teachers.length > 0) {
      return NextResponse.json({ error: "Main teacher already exists" }, { status: 400 })
    }

    const defaultPassword = await bcrypt.hash("Teacher@123", 12)
    const email = school.contactEmail || `admin_${school.id.substring(0, 8)}@school.com`

    // Handle existing email (though rare for a new-ish system)
    const existingUser = await prisma.user.findUnique({ where: { email } })
    const teacherEmail = existingUser ? `main_${school.id.substring(0, 8)}@printidcraft.com` : email

    await prisma.user.create({
      data: {
        email: teacherEmail,
        password: defaultPassword,
        name: `${school.name} Admin`,
        role: "TEACHER",
        schoolId: school.id,
        isMainTeacher: true,
      }
    })

    return NextResponse.json({ success: true, message: "Main teacher account created successfully" })
  } catch (error) {
    console.error(`POST /api/schools/${params.id}/main-teacher error:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
