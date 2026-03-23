import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { uploadWithRetry, getPublicUrl } from "@/lib/supabase"
import QRCode from "qrcode"

const submitSchema = z.object({
  formData: z.record(z.string(), z.any()),
  photoUrl: z.string().optional().default("").refine((url) => {
    if (!url) return true // empty is OK
    // Only allow expected Supabase storage URLs or empty string
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    if (supabaseUrl && url.startsWith(supabaseUrl)) return true
    // Also allow common Supabase storage patterns
    if (url.includes("supabase.co/storage/")) return true
    return false
  }, { message: "Invalid photo URL origin" }),
})

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    // Rate limiting
    const ip = getClientIp(req)
    const rl = rateLimit(`submit:${ip}`, 10, 60000)
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
    const validated = submitSchema.parse(body)

    // Check for duplicate: same class + same rollNo
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
          ]
        },
      })
      if (existing) {
        return NextResponse.json({ error: "A student with this Roll No. has already submitted in this class." }, { status: 409 })
      }
    }

    // Generate serial number: SCHOOLCODE-NNNN
    const schoolCode = cls.school.name
      .replace(/[^A-Za-z]/g, "")
      .substring(0, 6)
      .toUpperCase()
    
    // Find last student to get max serial number numeric part
    const lastStudent = await prisma.student.findFirst({
      where: { schoolId: cls.school.id },
      orderBy: { serialNumber: 'desc' },
    })

    let nextNum = 1
    if (lastStudent) {
      const match = lastStudent.serialNumber.match(/-(\d+)$/)
      if (match) {
        nextNum = parseInt(match[1]) + 1
      } else {
        // Fallback to count if format is weird
        const count = await prisma.student.count({ where: { schoolId: cls.school.id } })
        nextNum = count + 1
      }
    }
    const serialNumber = `${schoolCode}-${String(nextNum).padStart(4, "0")}`

    // Create student in transaction
    const student = await prisma.$transaction(async (tx) => {
      const newStudent = await tx.student.create({
        data: {
          schoolId: cls.school.id,
          classId: cls.id,
          serialNumber,
          formData: {
            ...validated.formData,
            class: cls.name,
          },
          photoUrl: validated.photoUrl || "",
          status: "SUBMITTED",
        },
      })

      // Generate QR code and upload
      try {
        const qrContent = JSON.stringify({
          serial: serialNumber,
          school: cls.school.id,
          student: newStudent.id,
        })
        const qrBuffer = await QRCode.toBuffer(qrContent, { width: 300, margin: 2 })
        const qrPath = `students/${cls.school.id}/qr/${newStudent.id}.png`
        await uploadWithRetry("student-photos", qrPath, qrBuffer, {
          contentType: "image/png",
          upsert: true,
        })
        const qrUrl = getPublicUrl("student-photos", qrPath)

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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    // Return specific prisma error message if available
    const message = error?.message || (typeof error === 'string' ? error : "Internal Server Error")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
