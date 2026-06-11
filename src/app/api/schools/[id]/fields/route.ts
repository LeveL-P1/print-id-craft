import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getDefaultTemplate } from "@/lib/template-resolver"
import { z } from "zod"

// Fields are stored as JSON in Template.fieldConfig
// This route provides CRUD for those fields

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.string().default("text"),
  required: z.boolean().default(false),
})

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const template = await getDefaultTemplate(params.id)
    const fields = (template?.fieldConfig || []) as any[]
    return NextResponse.json({ success: true, data: fields, error: null })
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
    const validated = fieldSchema.parse(body)

    const template = await getDefaultTemplate(params.id)
    const fields = (template?.fieldConfig || []) as any[]
    fields.push(validated)

    if (!template) {
      return NextResponse.json({ success: false, error: "No template found" }, { status: 404 })
    }

    await prisma.template.update({
      where: { id: template.id },
      data: { fieldConfig: fields },
    })

    return NextResponse.json({ success: true, data: validated, error: null }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
