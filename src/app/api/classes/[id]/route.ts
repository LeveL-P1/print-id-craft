import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Verify ownership
    const classGroup = await prisma.classGroup.findUnique({
      where: { id: params.id },
      include: { school: true }
    })

    if (!classGroup || classGroup.school.manufacturerId !== session.user.id) {
       return NextResponse.json({ success: false, error: "Not found or unauthorized" }, { status: 403 })
    }

    await prisma.classGroup.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true, data: null, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
