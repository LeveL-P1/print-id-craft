import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { durableRateLimit, getClientIp } from "@/lib/rate-limit"
import { storageUpload, storagePublicUrl } from "@/lib/storage"
import QRCode from "qrcode"
import { computeAutoAssignedFields } from "@/lib/submit-fields"
import { getNextStudentSerial } from "@/lib/student-serial"
import { reportError, reportSlowOperation } from "@/lib/observability"
import { checkDuplicateSubmission } from "@/lib/submit-fields"
import { buildStudentIndexData } from "@/lib/student-index"
import { validateAndBuildClassFields } from "@/lib/section-class"

const photoUrlRefine = (url: string) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  if (supabaseUrl && url.startsWith(supabaseUrl)) return true
  if (url.includes("supabase.co/storage/")) return true
  return false
}

const publicSchoolSubmitSchema = z.object({
  classId: z.string().min(1, "classId is required"),
  formData: z.record(z.string(), z.any()),
  photoUrl: z
    .string()
    .optional()
    .default("")
    .refine((url) => !url || photoUrlRefine(url), { message: "Invalid photo URL origin" }),
  photoPath: z.string().optional().default(""),
  photoBgStatus: z
    .enum(["", "PLAIN", "PROCESSED", "SKIPPED", "REPROCESSED"])
    .optional()
    .default(""),
})

export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  const startedAt = Date.now()
  let schoolId: string | null = null
  let classId: string | null = null
  try {
    // Rate limiting
    const ip = getClientIp(req)
    const rl = await durableRateLimit(`submit-school:${params.token}:${ip}`, 12, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
    }

    const school = await prisma.school.findUnique({
      where: { linkToken: params.token },
      select: { id: true, name: true, linkActive: true, linkExpiresAt: true },
    })
    if (!school) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 })
    }
    schoolId = school.id
    if (!school.linkActive) {
      return NextResponse.json({ error: "This link is closed" }, { status: 410 })
    }
    if (school.linkExpiresAt && new Date() > school.linkExpiresAt) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 })
    }

    const body = await req.json()
    const validated = publicSchoolSubmitSchema.parse(body)

    // Verify the class belongs to this school and is still open.
    const cls = await prisma.class.findFirst({
      where: { id: validated.classId, schoolId: school.id, isActive: true },
      select: { id: true, name: true, expiresAt: true, classOptions: true, sectionType: true },
    })
    if (!cls) {
      return NextResponse.json({ error: "Selected class is not available." }, { status: 400 })
    }
    classId = cls.id
    if (cls.expiresAt && new Date() > cls.expiresAt) {
      return NextResponse.json({ error: "Selected class is closed for registration." }, { status: 410 })
    }

    const formData = validated.formData as Record<string, string>

    const classFields = validateAndBuildClassFields(
      formData,
      cls.name,
      cls.classOptions,
      cls.sectionType
    )
    if (!classFields.ok) {
      return NextResponse.json({ error: classFields.error }, { status: 400 })
    }

    const duplicate = await checkDuplicateSubmission(cls.id, formData)
    if (duplicate.isDuplicate) {
      return NextResponse.json({
        error: duplicate.error,
        message: duplicate.message,
        existing: {
          serialNumber: duplicate.existing.serialNumber,
          submittedAt: duplicate.existing.submittedAt.toISOString(),
          studentName: duplicate.existing.studentName,
        },
      }, { status: 409 })
    }

    // Pre-compute auto-assigned fields OUTSIDE the transaction to avoid
    // hitting Prisma's default 5 000 ms interactive-transaction timeout.
    const autoFields = await computeAutoAssignedFields(school.id)

    let student: any = null
    let retries = 3
    while (retries > 0) {
      try {
        student = await prisma.$transaction(async (tx) => {
          const serialNumber = await getNextStudentSerial(tx, school.id, school.name)
          const photoPath = validated.photoPath?.startsWith(`students/${school.id}/`)
            ? validated.photoPath
            : ""
          const finalFormData = {
            ...validated.formData,
            ...autoFields,
            class: classFields.class,
            ...(classFields.classGrade ? { classGrade: classFields.classGrade } : {}),
            ...(classFields.division ? { division: classFields.division } : {}),
          }
          const indexData = buildStudentIndexData(finalFormData, cls.id)
          return tx.student.create({
            data: {
              schoolId: school.id,
              classId: cls.id,
              serialNumber,
              ...indexData,
              formData: finalFormData,
              photoUrl: validated.photoUrl,
              photoPath,
              photoBgStatus: validated.photoBgStatus || "",
              status: "SUBMITTED",
            },
          })
        }, { timeout: 15000 })
        break
      } catch (err: any) {
        if (err?.code === "P2002" && retries > 1) {
          retries--
          continue
        }
        throw err
      }
    }

    try {
      const qrContent = JSON.stringify({
        serial: student.serialNumber,
        school: school.id,
        student: student.id,
      })
      const qrBuffer = await QRCode.toBuffer(qrContent, { width: 300, margin: 2 })
      const qrPath = `students/${school.id}/qr/${student.id}.png`
      await storageUpload("student-photos", qrPath, qrBuffer, {
        contentType: "image/png",
        upsert: true,
      })
      const qrUrl = storagePublicUrl("student-photos", qrPath)
      await prisma.student.update({
        where: { id: student.id },
        data: { qrCodeUrl: qrUrl },
      })
    } catch (qrError) {
      console.error("QR generation error:", qrError)
    }

    return NextResponse.json(
      {
        success: true,
        data: { studentId: student.id, serialNumber: student.serialNumber },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("POST /api/submit/school/[token]/submit error:", error)
    await reportError(error, {
      type: "SUBMIT_FAILED",
      message: "Public school submit failed",
      schoolId,
      metadata: { token: params.token, classId, durationMs: Date.now() - startedAt },
    })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    const message = error?.message || (typeof error === "string" ? error : "Internal Server Error")
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await reportSlowOperation({
      name: "api.submit.school",
      durationMs: Date.now() - startedAt,
      thresholdMs: 4_000,
      schoolId,
      metadata: { token: params.token, classId },
    })
  }
}
