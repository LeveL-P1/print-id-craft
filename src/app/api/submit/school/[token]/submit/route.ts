import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { durableRateLimit, getClientIp } from "@/lib/rate-limit"
import { storageUpload, storagePublicUrl } from "@/lib/storage"
import QRCode from "qrcode"
import { computeAutoAssignedFields } from "@/lib/submit-fields"
import { getNextStudentSerial } from "@/lib/student-serial"
import { reportError } from "@/lib/observability"

/**
 * Public POST — creates a student record from a school-wide registration
 * link. Caller must include `classId` in the body so we know which class
 * the student belongs to (the form's class dropdown sets this). All other
 * behaviour mirrors /api/submit/[token]/submit so duplicate-detection,
 * serial number generation, and QR creation stay consistent.
 */
const submitSchema = z.object({
  classId: z.string().min(1, "classId is required"),
  formData: z.record(z.string(), z.any()),
  photoUrl: z.string().optional().default("").refine((url) => {
    if (!url) return true
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    if (supabaseUrl && url.startsWith(supabaseUrl)) return true
    if (url.includes("supabase.co/storage/")) return true
    return false
  }, { message: "Invalid photo URL origin" }),
  photoPath: z.string().optional().default(""),
})

export async function POST(req: Request, { params }: { params: { token: string } }) {
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
    if (!school.linkActive) {
      return NextResponse.json({ error: "This link is closed" }, { status: 410 })
    }
    if (school.linkExpiresAt && new Date() > school.linkExpiresAt) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 })
    }

    const body = await req.json()
    const validated = submitSchema.parse(body)

    // Verify the class belongs to this school and is still open.
    const cls = await prisma.class.findFirst({
      where: { id: validated.classId, schoolId: school.id, isActive: true },
      select: { id: true, name: true, expiresAt: true },
    })
    if (!cls) {
      return NextResponse.json({ error: "Selected class is not available." }, { status: 400 })
    }
    if (cls.expiresAt && new Date() > cls.expiresAt) {
      return NextResponse.json({ error: "Selected class is closed for registration." }, { status: 410 })
    }

    // Duplicate guard: same class + same rollNo
    const rollNo = validated.formData.rollNo || validated.formData["Roll No."] || validated.formData["roll"]
    if (rollNo) {
      const existing = await prisma.student.findFirst({
        where: {
          classId: cls.id,
          status: { not: "FLAGGED" },
          OR: [
            { formData: { path: ["rollNo"], equals: rollNo } },
            { formData: { path: ["Roll No."], equals: rollNo } },
            { formData: { path: ["roll"], equals: rollNo } },
          ] as any,
        },
      })
      if (existing) {
        return NextResponse.json({ error: "A student with this Roll No. has already submitted in this class." }, { status: 409 })
      }
    }

    // Duplicate guard: same class + same student name (case-insensitive)
    const NAME_KEYS = ["name", "fullName", "studentName", "Student Name", "student_name", "full_name", "Full Name"]
    const studentName = NAME_KEYS.map(k => validated.formData[k]).find(v => v && String(v).trim()) || ""
    if (studentName) {
      const normalizedName = String(studentName).trim().toLowerCase().replace(/\s+/g, " ")
      const existingStudents = await prisma.student.findMany({
        where: { classId: cls.id, status: { not: "FLAGGED" } },
        select: { formData: true },
      })
      const nameMatch = existingStudents.some((s: any) => {
        const fd = (s.formData as Record<string, string>) || {}
        for (const k of NAME_KEYS) {
          const v = (fd[k] || "").trim().toLowerCase().replace(/\s+/g, " ")
          if (v && v === normalizedName) return true
        }
        return false
      })
      if (nameMatch) {
        return NextResponse.json({
          error: "DUPLICATE_NAME",
          message: "Details with this name are already registered. If you need to make changes, please contact support.",
        }, { status: 409 })
      }
    }

    let student: any = null
    let retries = 3
    while (retries > 0) {
      try {
        // Auto-assigned keys (NO, PHOTO NO.) — same logic as per-class endpoint.
        student = await prisma.$transaction(async (tx) => {
          const serialNumber = await getNextStudentSerial(tx, school.id, school.name)
          const autoFields = await computeAutoAssignedFields(school.id)
          const photoPath = validated.photoPath?.startsWith(`students/${school.id}/`)
            ? validated.photoPath
            : ""
          const newStudent = await tx.student.create({
            data: {
              schoolId: school.id,
              classId: cls.id,
              serialNumber,
              formData: { ...validated.formData, ...autoFields, class: cls.name },
              photoUrl: validated.photoUrl || "",
              photoPath,
              status: "SUBMITTED",
            },
          })
          try {
            const qrContent = JSON.stringify({
              serial: serialNumber,
              school: school.id,
              student: newStudent.id,
            })
            const qrBuffer = await QRCode.toBuffer(qrContent, { width: 300, margin: 2 })
            const qrPath = `students/${school.id}/qr/${newStudent.id}.png`
            await storageUpload("student-photos", qrPath, qrBuffer, {
              contentType: "image/png",
              upsert: true,
            })
            const qrUrl = storagePublicUrl("student-photos", qrPath)
            await tx.student.update({
              where: { id: newStudent.id },
              data: { qrCodeUrl: qrUrl },
            })
            return { ...newStudent, qrCodeUrl: qrUrl }
          } catch (qrError) {
            console.error("QR generation error:", qrError)
            return newStudent
          }
        })
        break
      } catch (err: any) {
        if (err?.code === "P2002" && retries > 1) {
          retries--
          continue
        }
        throw err
      }
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
      metadata: { token: params.token },
    })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    const message = error?.message || (typeof error === "string" ? error : "Internal Server Error")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
