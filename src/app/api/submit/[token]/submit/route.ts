import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { durableRateLimit, getClientIp } from "@/lib/rate-limit"
import { storageUpload, storagePublicUrl } from "@/lib/storage"
import QRCode from "qrcode"
import { computeAutoAssignedFields } from "@/lib/submit-fields"
import { getNextStudentSerial } from "@/lib/student-serial"
import { reportError } from "@/lib/observability"
import { checkDuplicateSubmission } from "@/lib/submit-fields"
import { buildStudentIndexData } from "@/lib/student-index"

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
    .min(1, "Photo is required. Please upload a student photo before submitting.")
    .refine(photoUrlRefine, { message: "Invalid photo URL origin" }),
  photoPath: z.string().optional().default(""),
  photoBgStatus: z
    .enum(["", "PLAIN", "PROCESSED", "SKIPPED", "REPROCESSED"])
    .optional()
    .default(""),
})

export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
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
    if (!cls.isActive) {
      return NextResponse.json({ error: "This link is closed" }, { status: 410 })
    }
    if (cls.expiresAt && new Date() > cls.expiresAt) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 })
    }

    const body = await req.json()
    const validated = publicSubmitSchema.parse(body)
    const formData = validated.formData as Record<string, string>

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
    // This is a read-only lookup (findMany take:200) that doesn't need the
    // serialisation guarantee of the advisory-lock transaction.
    const autoFields = await computeAutoAssignedFields(cls.school.id)

    // Create student with retry for serial number collisions under high concurrency
    let student: any = null
    let retries = 3
    while (retries > 0) {
      try {
        student = await prisma.$transaction(async (tx) => {
          const serialNumber = await getNextStudentSerial(tx, cls.school.id, cls.school.name)
          const photoPath = validated.photoPath?.startsWith(`students/${cls.school.id}/`)
            ? validated.photoPath
            : ""
          const finalFormData = {
            ...validated.formData,
            ...autoFields,
            class: cls.name,
          }
          const indexData = buildStudentIndexData(finalFormData, cls.id)
          return tx.student.create({
            data: {
              schoolId: cls.school.id,
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
      metadata: { token: params.token },
    })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    // Return specific prisma error message if available
    const message = error?.message || (typeof error === 'string' ? error : "Internal Server Error")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
