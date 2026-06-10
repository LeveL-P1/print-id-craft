import QRCode from "qrcode"
import { batchExecute, prisma } from "@/lib/prisma"
import { storagePublicUrl, storageUpload } from "@/lib/storage"
import type { GenerateQrPayload } from "../types"
import { EXPORT_BUCKET } from "../types"

async function generateOneQr(studentId: string, schoolId: string, serialNumber: string) {
  const qrContent = JSON.stringify({ serial: serialNumber, school: schoolId, student: studentId })
  const qrBuffer = await QRCode.toBuffer(qrContent, { width: 300, margin: 2 })
  const qrPath = `students/${schoolId}/qr/${studentId}.png`
  await storageUpload(EXPORT_BUCKET, qrPath, qrBuffer, {
    contentType: "image/png",
    upsert: true,
  })
  const qrUrl = storagePublicUrl(EXPORT_BUCKET, qrPath)
  await prisma.student.update({
    where: { id: studentId },
    data: { qrCodeUrl: qrUrl },
  })
}

export async function processGenerateQr(schoolId: string, payload: GenerateQrPayload) {
  const students = payload.students || []
  if (students.length === 0) {
    return { generated: 0, failed: 0 }
  }

  const { errors } = await batchExecute(
    students,
    (s) => generateOneQr(s.id, schoolId, s.serialNumber),
    10
  )

  return {
    generated: students.length - errors.length,
    failed: errors.length,
  }
}
