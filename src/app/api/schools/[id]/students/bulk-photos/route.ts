import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { storageUpload, storagePublicUrl, ensureBucket } from "@/lib/storage"

export const maxDuration = 300; // Vercel Pro function timeout config

const BUCKET = "student-photos"
const MAX_FILES = 500
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB per photo
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]
const PHOTO_UPLOAD_CONCURRENCY = 8

let bucketReady = false

// --- Per-instance lookup cache --------------------------------------------
// Rebuilding the 6 student-lookup maps from scratch on every batch is the
// dominant cost when a client uploads thousands of photos in many small
// requests. We memoize per (schoolId) with a short TTL so concurrent batches
// in the same hot serverless instance share one DB read.
// A 60s TTL is short enough that newly added students appear quickly while
// keeping ~99% cache-hit rate during a single bulk-upload session.
type StudentRow = { id: string; serialNumber: string; formData: any; photoUrl: string | null; photoPath?: string | null }
type LookupMaps = {
  byId: Map<string, StudentRow>
  byPhotoId: Map<string, StudentRow>
  bySerial: Map<string, StudentRow>
  byRollNo: Map<string, StudentRow>
  byName: Map<string, StudentRow>
  byFather: Map<string, StudentRow>
  byStudentName: Map<string, StudentRow>
  count: number
}
const LOOKUP_TTL_MS = 60_000
const MAX_LOOKUP_CACHE_ENTRIES = 20
const lookupCache = new Map<string, { maps: LookupMaps; ts: number }>()

function pruneLookupCache(now = Date.now()) {
  lookupCache.forEach((entry, key) => {
    if (now - entry.ts >= LOOKUP_TTL_MS) lookupCache.delete(key)
  })

  while (lookupCache.size > MAX_LOOKUP_CACHE_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTs = Infinity
    lookupCache.forEach((entry, key) => {
      if (entry.ts < oldestTs) {
        oldestTs = entry.ts
        oldestKey = key
      }
    })
    if (!oldestKey) break
    lookupCache.delete(oldestKey)
  }
}

async function getLookupMaps(schoolId: string): Promise<LookupMaps> {
  pruneLookupCache()
  const hit = lookupCache.get(schoolId)
  if (hit && Date.now() - hit.ts < LOOKUP_TTL_MS) return hit.maps

  const students = await prisma.student.findMany({
    where: { schoolId },
    select: { id: true, serialNumber: true, formData: true, photoUrl: true, photoPath: true },
  })

  const maps: LookupMaps = {
    byId: new Map(),
    byPhotoId: new Map(),
    bySerial: new Map(),
    byRollNo: new Map(),
    byName: new Map(),
    byFather: new Map(),
    byStudentName: new Map(),
    count: students.length,
  }

  for (const s of students) buildIndexForStudent(s, maps)

  lookupCache.set(schoolId, { maps, ts: Date.now() })
  pruneLookupCache()
  return maps
}

function buildIndexForStudent(s: StudentRow, maps: LookupMaps) {
  maps.byId.set(s.id, s)
  maps.bySerial.set(s.serialNumber.toLowerCase().trim(), s)

  const fd = s.formData as Record<string, string>

  let photoId = fd?.photoId || fd?.["Photo ID"] || fd?.["photo_id"] || fd?.["PhotoID"]
    || fd?.["PHOTO NO."] || fd?.["Photo No"] || fd?.["Photo No."] || fd?.["photo no"] || fd?.["photo no."]
    || fd?.["photo_no"] || fd?.["Photo Number"] || fd?.["photo number"]
    || fd?.["IMG"] || fd?.["Img"] || fd?.["img"] || fd?.["Img No"] || fd?.["img no"] || fd?.["Image No"] || fd?.["image no"]
    || ""
  if (!photoId && fd) {
    for (const [key, val] of Object.entries(fd)) {
      const kl = key.toLowerCase().replace(/[^a-z0-9]/g, "")
      if ((kl.includes("photo") || kl.includes("image") || kl.includes("img"))
          && (kl.includes("no") || kl.includes("id") || kl.includes("num"))
          && val) {
        photoId = String(val)
        break
      }
    }
  }
  if (photoId) {
    const pidClean = String(photoId).toLowerCase().trim()
    maps.byPhotoId.set(pidClean, s)
    const numericPart = pidClean.replace(/^[a-z]+[_\-\s]*/i, "")
    if (numericPart && numericPart !== pidClean) maps.byPhotoId.set(numericPart, s)
  }

  const rollNo = fd?.rollNo || fd?.["Roll No."] || fd?.["roll_no"] || fd?.srNo || fd?.["NO"] || ""
  if (rollNo) maps.byRollNo.set(String(rollNo).toLowerCase().trim(), s)

  const grNo = fd?.grNo || fd?.["GR NO"] || fd?.["GR No"] || fd?.["GR No."] || fd?.["gr_no"] || ""
  if (grNo) maps.byRollNo.set(String(grNo).toLowerCase().trim(), s)

  const name = fd?.fullName || fd?.["Full Name"] || fd?.name || fd?.["Student Name"] || fd?.Student_Name || ""
  if (name) {
    const nameLower = name.toLowerCase().trim()
    maps.byName.set(nameLower, s)
    maps.byStudentName.set(nameLower.replace(/\s+/g, ""), s)
    maps.byStudentName.set(nameLower.replace(/\s+/g, "_"), s)
  }

  const fatherName = fd?.fatherName || fd?.["Father"] || fd?.["Father Name"] || fd?.["Father's Name"] || fd?.father || ""
  if (fatherName) maps.byFather.set(String(fatherName).toLowerCase().trim(), s)

  const fatherPhone = fd?.fatherPhone || fd?.["Mob.- Father -"] || fd?.["mob_father"] || fd?.["Father Phone"] || ""
  if (fatherPhone) maps.byFather.set(String(fatherPhone).toLowerCase().trim(), s)
}

// Allow callers to invalidate the cache after they finish writing photoUrl
// updates so subsequent requests see the freshest state.
function invalidateLookupCache(schoolId: string) {
  lookupCache.delete(schoolId)
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await worker(item)
    }
  })
  await Promise.all(workers)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const schoolId = params.id

    const maps = await getLookupMaps(schoolId)
    if (maps.count === 0) {
      return NextResponse.json({ error: "No students found in this school. Import students first." }, { status: 400 })
    }
    const { byId, byPhotoId, bySerial, byRollNo, byName, byFather, byStudentName } = maps

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
    // Collected DB writes — applied in a single transactional chunked sweep
    // at the end of the request so we don't pay per-file round-trip latency.
    const pendingUpdates: Array<{ id: string; photoUrl: string; photoPath: string }> = []

    // Storage uploads are I/O-bound, but unbounded parallelism can spike
    // memory and outbound connections on large requests. DB writes are deferred.
    await runWithConcurrency(files, PHOTO_UPLOAD_CONCURRENCY, async (file) => {
        const filename = file.name
        // Strip folder prefix (e.g., "Photos/IMG_2767.jpg" → "IMG_2767.jpg")
        const fileNameOnly = filename.includes("/") ? filename.split("/").pop()! : filename
        // Strip extension to get the identity key
        const baseName = fileNameOnly.replace(/\.[^.]+$/, "").trim()
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
        let student: StudentRow | undefined = byPhotoId.get(baseNameLower)
        let matchedBy = "Photo ID"

        if (!student) {
          student = bySerial.get(baseNameLower)
          matchedBy = "Serial Number"
        }
        if (!student) {
          student = byRollNo.get(baseNameLower)
          matchedBy = "Roll No."
        }
        if (!student) {
          student = byName.get(baseNameLower)
          matchedBy = "Full Name"
        }
        // Try student name with stripped spaces (e.g., "RahulSharma" → match "rahul sharma")
        if (!student) {
          student = byStudentName.get(baseNameNormalized)
          matchedBy = "Student Name"
        }
        // Try father name/number match
        if (!student) {
          student = byFather.get(baseNameLower)
          matchedBy = "Father Name/No."
        }

        // Also try matching just the numeric part (e.g., "DSC_8574" → "8574")
        if (!student) {
          const numericOnly = baseName.replace(/\D/g, "")
          if (numericOnly) {
            student = byRollNo.get(numericOnly) || byRollNo.get(numericOnly.replace(/^0+/, ""))
            matchedBy = "Roll No. (numeric)"
          }
        }

        // Try extracting number after prefix (e.g., "DSC_8574" → "8574", "BB25035" → "25035")
        if (!student) {
          const prefixMatch = baseName.match(/^[A-Za-z]+[_-]?(\d+)$/)
          if (prefixMatch) {
            const num = prefixMatch[1]
            // Try as Photo ID number part
            for (const [pid, s] of Array.from(byPhotoId)) {
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
          for (const [serial, s] of Array.from(bySerial)) {
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
          for (const [pid, s] of Array.from(byPhotoId)) {
            if (pid === baseNameLower || baseNameLower.includes(pid) || pid.includes(baseNameLower)) {
              student = s
              matchedBy = "Photo ID (partial)"
              break
            }
          }
        }

        // Final try: fuzzy name match — check if filename contains a student name or vice versa
        if (!student) {
          for (const [nameKey, s] of Array.from(byName)) {
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

          // Queue DB write instead of running it inline — batched below.
          pendingUpdates.push({ id: student.id, photoUrl: publicUrl, photoPath: filePath })

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
      })

    // Batched DB writes: one transaction per chunk of 50 photo URLs.
    // This avoids the per-file round-trip cost that previously dominated
    // wall-clock time when uploading thousands of photos.
    if (pendingUpdates.length > 0) {
      const DB_CHUNK = 50
      for (let i = 0; i < pendingUpdates.length; i += DB_CHUNK) {
        const chunk = pendingUpdates.slice(i, i + DB_CHUNK)
        try {
          await prisma.$transaction(
            chunk.map(u =>
              prisma.student.update({
                where: { id: u.id },
                data: { photoUrl: u.photoUrl, photoPath: u.photoPath },
              })
            )
          )
        } catch (txErr: any) {
          // If the transaction fails, fall back to per-row updates so a single
          // bad row doesn't lose the whole chunk's progress.
          for (const u of chunk) {
            try {
              await prisma.student.update({ where: { id: u.id }, data: { photoUrl: u.photoUrl, photoPath: u.photoPath } })
            } catch (rowErr: any) {
              errors.push({ filename: u.id, error: rowErr?.message || "DB update failed" })
            }
          }
        }
      }
      // Refresh the cached photoUrl on the in-memory rows so a subsequent
      // request from this same hot instance sees the new URLs without a
      // DB round-trip. We don't invalidate the whole cache because the
      // matching keys (Photo ID / serial / name) haven't changed.
      for (const u of pendingUpdates) {
        const row = byId.get(u.id)
        if (row) {
          row.photoUrl = u.photoUrl
          row.photoPath = u.photoPath
        }
      }
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
