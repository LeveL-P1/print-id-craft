import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageUpload, storagePublicUrl, ensureBucket } from "@/lib/storage"

export const maxDuration = 60; // Vercel function timeout config

const BUCKET = "student-photos"
const MAX_FILES = 500
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per photo
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

let bucketReady = false

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id

    // Get all students for this school
    const students = await prisma.student.findMany({
      where: { schoolId },
      select: {
        id: true,
        serialNumber: true,
        formData: true,
        photoUrl: true,
      },
    })

    if (students.length === 0) {
      return NextResponse.json({ error: "No students found in this school. Import students first." }, { status: 400 })
    }

    // Build lookup maps for matching (case-insensitive, trimmed)
    const byPhotoId: Record<string, typeof students[0]> = {}
    const bySerial: Record<string, typeof students[0]> = {}
    const byRollNo: Record<string, typeof students[0]> = {}
    const byName: Record<string, typeof students[0]> = {}
    const byFather: Record<string, typeof students[0]> = {}
    const byStudentName: Record<string, typeof students[0]> = {}

    for (const s of students) {
      // Serial number match
      bySerial[s.serialNumber.toLowerCase().trim()] = s

      const fd = s.formData as Record<string, string>

      // Photo ID match (primary — from Excel "Photo ID" column)
      const photoId = fd?.photoId || fd?.["Photo ID"] || fd?.["photo_id"] || fd?.["PhotoID"] || ""
      if (photoId) {
        byPhotoId[String(photoId).toLowerCase().trim()] = s
      }

      // Roll number match
      const rollNo = fd?.rollNo || fd?.["Roll No."] || fd?.["roll_no"] || fd?.srNo || fd?.["NO"] || ""
      if (rollNo) {
        byRollNo[String(rollNo).toLowerCase().trim()] = s
      }

      // Full name match (multiple keys)
      const name = fd?.fullName || fd?.["Full Name"] || fd?.name || fd?.["Student Name"] || fd?.Student_Name || ""
      if (name) {
        const nameLower = name.toLowerCase().trim()
        byName[nameLower] = s
        // Also index stripped version (no spaces, no special chars)
        byStudentName[nameLower.replace(/\s+/g, "")] = s
        byStudentName[nameLower.replace(/\s+/g, "_")] = s
      }

      // Father name/number match
      const fatherName = fd?.fatherName || fd?.["Father"] || fd?.["Father Name"] || fd?.["Father's Name"] || fd?.father || ""
      if (fatherName) {
        byFather[String(fatherName).toLowerCase().trim()] = s
      }

      // Father phone match
      const fatherPhone = fd?.fatherPhone || fd?.["Mob.- Father -"] || fd?.["mob_father"] || fd?.["Father Phone"] || ""
      if (fatherPhone) {
        byFather[String(fatherPhone).toLowerCase().trim()] = s
      }
    }

    const formData = await req.formData()
    const files = formData.getAll("photos") as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No photos uploaded" }, { status: 400 })
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} photos per upload. You sent ${files.length}.` }, { status: 400 })
    }

    // Ensure bucket
    if (!bucketReady) {
      await ensureBucket(BUCKET)
      bucketReady = true
    }

    const matched: Array<{ filename: string; studentName: string; serialNumber: string; matchedBy: string }> = []
    const unmatched: string[] = []
    const errors: Array<{ filename: string; error: string }> = []

    // Process files concurrently in batches of 10
    const BATCH_SIZE = 10
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async (file) => {
        const filename = file.name
        // Strip extension to get the identity key
        const baseName = filename.replace(/\.[^.]+$/, "").trim()
        const baseNameLower = baseName.toLowerCase()
        // Also strip underscores/hyphens for fuzzy match
        const baseNameNormalized = baseNameLower.replace(/[\s_-]+/g, "")

        // Validate file
        if (!ALLOWED_TYPES.includes(file.type)) {
          errors.push({ filename, error: "Invalid type — must be JPEG, PNG, or WebP" })
          return
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push({ filename, error: "File too large — max 5MB" })
          return
        }

        // Try to match: photoId → serial → rollNo → name → father → studentName (priority order)
        let student = byPhotoId[baseNameLower]
        let matchedBy = "Photo ID"

        if (!student) {
          student = bySerial[baseNameLower]
          matchedBy = "Serial Number"
        }
        if (!student) {
          student = byRollNo[baseNameLower]
          matchedBy = "Roll No."
        }
        if (!student) {
          student = byName[baseNameLower]
          matchedBy = "Full Name"
        }
        // Try student name with stripped spaces (e.g., "RahulSharma" → match "rahul sharma")
        if (!student) {
          student = byStudentName[baseNameNormalized]
          matchedBy = "Student Name"
        }
        // Try father name/number match
        if (!student) {
          student = byFather[baseNameLower]
          matchedBy = "Father Name/No."
        }

        // Also try matching just the numeric part (e.g., "DSC_8574" → "8574")
        if (!student) {
          const numericOnly = baseName.replace(/\D/g, "")
          if (numericOnly) {
            student = byRollNo[numericOnly] || byRollNo[numericOnly.replace(/^0+/, "")]
            matchedBy = "Roll No. (numeric)"
          }
        }

        // Try extracting number after prefix (e.g., "DSC_8574" → "8574", "BB25035" → "25035")
        if (!student) {
          const prefixMatch = baseName.match(/^[A-Za-z]+[_-]?(\d+)$/)
          if (prefixMatch) {
            const num = prefixMatch[1]
            // Try as Photo ID number part
            for (const [pid, s] of Object.entries(byPhotoId)) {
              const pidNum = pid.replace(/\D/g, "")
              if (pidNum && pidNum === num) {
                student = s
                matchedBy = "Photo ID (number)"
                break
              }
            }
          }
        }

        // Try partial serial match (last part after dash)
        if (!student) {
          for (const [serial, s] of Object.entries(bySerial)) {
            const parts = serial.split("-")
            const lastPart = parts[parts.length - 1]
            if (lastPart && baseNameLower === lastPart) {
              student = s
              matchedBy = "Serial (partial)"
              break
            }
          }
        }

        // Try case-insensitive substring match on photoId (e.g., "BB25035" matches "bb25035")
        if (!student) {
          for (const [pid, s] of Object.entries(byPhotoId)) {
            if (pid === baseNameLower || baseNameLower.includes(pid) || pid.includes(baseNameLower)) {
              student = s
              matchedBy = "Photo ID (partial)"
              break
            }
          }
        }

        // Final try: fuzzy name match — check if filename contains a student name or vice versa
        if (!student) {
          for (const [nameKey, s] of Object.entries(byName)) {
            if (baseNameLower.includes(nameKey) || nameKey.includes(baseNameLower)) {
              student = s
              matchedBy = "Name (fuzzy)"
              break
            }
          }
        }

        if (!student) {
          unmatched.push(filename)
          return
        }

        // Upload photo to Supabase
        try {
          const arrayBuffer = await file.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const ext = filename.split(".").pop()?.toLowerCase() || "jpg"
          const filePath = `students/${schoolId}/${student.id}.${ext}`

          const { error: uploadError } = await storageUpload(BUCKET, filePath, buffer, {
            contentType: file.type,
            upsert: true,
          })

          if (uploadError) {
            errors.push({ filename, error: `Upload failed: ${uploadError.message}` })
            return
          }

          const publicUrl = storagePublicUrl(BUCKET, filePath)

          // Update student record
          await prisma.student.update({
            where: { id: student.id },
            data: { photoUrl: publicUrl },
          })

          const fd = student.formData as Record<string, string>
          matched.push({
            filename,
            studentName: fd?.fullName || fd?.["Full Name"] || "Unknown",
            serialNumber: student.serialNumber,
            matchedBy,
          })
        } catch (err: any) {
          errors.push({ filename, error: err?.message || "Upload failed" })
        }
      }))
    }

    return NextResponse.json({
      success: true,
      data: {
        total: files.length,
        matched: matched.length,
        unmatched: unmatched.length,
        errors: errors.length,
        matchedFiles: matched.slice(0, 50),
        unmatchedFiles: unmatched.slice(0, 50),
        errorFiles: errors.slice(0, 20),
      },
    })
  } catch (error: any) {
    console.error("Bulk photo upload error:", error)
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 })
  }
}
