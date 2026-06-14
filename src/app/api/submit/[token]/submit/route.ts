import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { durableRateLimit, getClientIp } from "@/lib/rate-limit"
import { storageUpload, storagePublicUrl } from "@/lib/storage"
import QRCode from "qrcode"
import {
  computeAutoAssignedFields,
  getPublicSubmissionFields,
  requireValidSubmitPhotoFields,
  validatePublicSubmissionDetails,
} from "@/lib/submit-fields"
import { getNextStudentSerial } from "@/lib/student-serial"
import { reportError, reportSlowOperation } from "@/lib/observability"
import { checkDuplicateSubmission } from "@/lib/submit-fields"
import { buildStudentIndexData } from "@/lib/student-index"
import { validateAndBuildClassFields } from "@/lib/section-class"
import { recordPublicSubmissionAudit } from "@/lib/submission-audit"
import { getTemplateForClass } from "@/lib/template-resolver"

const photoUrlRefine = (url: string) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  if (supabaseUrl && url.startsWith(supabaseUrl)) return true
  if (url.includes("supabase.co/storage/")) return true
  return false
}

const publicSubmitSchema = z.object({
  formData: z.record(z.string(), z.any()),
  photoUrl: z
    .string()
    .optional()
    .default("")
    .refine((url) => !url || photoUrlRefine(url), { message: "Invalid photo URL origin" }),
  photoPath: z.string().optional().default(""),
  photoDataUrl: z.string().optional().default(""),
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
    const rl = await durableRateLimit(`submit:${params.token}:${ip}`, 12, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
    }

    const cls = await prisma.class.findUnique({
      where: { linkToken: params.token },
      include: { school: true },
    })

    if (!cls) {
      return NextResponse.json({ error: "Invalid link" }, { status: 404 })
    }
    schoolId = cls.school.id
    classId = cls.id
    if (!cls.isActive) {
      return NextResponse.json({ error: "This link is closed" }, { status: 410 })
    }
    if (cls.expiresAt && new Date() > cls.expiresAt) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 })
    }

    const body = await req.json()
    const validated = publicSubmitSchema.parse(body)
    const formData = validated.formData as Record<string, string>
    const template = await getTemplateForClass(cls.id)
    const requiredFields = await getPublicSubmissionFields(cls.school.id, template)

    const classFields = validateAndBuildClassFields(
      formData,
      cls.name,
      cls.classOptions,
      cls.sectionType
    )
    if (!classFields.ok) {
      return NextResponse.json({ error: classFields.error }, { status: 400 })
    }

    const detailValidation = validatePublicSubmissionDetails(formData, requiredFields)
    if (!detailValidation.ok) {
      return NextResponse.json({ error: detailValidation.error }, { status: 400 })
    }

    await recordPublicSubmissionAudit({
      stage: "ATTEMPT",
      source: "class-link",
      token: params.token,
      schoolId: cls.school.id,
      schoolName: cls.school.name,
      classId: cls.id,
      sectionType: cls.sectionType,
      sectionName: cls.name,
      classValue: classFields.class,
      classGrade: classFields.classGrade,
      division: classFields.division,
      studentName: formData.name || formData.studentName || formData.fullName,
      hasPhoto: Boolean(validated.photoUrl || validated.photoPath || validated.photoDataUrl),
      photoBgStatus: validated.photoBgStatus,
      durationMs: Date.now() - startedAt,
    })

    const duplicate = await checkDuplicateSubmission(cls.id, formData)
    if (duplicate.isDuplicate) {
      await recordPublicSubmissionAudit({
        stage: "DUPLICATE",
        source: "class-link",
        token: params.token,
        schoolId: cls.school.id,
        schoolName: cls.school.name,
        classId: cls.id,
        sectionType: cls.sectionType,
        sectionName: cls.name,
        classValue: classFields.class,
        classGrade: classFields.classGrade,
        division: classFields.division,
        studentName: duplicate.existing.studentName || formData.name || formData.studentName || formData.fullName,
        serialNumber: duplicate.existing.serialNumber,
        hasPhoto: Boolean(validated.photoUrl || validated.photoPath || validated.photoDataUrl),
        photoBgStatus: validated.photoBgStatus,
        durationMs: Date.now() - startedAt,
      })
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
    // This is a read-only lookup (findMany take:200) that doesn't need the
    // serialisation guarantee of the advisory-lock transaction.
    const autoFields = await computeAutoAssignedFields(cls.school.id)
    const finalFormData = {
      ...validated.formData,
      ...autoFields,
      class: classFields.class,
      ...(classFields.classGrade ? { classGrade: classFields.classGrade } : {}),
      ...(classFields.division ? { division: classFields.division } : {}),
    }
    const indexData = buildStudentIndexData(finalFormData, cls.id)
    const photoFields = await requireValidSubmitPhotoFields({
      photoUrl: validated.photoUrl,
      photoPath: validated.photoPath,
      photoDataUrl: validated.photoDataUrl,
      schoolId: cls.school.id,
    })

    // Create student with retry for serial number collisions under high concurrency
    let student: any = null
    let retries = 3
    while (retries > 0) {
      try {
        student = await prisma.$transaction(async (tx) => {
          const serialNumber = await getNextStudentSerial(tx, cls.school.id, cls.school.name)
          return tx.student.create({
            data: {
              schoolId: cls.school.id,
              classId: cls.id,
              serialNumber,
              ...indexData,
              formData: finalFormData,
              photoUrl: photoFields.photoUrl,
              photoPath: photoFields.photoPath,
              photoBgStatus: photoFields.photoBgStatus || validated.photoBgStatus || "",
              status: "SUBMITTED",
            },
          })
        }, { timeout: 15000 })

        break // Success — exit retry loop
      } catch (err: any) {
        // If unique constraint violation on serialNumber, retry with new number
        if (err?.code === "P2002" && retries > 1) {
          retries--
          continue
        }
        throw err
      }
    }

    await recordPublicSubmissionAudit({
      stage: "SAVED",
      source: "class-link",
      token: params.token,
      schoolId: cls.school.id,
      schoolName: cls.school.name,
      classId: cls.id,
      sectionType: cls.sectionType,
      sectionName: cls.name,
      classValue: classFields.class,
      classGrade: classFields.classGrade,
      division: classFields.division,
      studentName: indexData.fullName || formData.name || formData.studentName || formData.fullName,
      studentId: student.id,
      serialNumber: student.serialNumber,
      hasPhoto: true,
      photoBgStatus: photoFields.photoBgStatus || validated.photoBgStatus || "",
      durationMs: Date.now() - startedAt,
    })

    try {
      const qrContent = JSON.stringify({
        serial: student.serialNumber,
        school: cls.school.id,
        student: student.id,
      })
      const qrBuffer = await QRCode.toBuffer(qrContent, { width: 300, margin: 2 })
      const qrPath = `students/${cls.school.id}/qr/${student.id}.png`
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
        data: {
          studentId: student.id,
          serialNumber: student.serialNumber,
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("POST /api/submit/[token] error:", error)
    await reportError(error, {
      type: "SUBMIT_FAILED",
      message: "Public class submit failed",
      schoolId,
      metadata: { token: params.token, classId, durationMs: Date.now() - startedAt },
    })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    if (error?.message === "A valid student photo is required. Please upload the photo again.") {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    // Return specific prisma error message if available
    const message = error?.message || (typeof error === 'string' ? error : "Internal Server Error")
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await reportSlowOperation({
      name: "api.submit.class",
      durationMs: Date.now() - startedAt,
      thresholdMs: 4_000,
      schoolId,
      metadata: { token: params.token, classId },
    })
  }
}
