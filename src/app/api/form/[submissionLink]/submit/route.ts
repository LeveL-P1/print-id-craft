import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { v4 as uuidv4 } from "uuid"

const submitSchema = z.object({
  formData: z.record(z.any()),
  photoUrl: z.string().url().optional(),
  signatureUrl: z.string().url().optional(),
  qrToken: z.string().uuid().optional(), // Can be sent by client to verify uniquely
})

export async function POST(req: Request, { params }: { params: { submissionLink: string } }) {
  try {
    const classGroup = await prisma.classGroup.findUnique({
      where: { submissionLink: params.submissionLink },
      include: { school: true }
    })

    if (!classGroup || !classGroup.isActive) {
      return NextResponse.json({ success: false, error: "Form not found or inactive" }, { status: 404 })
    }

    const body = await req.json()
    const validatedData = submitSchema.parse(body)

    // Optional Check: prevent resubmissions using cookies or identifiers
    // (Omitted strict check to allow rapid testing - could verify qrToken/device cookie here)

    // Generate Serial Number: SCH001-CLS01-0001
    // 1) Get current count for this class to append as index
    const studentCount = await prisma.student.count({
      where: { classGroupId: classGroup.id }
    })

    const schoolPrefix = `SCH${classGroup.schoolId.slice(0, 3).toUpperCase()}`
    const classPrefix = `CLS${classGroup.id.slice(0, 3).toUpperCase()}`
    const serialIndex = String(studentCount + 1).padStart(4, "0")
    
    const serialNumber = `${schoolPrefix}-${classPrefix}-${serialIndex}`

    // Ensure qrToken exists
    const qrToken = validatedData.qrToken || uuidv4()

    const newStudent = await prisma.student.create({
      data: {
        classGroupId: classGroup.id,
        serialNumber,
        qrToken,
        formData: validatedData.formData,
        photoUrl: validatedData.photoUrl || null,
        signatureUrl: validatedData.signatureUrl || null,
        status: "SUBMITTED",
      }
    })

    return NextResponse.json({ success: true, data: { student: newStudent }, error: null }, { status: 201 })
  } catch (error) {
    console.error(`POST /api/form/${params.submissionLink}/submit error:`, error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: (error as any).errors }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 })
  }
}
