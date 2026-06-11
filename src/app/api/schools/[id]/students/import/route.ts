import { NextResponse } from "next/server"
import { inferFieldRole } from "@/lib/field-resolver"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"
import { reportError } from "@/lib/observability"
import { enqueueJob, kickJobWorker } from "@/lib/jobs/enqueue"
import { MAX_IMPORT_ROWS, parseCsvRows, validateImportFile } from "@/lib/spreadsheet-safety"
import { parseExcelBuffer } from "@/lib/excel"
import { allocateStudentSerials } from "@/lib/student-serial"
import { buildStudentIndexData } from "@/lib/student-index"

export const maxDuration = 300; // Vercel Pro function timeout config

const QR_JOB_CHUNK_SIZE = 500

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id

    // Verify school + get template field config
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: { template: { select: { fieldConfig: true } }, classes: { select: { id: true, name: true } } },
    })
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const classId = formData.get("classId") as string | null // Optional now — if provided, use as fallback

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    const fileValidation = validateImportFile(file)
    if (!fileValidation.ok) {
      return NextResponse.json({ error: fileValidation.error }, { status: 400 })
    }

    // Parse the Excel/CSV file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    let rawRows: Record<string, string>[]
    try {
      if (fileValidation.extension === "csv") {
        rawRows = parseCsvRows(new TextDecoder("utf-8").decode(buffer))
      } else {
        rawRows = await parseExcelBuffer(buffer)
      }
    } catch (error: any) {
      if (error?.message?.startsWith("Maximum ")) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid file format. Please upload an Excel (.xlsx) or CSV file." }, { status: 400 })
    }
    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No data rows found in the spreadsheet." }, { status: 400 })
    }

    if (rawRows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ error: `Maximum ${MAX_IMPORT_ROWS} students per import. Your file has ${rawRows.length} rows.` }, { status: 400 })
    }

    // Field config from template
    const fieldConfig = (school.template?.fieldConfig || []) as Array<{ key: string; label: string; type: string; required: boolean }>

    // Build a label→key mapping for flexible column matching.
    // IMPORTANT: Apply generic aliases FIRST, then template fieldConfig LAST so
    // that the school's own template keys always win over the generic defaults.
    const labelToKey: Record<string, string> = {}

    // Generic fallback aliases (lowest priority)
    labelToKey["name"] = "fullName"
    labelToKey["student name"] = "fullName"
    labelToKey["full name"] = "fullName"
    labelToKey["roll no"] = "rollNo"
    labelToKey["roll no."] = "rollNo"
    labelToKey["roll number"] = "rollNo"
    labelToKey["admission no"] = "rollNo"
    labelToKey["admission no."] = "rollNo"
    labelToKey["date of birth"] = "dob"
    labelToKey["dob"] = "dob"
    labelToKey["blood group"] = "bloodGroup"
    labelToKey["father name"] = "fatherName"
    labelToKey["father's name"] = "fatherName"
    labelToKey["father"] = "fatherName"
    labelToKey["mother name"] = "motherName"
    labelToKey["mother's name"] = "motherName"
    labelToKey["mother"] = "motherName"
    labelToKey["phone"] = "phone"
    labelToKey["mobile"] = "phone"
    labelToKey["phone number"] = "phone"
    labelToKey["mobile number"] = "phone"
    labelToKey["contact"] = "phone"
    labelToKey["address"] = "address"

    // Photo ID / Photo URL aliases
    labelToKey["photo url"] = "photoUrl"
    labelToKey["photo"] = "photoId"
    labelToKey["photo id"] = "photoId"
    labelToKey["photoid"] = "photoId"
    labelToKey["photo_id"] = "photoId"
    labelToKey["photo no"] = "photoId"
    labelToKey["photo no."] = "photoId"
    labelToKey["photo number"] = "photoId"
    labelToKey["photo_no"] = "photoId"
    labelToKey["img"] = "photoId"
    labelToKey["img no"] = "photoId"
    labelToKey["img no."] = "photoId"
    labelToKey["image no"] = "photoId"
    labelToKey["image no."] = "photoId"

    // Class / Section aliases
    labelToKey["class"] = "class"
    labelToKey["class-section"] = "classSection"
    labelToKey["class section"] = "classSection"
    labelToKey["class_section"] = "classSection"
    labelToKey["section"] = "section"
    labelToKey["branch"] = "branch"
    labelToKey["division"] = "section"

    // NO / Sr. No aliases
    labelToKey["no"] = "srNo"
    labelToKey["no."] = "srNo"
    labelToKey["sr no"] = "srNo"
    labelToKey["sr no."] = "srNo"
    labelToKey["sr. no."] = "srNo"
    labelToKey["s.no"] = "srNo"

    // GR No / Registration number aliases
    labelToKey["gr no"] = "grNo"
    labelToKey["gr no."] = "grNo"
    labelToKey["gr. no."] = "grNo"
    labelToKey["gr number"] = "grNo"
    labelToKey["grno"] = "grNo"
    labelToKey["gr_no"] = "grNo"
    labelToKey["registration no"] = "grNo"
    labelToKey["registration no."] = "grNo"
    labelToKey["reg no"] = "grNo"
    labelToKey["reg no."] = "grNo"

    // Flag / House color aliases
    labelToKey["flag"] = "flagColor"
    labelToKey["flag color"] = "flagColor"
    labelToKey["flag colour"] = "flagColor"
    labelToKey["flag_color"] = "flagColor"
    labelToKey["house"] = "flagColor"
    labelToKey["house color"] = "flagColor"
    labelToKey["house colour"] = "flagColor"
    labelToKey["house_color"] = "flagColor"
    labelToKey["team"] = "flagColor"
    labelToKey["team color"] = "flagColor"
    labelToKey["colour"] = "flagColor"
    labelToKey["color"] = "flagColor"
    labelToKey["group color"] = "flagColor"
    labelToKey["group colour"] = "flagColor"

    // Template fieldConfig applied LAST — highest priority so school-specific
    // field keys always override the generic aliases above.
    for (const f of fieldConfig) {
      labelToKey[f.label.toLowerCase().trim()] = f.key
      labelToKey[f.key.toLowerCase().trim()] = f.key
    }

    // Map Excel columns to our field keys
    const excelHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
    const columnMap: Record<string, string> = {} // excelHeader → fieldKey
    for (const header of excelHeaders) {
      const normalized = header.toLowerCase().trim()
      if (labelToKey[normalized]) {
        columnMap[header] = labelToKey[normalized]
      }
    }

    // Detect if we have a class-section column for auto-class creation
    const classColumnHeader = excelHeaders.find(h => {
      const n = h.toLowerCase().trim()
      return n === "class-section" || n === "class section" || n === "class_section" || n === "class"
    })

    // Detect photo ID column
    const photoIdHeader = excelHeaders.find(h => {
      const n = h.toLowerCase().trim()
      return n === "photo id" || n === "photoid" || n === "photo_id" || n === "photo"
        || n === "photo no" || n === "photo no." || n === "photo_no" || n === "photo number"
        || n === "img" || n === "img no" || n === "img no." || n === "image no" || n === "image no."
    })

    // Detect flag/house color column
    const flagColumnHeader = excelHeaders.find(h => {
      const n = h.toLowerCase().trim()
      return n === "flag" || n === "flag color" || n === "flag colour" || n === "flag_color"
        || n === "house" || n === "house color" || n === "house colour" || n === "house_color"
        || n === "team" || n === "team color" || n === "colour" || n === "color"
        || n === "group color" || n === "group colour"
    })

    // If we have class column, gather unique class names and auto-create them
    const classNameToId: Record<string, string> = {}
    // Populate existing classes
    for (const c of school.classes) {
      classNameToId[c.name.toLowerCase().trim()] = c.id
    }

    if (classColumnHeader) {
      // Find all unique class names from the data
      const uniqueClasses = new Set<string>()
      for (const row of rawRows) {
        const className = String(row[classColumnHeader] ?? "").trim()
        if (className && !classNameToId[className.toLowerCase().trim()]) {
          uniqueClasses.add(className)
        }
      }

      // Auto-create missing classes
      for (const className of Array.from(uniqueClasses)) {
        try {
          const newClass = await prisma.class.create({
            data: {
              name: className,
              schoolId,
              isActive: true,
            },
          })
          classNameToId[className.toLowerCase().trim()] = newClass.id
        } catch (err: any) {
          console.error(`Failed to create class "${className}":`, err?.message)
        }
      }
    }

    // Fallback class: use classId from form, or the first class
    let fallbackClassId = classId || school.classes[0]?.id || ""
    if (classColumnHeader && Object.keys(classNameToId).length > 0 && !fallbackClassId) {
      fallbackClassId = Object.values(classNameToId)[0]
    }

    if (!fallbackClassId && !classColumnHeader) {
      return NextResponse.json({ error: "No class found. Create at least one class, or include a 'Class-Section' column in your Excel." }, { status: 400 })
    }

    // Validate each row & build student data
    const validRows: Array<{ formData: Record<string, string>; photoId: string; className: string; classId: string; rowNum: number }> = []
    const errors: Array<{ row: number; field: string; message: string }> = []

    // Required fields check — but relaxed: only fullName is truly hard-required
    const requiredFields = fieldConfig.filter(f => f.required && f.key !== "class")

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i]
      const rowNum = i + 2 // Excel row (1-indexed header + data)
      const studentFormData: Record<string, string> = {}
      let photoId = ""
      let rowClassName = ""

      // Map columns
      for (const [excelHeader, fieldKey] of Object.entries(columnMap)) {
        const val = String(raw[excelHeader] ?? "").trim()
        if (fieldKey === "photoUrl") {
          // Skip — we handle photos separately
        } else if (fieldKey === "photoId") {
          photoId = val
          studentFormData["photoId"] = val // also store in form data for later matching
        } else if (fieldKey === "classSection") {
          rowClassName = val
          studentFormData["class"] = val
        } else if (fieldKey === "class" && !rowClassName) {
          rowClassName = val
          studentFormData["class"] = val
        } else if (fieldKey === "srNo" || fieldKey === "branch") {
          studentFormData[fieldKey] = val
        } else {
          studentFormData[fieldKey] = val
        }
      }

      // Also check unmapped columns — store them too (extra data like Branch, NO, etc.)
      for (const [header, value] of Object.entries(raw)) {
        if (!columnMap[header]) {
          const key = header.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "")
          if (key && String(value).trim()) {
            studentFormData[key] = String(value).trim()
          }
        }
      }

      // Determine class for this row
      let rowClassId = fallbackClassId
      if (rowClassName) {
        const mappedId = classNameToId[rowClassName.toLowerCase().trim()]
        if (mappedId) {
          rowClassId = mappedId
        }
      }
      if (!rowClassName && classColumnHeader) {
        rowClassName = String(raw[classColumnHeader] ?? "").trim()
        studentFormData["class"] = rowClassName
        const mappedId = classNameToId[rowClassName.toLowerCase().trim()]
        if (mappedId) rowClassId = mappedId
      }

      // Must have at least a name
      if (!studentFormData.fullName && !studentFormData["Full Name"]) {
        // Try "Student Name" directly
        const nameHeader = excelHeaders.find(h => h.toLowerCase().trim().includes("name") && !h.toLowerCase().includes("father") && !h.toLowerCase().includes("mother"))
        if (nameHeader) {
          studentFormData.fullName = String(raw[nameHeader] ?? "").trim()
        }
      }

      if (!studentFormData.fullName && !studentFormData["Full Name"]) {
        errors.push({ row: rowNum, field: "Full Name", message: "Student name is required" })
        continue
      }

      // Validate required fields (soft — log but don't skip)
      for (const rf of requiredFields) {
        if (rf.key === "fullName") continue // already checked
        if (!studentFormData[rf.key] || studentFormData[rf.key].trim() === "") {
          // Not fatal — still import, just note
        }
      }

      validRows.push({
        formData: studentFormData,
        photoId,
        className: rowClassName || "Default",
        classId: rowClassId,
        rowNum,
      })
    }

    // If mode is "validate", return validation results without saving
    const mode = formData.get("mode") as string | null
    if (mode === "validate") {
      // Gather auto-created class info
      const autoClasses = classColumnHeader
        ? Array.from(new Set(validRows.map(r => r.className))).filter(Boolean)
        : []

      // Gather unique flag colors from imported data
      const uniqueFlagColors = flagColumnHeader
        ? Array.from(new Set(validRows.map(r => r.formData.flagColor).filter(Boolean)))
        : []

      return NextResponse.json({
        success: true,
        data: {
          totalRows: rawRows.length,
          validRows: validRows.length,
          errorRows: errors.length,
          errors: errors.slice(0, 50),
          autoClasses,
          hasPhotoIdColumn: !!photoIdHeader,
          hasClassColumn: !!classColumnHeader,
          hasFlagColumn: !!flagColumnHeader,
          uniqueFlagColors,
          preview: validRows.slice(0, 10).map(r => ({
            ...r.formData,
            _rowNum: r.rowNum,
            _photoId: r.photoId,
            _className: r.className,
          })),
          mappedColumns: Object.entries(columnMap).map(([excel, key]) => ({
            excelColumn: excel,
            mappedTo: key,
            label: fieldConfig.find(f => f.key === key)?.label || key,
          })),
          unmappedColumns: excelHeaders.filter(h => !columnMap[h]),
        },
      })
    }

    // --- IMPORT MODE: Create all valid students ---
    if (validRows.length === 0) {
      return NextResponse.json({ 
        error: "No valid rows to import. Fix the errors and try again.", 
        errors: errors.slice(0, 20) 
      }, { status: 400 })
    }

    const createdStudents: Array<{ id: string; serialNumber: string; name: string; className: string; photoId: string }> = []
    const importErrors: Array<{ row: number; error: string }> = []

    try {
      await prisma.$transaction(async (tx) => {
        const serialNumbers = await allocateStudentSerials(tx, schoolId, school.name, validRows.length)

        const studentsToCreate = validRows.map((row, index) => ({
          id: randomUUID(),
          schoolId,
          classId: row.classId,
          serialNumber: serialNumbers[index],
          ...buildStudentIndexData(row.formData, row.classId),
          formData: row.formData,
          photoUrl: "",
          status: "SUBMITTED" as any,
          _row: row,
        }))

        const CHUNK_SIZE = 500
        for (let i = 0; i < studentsToCreate.length; i += CHUNK_SIZE) {
          const chunk = studentsToCreate.slice(i, i + CHUNK_SIZE)
          await tx.student.createMany({
            data: chunk.map((s) => {
              const { _row, ...data } = s
              return data
            }),
          })

          chunk.forEach((s) => {
            createdStudents.push({
              id: s.id,
              serialNumber: s.serialNumber,
              name: s._row.formData.fullName || s._row.formData["Full Name"] || "Unknown",
              className: s._row.className,
              photoId: s._row.photoId,
            })
          })
        }
      }, { timeout: 45_000 })
    } catch (err: any) {
      validRows.forEach((row) => {
        importErrors.push({ row: row.rowNum, error: err?.message || "Batch insert failed" })
      })
    }

    if (createdStudents.length === 0 && importErrors.length > 0) {
      return NextResponse.json(
        { error: "Internal server error", errors: importErrors.slice(0, 20) },
        { status: 500 }
      )
    }

    // AUTO-SYNC: Update template fieldConfig to match Excel columns
    // This ensures the template fields reflect exactly what was imported from the Excel sheet
    if (createdStudents.length > 0 && excelHeaders.length > 0) {
      try {
        const newFieldConfig = excelHeaders
          .filter(h => {
            const n = h.toLowerCase().trim()
            // Skip serial/row number columns and photo URL columns
            return n !== "photo url" && n !== "photourl"
          })
          .map(h => {
            const n = h.toLowerCase().trim()
            const mappedKey = columnMap[h] || h.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "")
            let formType = "text"
            if (mappedKey === "phone" || n.includes("mobile") || n.includes("phone") || n.includes("contact")) {
              formType = "tel"
            }
            const role = inferFieldRole(mappedKey, h)
            return {
              key: mappedKey,
              label: h, // Keep original Excel column name as the label
              type: formType,
              required: mappedKey === "fullName",
              ...(role ? { role } : {}),
            }
          })

        await prisma.template.upsert({
          where: { schoolId },
          update: { fieldConfig: newFieldConfig },
          create: {
            schoolId,
            frontLayout: [],
            backLayout: [],
            fieldConfig: newFieldConfig,
            cardWidthMm: 85.6,
            cardHeightMm: 54.0,
            printDpi: 300,
            orientation: "PORTRAIT",
            fieldMappings: [],
            photoBgColor: "#FFFFFF",
          },
        })
      } catch (err: any) {
        console.error("Failed to auto-sync template fieldConfig:", err?.message)
      }
    }

    let qrJobId: string | undefined
    const qrJobIds: string[] = []
    if (createdStudents.length > 0) {
      for (let i = 0; i < createdStudents.length; i += QR_JOB_CHUNK_SIZE) {
        const chunk = createdStudents.slice(i, i + QR_JOB_CHUNK_SIZE)
        const job = await enqueueJob({
          type: "GENERATE_QR",
          schoolId,
          createdById: session.user.id,
          payload: {
            students: chunk.map((s) => ({
              id: s.id,
              serialNumber: s.serialNumber,
            })),
          },
        })
        qrJobIds.push(job.id)
      }
      qrJobId = qrJobIds[0]
      await kickJobWorker(new URL(req.url).origin)
    }

    return NextResponse.json({
      success: true,
      data: {
        imported: createdStudents.length,
        failed: importErrors.length,
        total: validRows.length,
        students: createdStudents.slice(0, 50),
        errors: importErrors.slice(0, 20),
        classesCreated: classColumnHeader ? Array.from(new Set(validRows.map(r => r.className))).length : 0,
        qrJobId,
        qrJobIds,
      },
    })
  } catch (error: any) {
    console.error("Bulk import error:", error)
    await reportError(error, {
      type: "IMPORT_FAILED",
      schoolId: params.id,
      message: "Bulk student import failed",
    })
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
