import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadWithRetry } from "@/lib/supabase"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const batches = await prisma.printBatch.findMany({
      where: { schoolId: params.id },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ success: true, data: batches })
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if already generating
    const existingGenerating = await prisma.printBatch.findFirst({
      where: { schoolId: params.id, status: "GENERATING" },
    })
    if (existingGenerating) {
      return NextResponse.json(
        { error: "A batch is already being generated for this school. Please wait." },
        { status: 409 }
      )
    }

    // Get students to include — QUERY ONCE, used for both front and back PDFs
    const students = await prisma.student.findMany({
      where: {
        schoolId: params.id,
        status: { in: ["SUBMITTED", "APPROVED"] },
      },
      orderBy: { serialNumber: "asc" }, // CRITICAL: same order for front and back
      include: { class: { select: { name: true } } },
    })

    if (students.length === 0) {
      return NextResponse.json(
        { error: "No students available for printing. Students must be in SUBMITTED or APPROVED status." },
        { status: 400 }
      )
    }

    // Create batch record
    const batch = await prisma.printBatch.create({
      data: {
        schoolId: params.id,
        studentCount: students.length,
        status: "GENERATING",
      },
    })

    // Generate batch files in background
    generateBatchFiles(params.id, batch.id, students).catch((err) => {
      console.error("Batch generation error:", err)
    })

    return NextResponse.json({
      success: true,
      data: { batchId: batch.id, status: "GENERATING", studentCount: students.length },
    }, { status: 201 })
  } catch (error) {
    console.error("POST batches error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

async function generateBatchFiles(schoolId: string, batchId: string, students: any[]) {
  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    })

    // 1. Generate print manifest CSV
    const csvHeaders = "Serial Number,Full Name,Class,Roll No.,DOB,Blood Group,Status"
    const csvRows = students.map((s) => {
      const fd = s.formData as any
      return [
        s.serialNumber,
        fd.fullName || fd["Full Name"] || "",
        s.class?.name || fd.class || "",
        fd.rollNo || fd["Roll No."] || "",
        fd.dob || fd["Date of Birth"] || "",
        fd.bloodGroup || fd["Blood Group"] || "",
        s.status,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    })
    const csvContent = [csvHeaders, ...csvRows].join("\n")
    const csvBuffer = Buffer.from(csvContent, "utf-8")

    const manifestPath = `batches/${schoolId}/${batchId}/manifest.csv`
    await uploadWithRetry("student-photos", manifestPath, csvBuffer, {
      contentType: "text/csv",
      upsert: true,
    })

    // 2. Generate front PDF as a simple structured PDF
    // Using a text-based PDF approach since @react-pdf/renderer requires React rendering
    const template = await prisma.template.findUnique({
      where: { schoolId },
    })

    const cardWidthMm = template?.cardWidthMm || 85.6
    const cardHeightMm = template?.cardHeightMm || 54.0
    const bleedMm = 3
    const mmToPoints = 2.8346
    const pageW = Math.round((cardWidthMm + bleedMm * 2) * mmToPoints * 100) / 100
    const pageH = Math.round((cardHeightMm + bleedMm * 2) * mmToPoints * 100) / 100
    const bleedPt = Math.round(bleedMm * mmToPoints * 100) / 100

    // Generate a minimal valid PDF for front
    const frontPdfBuffer = generateSimplePdf(students, template?.frontLayout as any[] || [], pageW, pageH, bleedPt, "front", school?.name || "")
    const frontPath = `batches/${schoolId}/${batchId}/front.pdf`
    await uploadWithRetry("student-photos", frontPath, frontPdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

    // 3. Generate back PDF with identical page order (SAME students array)
    const backPdfBuffer = generateSimplePdf(students, template?.backLayout as any[] || [], pageW, pageH, bleedPt, "back", school?.name || "")
    const backPath = `batches/${schoolId}/${batchId}/back.pdf`
    await uploadWithRetry("student-photos", backPath, backPdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

    // 4. Assert front and back have same student count (same array = guaranteed)
    // This is guaranteed since we use the same students[] array

    // 5. Update batch record
    await prisma.printBatch.update({
      where: { id: batchId },
      data: {
        status: "READY",
        manifestPath,
        frontPdfPath: frontPath,
        backPdfPath: backPath,
      },
    })

    // 6. Mark students as PRINTED
    await prisma.student.updateMany({
      where: {
        id: { in: students.map((s) => s.id) },
      },
      data: { status: "PRINTED" },
    })
  } catch (error) {
    console.error("generateBatchFiles error:", error)
    await prisma.printBatch.update({
      where: { id: batchId },
      data: { status: "PENDING" },
    })
  }
}

function generateSimplePdf(
  students: any[],
  layout: any[],
  pageW: number,
  pageH: number,
  bleedPt: number,
  side: "front" | "back",
  schoolName: string
): Buffer {
  // Generate a minimal but valid multi-page PDF
  // Each page = one student's card (front or back)
  const objects: string[] = []
  let objectCount = 0

  const addObject = (content: string) => {
    objectCount++
    objects.push(content)
    return objectCount
  }

  // Object 1: Catalog
  addObject("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj")

  // We'll build pages after content
  const pageRefs: number[] = []
  const pageContents: { objNum: number; streamData: string }[] = []

  // Font object
  const fontObjNum = addObject(
    `${objectCount + 1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
  )

  // For each student, create a page with their info
  for (let i = 0; i < students.length; i++) {
    const student = students[i]
    const fd = student.formData as any

    // Build text content for this page
    const lines: string[] = []
    lines.push("BT")
    lines.push(`/F1 10 Tf`)

    if (layout.length > 0) {
      // Render from template layout
      for (const el of layout) {
        if (el.type === "text" || el.type === "shape") {
          let text = el.content || ""
          // Replace template variables
          Object.entries(fd).forEach(([key, value]) => {
            text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value || ""))
          })
          text = text.replace(/\{\{serialNumber\}\}/g, student.serialNumber || "")

          const fontSize = el.fontSize || 12
          const x = Math.round((el.x * 0.75 + bleedPt) * 100) / 100
          const y = Math.round((pageH - (el.y * 0.75 + bleedPt) - fontSize) * 100) / 100
          
          // Escape special PDF characters
          text = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")

          lines.push(`/F1 ${fontSize} Tf`)
          lines.push(`${x} ${y} Td`)
          lines.push(`(${text}) Tj`)
          lines.push(`${-x} ${-y} Td`) // reset position
        }
      }
    } else {
      // No layout — render basic info
      const fontSize = 10
      let y = pageH - bleedPt - 20
      const x = bleedPt + 10

      const infoLines = side === "front"
        ? [
            `${schoolName}`,
            `Name: ${fd.fullName || ""}`,
            `Class: ${fd.class || student.class?.name || ""}`,
            `Roll No: ${fd.rollNo || ""}`,
            `Serial: ${student.serialNumber}`,
          ]
        : [
            `STUDENT ID CARD - BACK`,
            `Father: ${fd.fatherName || ""}`,
            `Mother: ${fd.motherName || ""}`,
            `Phone: ${fd.phone || ""}`,
            `Blood Group: ${fd.bloodGroup || ""}`,
            `Address: ${fd.address || ""}`,
            `Serial: ${student.serialNumber}`,
          ]

      for (const line of infoLines) {
        const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
        lines.push(`/F1 ${fontSize} Tf`)
        lines.push(`${x} ${y} Td`)
        lines.push(`(${escaped}) Tj`)
        lines.push(`${-x} ${-y} Td`)
        y -= fontSize + 4
      }
    }

    // Add serial number in bleed area (bottom-right, small grey text)
    const serialX = Math.round((pageW - bleedPt - 60) * 100) / 100
    const serialY = Math.round((bleedPt - 2) * 100) / 100
    lines.push(`0.6 0.6 0.6 rg`) // grey color
    lines.push(`/F1 6 Tf`)
    lines.push(`${serialX} ${serialY > 0 ? serialY : 4} Td`)
    const escapedSerial = (student.serialNumber || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
    lines.push(`(${escapedSerial}) Tj`)
    lines.push(`0 0 0 rg`) // reset to black

    lines.push("ET")

    const streamData = lines.join("\n")
    const contentObjNum = addObject("") // placeholder
    pageContents.push({ objNum: contentObjNum, streamData })

    const pageObjNum = addObject("") // placeholder
    pageRefs.push(pageObjNum)
  }

  // Now build actual PDF with proper cross-reference
  const pdfParts: string[] = []
  pdfParts.push("%PDF-1.4")

  const offsets: number[] = []

  // Track byte offset
  let currentOffset = pdfParts[0].length + 1 // +1 for newline

  // Object 1: Catalog
  offsets[1] = currentOffset
  const catalogStr = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`
  pdfParts.push(catalogStr)
  currentOffset += catalogStr.length

  // Object 2: Pages
  offsets[2] = currentOffset
  const pageRefsStr = pageRefs.map(n => `${n} 0 R`).join(" ")
  const pagesStr = `2 0 obj\n<< /Type /Pages /Kids [${pageRefsStr}] /Count ${students.length} >>\nendobj\n`
  pdfParts.push(pagesStr)
  currentOffset += pagesStr.length

  // Object 3: Font
  offsets[3] = currentOffset
  const fontStr = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
  pdfParts.push(fontStr)
  currentOffset += fontStr.length

  let nextObj = 4

  // For each student: content stream + page
  for (let i = 0; i < students.length; i++) {
    const streamData = pageContents[i].streamData
    const streamBytes = Buffer.byteLength(streamData, "utf-8")

    // Content stream object
    const contentObj = nextObj
    offsets[contentObj] = currentOffset
    const contentStr = `${contentObj} 0 obj\n<< /Length ${streamBytes} >>\nstream\n${streamData}\nendstream\nendobj\n`
    pdfParts.push(contentStr)
    currentOffset += contentStr.length
    nextObj++

    // Page object
    const pageObj = nextObj
    offsets[pageObj] = currentOffset
    pageRefs[i] = pageObj // update reference
    const pageStr = `${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`
    pdfParts.push(pageStr)
    currentOffset += pageStr.length
    nextObj++
  }

  // Re-build pages object with correct page references
  const finalPageRefsStr = pageRefs.map(n => `${n} 0 R`).join(" ")

  // Build the complete PDF from scratch with correct references
  const finalParts: string[] = []
  finalParts.push("%PDF-1.4\n")

  const finalOffsets: number[] = []
  let offset = finalParts[0].length

  // Catalog
  finalOffsets[1] = offset
  let s = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`
  finalParts.push(s)
  offset += s.length

  // Font
  finalOffsets[3] = offset
  s = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
  finalParts.push(s)
  offset += s.length

  // Content + Page objects for each student
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

  // Pages object (object 2) — must come after pages since we reference them
  finalOffsets[2] = offset
  const pagesRefStr = finalPageRefs.map(n => `${n} 0 R`).join(" ")
  s = `2 0 obj\n<< /Type /Pages /Kids [${pagesRefStr}] /Count ${students.length} >>\nendobj\n`
  finalParts.push(s)
  offset += s.length

  // Cross-reference table
  const xrefOffset = offset
  const totalObjects = objIdx
  s = `xref\n0 ${totalObjects}\n0000000000 65535 f \n`
  for (let i = 1; i < totalObjects; i++) {
    const off = finalOffsets[i] || 0
    s += `${String(off).padStart(10, "0")} 00000 n \n`
  }
  finalParts.push(s)

  // Trailer
  s = `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  finalParts.push(s)

  return Buffer.from(finalParts.join(""), "utf-8")
}
