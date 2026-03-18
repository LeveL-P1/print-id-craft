import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { serial: string } }) {
  try {
    const student = await prisma.student.findFirst({
      where: {
        OR: [
          { serialNumber: params.serial },
          { qrToken: params.serial }
        ]
      },
      include: {
        classGroup: { include: { school: { select: { name: true, id: true } } } }
      }
    })

    if (!student) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: student.id,
        serialNumber: student.serialNumber,
        photoUrl: student.photoUrl,
        formData: student.formData,
        status: student.status,
        schoolName: student.classGroup.school.name,
        className: student.classGroup.name,
        qrToken: student.qrToken,
        matched: true
      },
      error: null
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
