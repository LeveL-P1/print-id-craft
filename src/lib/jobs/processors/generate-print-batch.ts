import { prisma } from "@/lib/prisma"
import { getDefaultTemplate } from "@/lib/template-resolver"
import { storageUpload } from "@/lib/storage"
import { reportError } from "@/lib/observability"
import type { GeneratePrintBatchPayload } from "../types"
import { EXPORT_BUCKET } from "../types"

function generateSimplePdf(
  students: any[],
  layout: any[],
  pageW: number,
  pageH: number,
  bleedPt: number,
  side: "front" | "back",
  schoolName: string
): Buffer {
  const pageContents: { streamData: string }[] = []

  for (const student of students) {
    const fd = student.formData as any
    const lines: string[] = ["BT", `/F1 10 Tf`]

    if (layout.length > 0) {
      for (const el of layout) {
        if (el.type === "text" || el.type === "shape") {
          let text = el.content || ""
          Object.entries(fd).forEach(([key, value]) => {
            text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value || ""))
          })
          text = text.replace(/\{\{serialNumber\}\}/g, student.serialNumber || "")

          const fontSize = el.fontSize || 12
          const x = Math.round((el.x * 0.75 + bleedPt) * 100) / 100
          const y = Math.round((pageH - (el.y * 0.75 + bleedPt) - fontSize) * 100) / 100
          text = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")

          lines.push(`/F1 ${fontSize} Tf`, `${x} ${y} Td`, `(${text}) Tj`, `${-x} ${-y} Td`)
        }
      }
    } else {
      const fontSize = 10
      let y = pageH - bleedPt - 20
      const x = bleedPt + 10
      const infoLines =
        side === "front"
          ? [
              `${schoolName}`,
              `Name: ${fd.fullName || ""}`,
              `Class: ${fd.class || student.class?.name || ""}`,
              `Roll No: ${fd.rollNo || ""}`,
              `Serial: ${student.serialNumber}`,
            ]
          : [
              "STUDENT ID CARD - BACK",
              `Father: ${fd.fatherName || ""}`,
              `Mother: ${fd.motherName || ""}`,
              `Phone: ${fd.phone || ""}`,
              `Blood Group: ${fd.bloodGroup || ""}`,
              `Address: ${fd.address || ""}`,
              `Serial: ${student.serialNumber}`,
            ]

      for (const line of infoLines) {
        const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
        lines.push(`/F1 ${fontSize} Tf`, `${x} ${y} Td`, `(${escaped}) Tj`, `${-x} ${-y} Td`)
        y -= fontSize + 4
      }
    }

    const serialX = Math.round((pageW - bleedPt - 60) * 100) / 100
    const serialY = Math.round((bleedPt - 2) * 100) / 100
    lines.push(
      "0.6 0.6 0.6 rg",
      "/F1 6 Tf",
      `${serialX} ${serialY > 0 ? serialY : 4} Td`,
      `(${(student.serialNumber || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}) Tj`,
      "0 0 0 rg",
      "ET"
    )
    pageContents.push({ streamData: lines.join("\n") })
  }

  const finalParts: string[] = ["%PDF-1.4\n"]
  const finalOffsets: number[] = []
  let offset = finalParts[0].length

  finalOffsets[1] = offset
  let s = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`
  finalParts.push(s)
  offset += s.length

  finalOffsets[3] = offset
  s = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
  finalParts.push(s)
  offset += s.length

  const finalPageRefs: number[] = []
  let objIdx = 4
  for (let i = 0; i < students.length; i++) {
    const streamData = pageContents[i].streamData
    const streamBytes = Buffer.byteLength(streamData, "utf-8")

    const contentObjId = objIdx++
    finalOffsets[contentObjId] = offset
    s = `${contentObjId} 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamData}\nendstream\nendobj\n`
    finalParts.push(s)
    offset += s.length

    const pageObjId = objIdx++
    finalOffsets[pageObjId] = offset
    s = `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`
    finalParts.push(s)
    offset += s.length
    finalPageRefs.push(pageObjId)
  }

  finalOffsets[2] = offset
  s = `2 0 obj\n<< /Type /Pages /Kids [${finalPageRefs.map((n) => `${n} 0 R`).join(" ")}] /Count ${students.length} >>\nendobj\n`
  finalParts.push(s)
  offset += s.length

  const xrefOffset = offset
  const totalObjects = objIdx
  s = `xref\n0 ${totalObjects}\n0000000000 65535 f \n`
  for (let i = 1; i < totalObjects; i++) {
    s += `${String(finalOffsets[i] || 0).padStart(10, "0")} 00000 n \n`
  }
  finalParts.push(s)
  s = `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  finalParts.push(s)

  return Buffer.from(finalParts.join(""), "utf-8")
}

export async function processGeneratePrintBatch(schoolId: string, payload: GeneratePrintBatchPayload) {
  const { batchId, studentIds } = payload
  const batch = await prisma.printBatch.findUnique({ where: { id: batchId } })
  if (!batch || batch.schoolId !== schoolId) {
    throw new Error("Print batch not found")
  }

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId },
    orderBy: { serialNumber: "asc" },
    include: { class: { select: { name: true } } },
  })

  if (students.length === 0) {
    throw new Error("No students available for print batch")
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  })

  const csvHeaders = "Serial Number,Full Name,Class,Roll No.,DOB,Blood Group,Status"
  const csvRows = students.map((s) => {
    const fd = s.formData as Record<string, string>
    return [
      s.serialNumber,
      fd.fullName || fd["Full Name"] || "",
      s.class?.name || fd.class || "",
      fd.rollNo || fd["Roll No."] || "",
      fd.dob || fd["Date of Birth"] || "",
      fd.bloodGroup || fd["Blood Group"] || "",
      s.status,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  })

  const manifestPath = `batches/${schoolId}/${batchId}/manifest.csv`
  await storageUpload(EXPORT_BUCKET, manifestPath, Buffer.from([csvHeaders, ...csvRows].join("\n"), "utf-8"), {
    contentType: "text/csv",
    upsert: true,
  })

  const template = await getDefaultTemplate(schoolId)
  const bleedMm = 3
  const mmToPoints = 2.8346
  const cardWidthMm = template?.cardWidthMm || 85.6
  const cardHeightMm = template?.cardHeightMm || 54.0
  const pageW = Math.round((cardWidthMm + bleedMm * 2) * mmToPoints * 100) / 100
  const pageH = Math.round((cardHeightMm + bleedMm * 2) * mmToPoints * 100) / 100
  const bleedPt = Math.round(bleedMm * mmToPoints * 100) / 100

  const frontPath = `batches/${schoolId}/${batchId}/front.pdf`
  const backPath = `batches/${schoolId}/${batchId}/back.pdf`

  await storageUpload(
    EXPORT_BUCKET,
    frontPath,
    generateSimplePdf(students, (template?.frontLayout as any[]) || [], pageW, pageH, bleedPt, "front", school?.name || ""),
    { contentType: "application/pdf", upsert: true }
  )
  await storageUpload(
    EXPORT_BUCKET,
    backPath,
    generateSimplePdf(students, (template?.backLayout as any[]) || [], pageW, pageH, bleedPt, "back", school?.name || ""),
    { contentType: "application/pdf", upsert: true }
  )

  await prisma.printBatch.update({
    where: { id: batchId },
    data: {
      status: "READY",
      studentCount: students.length,
      manifestPath,
      frontPdfPath: frontPath,
      backPdfPath: backPath,
    },
  })

  await prisma.student.updateMany({
    where: { id: { in: studentIds } },
    data: { status: "PRINTED" },
  })

  return { batchId, studentCount: students.length, manifestPath, frontPdfPath: frontPath, backPdfPath: backPath }
}

export async function failPrintBatch(batchId: string, error: unknown) {
  await prisma.printBatch.update({ where: { id: batchId }, data: { status: "FAILED" } })
  await reportError(error, {
    type: "JOB_FAILED",
    message: "Print batch generation failed",
    metadata: { batchId },
  })
}
