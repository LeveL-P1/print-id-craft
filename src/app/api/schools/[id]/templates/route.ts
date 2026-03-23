import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// This route is kept for backward compat but redirects to the template route
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const template = await prisma.template.findUnique({
      where: { schoolId: params.id },
    })

    return NextResponse.json({ success: true, data: template ? [template] : [], error: null })
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

    const body = await req.json()
    const { frontLayout, backLayout, cardWidthMm, cardHeightMm, orientation, fieldConfig } = body

    const template = await prisma.template.upsert({
      where: { schoolId: params.id },
      update: {
        frontLayout: frontLayout || undefined,
        backLayout: backLayout || undefined,
        cardWidthMm: cardWidthMm || undefined,
        cardHeightMm: cardHeightMm || undefined,
        orientation: orientation || undefined,
        fieldConfig: fieldConfig || undefined,
      },
      create: {
        schoolId: params.id,
        frontLayout: frontLayout || [],
        backLayout: backLayout || [],
        fieldConfig: fieldConfig || [],
        cardWidthMm: cardWidthMm || 85.6,
        cardHeightMm: cardHeightMm || 54.0,
        printDpi: 300,
        orientation: orientation || "PORTRAIT",
      },
    })

    return NextResponse.json({ success: true, data: template, error: null })
  } catch (error: any) {
    console.error(error)
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
