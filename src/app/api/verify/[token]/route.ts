import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const student = await prisma.student.findUnique({
      where: { qrToken: params.token },
      include: {
        classGroup: {
          include: {
            school: { select: { name: true, logo: true, primaryColor: true } }
          }
        }
      }
    })

    if (!student) {
      return NextResponse.json({ success: false, error: "Invalid verification token" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        serialNumber: student.serialNumber,
        photoUrl: student.photoUrl,
        formData: student.formData,
        status: student.status,
        schoolName: student.classGroup.school.name,
        className: student.classGroup.name,
        schoolLogo: student.classGroup.school.logo,
        primaryColor: student.classGroup.school.primaryColor,
        submittedAt: student.submittedAt
      },
      error: null
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
