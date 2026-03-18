import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const school = await prisma.school.findUnique({
      where: { id: params.id, manufacturerId: session.user.id }
    })
    if (!school) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

    const templates = await prisma.cardTemplate.findMany({
      where: { schoolId: params.id }
    })

    return NextResponse.json({ success: true, data: templates, error: null })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const school = await prisma.school.findUnique({
      where: { id: params.id, manufacturerId: session.user.id }
    })
    if (!school) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

    const body = await req.json()
    const { side, templateJson, background, width, height, orientation } = body

    // Upsert template for this side
    const existing = await prisma.cardTemplate.findFirst({
      where: { schoolId: params.id, side: side }
    })

    let template;
    if (existing) {
      template = await prisma.cardTemplate.update({
        where: { id: existing.id },
        data: {
          templateJson: templateJson || existing.templateJson,
          background: background !== undefined ? background : existing.background,
          width: width || existing.width,
          height: height || existing.height,
          orientation: orientation || existing.orientation
        }
      })
    } else {
      template = await prisma.cardTemplate.create({
        data: {
          schoolId: params.id,
          side: side,
          templateJson: templateJson || [],
          background: background || "#ffffff",
          width: width || 600,
          height: height || 950,
          orientation: orientation || "PORTRAIT"
        }
      })
    }

    return NextResponse.json({ success: true, data: template, error: null })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
