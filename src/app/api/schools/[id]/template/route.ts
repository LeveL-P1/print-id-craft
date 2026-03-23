import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const templateSchema = z.object({
  frontLayout: z.any().optional(),
  backLayout: z.any().optional(),
  cardWidthMm: z.number().positive().optional(),
  cardHeightMm: z.number().positive().optional(),
  printDpi: z.number().int().positive().optional(),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]).optional(),
  fieldConfig: z.any().optional(),
})

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Manufacturer can access any school's template; Teacher can only access their own
    if (session.user?.role === "TEACHER") {
      if (session.user.schoolId !== params.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else if (session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const template = await prisma.template.findUnique({
      where: { schoolId: params.id },
    })

    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validated = templateSchema.parse(body)

    const template = await prisma.template.upsert({
      where: { schoolId: params.id },
      update: {
        ...validated,
      },
      create: {
        schoolId: params.id,
        frontLayout: validated.frontLayout || [],
        backLayout: validated.backLayout || [],
        fieldConfig: validated.fieldConfig || [],
        cardWidthMm: validated.cardWidthMm || 85.6,
        cardHeightMm: validated.cardHeightMm || 54.0,
        printDpi: validated.printDpi || 300,
        orientation: validated.orientation || "PORTRAIT",
      },
    })

    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("PUT template error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
