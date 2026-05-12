"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import dynamic from "next/dynamic"

// Lazy-load heavy components — only loaded when their tab is active
const IDCardPreview = dynamic(() => import("@/components/IDCardPreview"), { ssr: false })
const JpgTemplateMapper = dynamic(() => import("@/components/JpgTemplateMapper"), { ssr: false })
const JpgCardPreview = dynamic(() => import("@/components/JpgCardPreview"), { ssr: false })
const BatchGenerator = dynamic(() => import("@/components/BatchGenerator"), { ssr: false })

/**
 * Resolve a student's flag-image URL by trying every column the import
 * route maps to "flagColor" — older student records may still store the
 * value under "House", "house", "Colour", etc., so we check those first
 * before falling back to a case-insensitive scan of every formData key.
 *
 * Without this fallback, a school whose Excel header was "HOUSE" (instead
 * of "Flag Color") would render with a missing flag in the preview even
 * though the upload + storage path worked correctly.
 */
function resolveFlagImageUrl(
  formData: Record<string, string> | undefined | null,
  flagImages: Record<string, string>,
): string | undefined {
  if (!formData) return undefined
  const candidates = [
    formData.flagColor,
    formData["Flag Color"],
    formData["flag_color"],
    formData["House"],
    formData["house"],
    formData["HOUSE"],
    formData["Colour"],
    formData["colour"],
    formData["Color"],
    formData["color"],
    formData["Team"],
    formData["team"],
  ].filter(Boolean) as string[]

  // Direct hits first
  for (const c of candidates) {
    if (flagImages[c]) return flagImages[c]
  }
  // Case-insensitive fallback against the whole flagImages map.
  // This matches a value of "blue" against an uploaded "Blue" flag, etc.
  const flagKeysLower: Record<string, string> = {}
  for (const k of Object.keys(flagImages)) flagKeysLower[k.toLowerCase()] = flagImages[k]
  for (const c of candidates) {
    const hit = flagKeysLower[c.toLowerCase()]
    if (hit) return hit
  }
  return undefined
}

type ClassData = {
  id: string
  name: string
  linkToken: string
  isActive: boolean
  expiresAt: string | null
  _count: { students: number }
  teachers: { id: string; name: string; email: string; isMainTeacher: boolean }[]
  createdAt: string
}

type StudentData = {
  id: string
  serialNumber: string
  photoUrl: string
  formData: any
  status: string
  flagNote: string | null
  teacherComment: string | null
  submittedAt: string
  class: { name: string }
}

type SchoolDetail = {
  id: string
  name: string
  contactEmail: string
  address: string | null
  logoUrl: string | null
  _count: { classes: number; students: number; batches: number }
  template: { id: string; fieldConfig: any } | null
  teachers?: any[]
}

type BatchData = {
  id: string
  studentCount: number
  status: string
  manifestPath: string | null
  frontPdfPath: string | null
  backPdfPath: string | null
  createdAt: string
}

export default function SchoolDetailPage() {
  const params = useParams()
  const router = useRouter()
  const schoolId = params.id as string

  const [tab, setTab] = useState<"overview"|"classes"|"students"|"template"|"generate"|"batches"|"export">("overview")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [classes, setClasses] = useState<ClassData[]>([])
  const [students, setStudents] = useState<StudentData[]>([])
  const [batches, setBatches] = useState<BatchData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentPage, setStudentPage] = useState(1)
  const [studentTotal, setStudentTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("")
  const [classFilter, setClassFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tabLoading, setTabLoading] = useState(false)

  // Add class
  const [newClassName, setNewClassName] = useState("")
  const [newExpiry, setNewExpiry] = useState("")
  const [addingClass, setAddingClass] = useState(false)

  // Batch generation
  const [generatingBatch, setGeneratingBatch] = useState(false)

  // Student detail modal
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null)
  const [templateData, setTemplateData] = useState<any>(null)

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoDragOver, setLogoDragOver] = useState(false)

  // Bulk import
  const [importOpen, setImportOpen] = useState(false)
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importClassId, setImportClassId] = useState("")
  const [importUploading, setImportUploading] = useState(false)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [dragOver, setDragOver] = useState(false)

  // Bulk photo upload
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoResult, setPhotoResult] = useState<any>(null)
  const [photoDragOver, setPhotoDragOver] = useState(false)
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0)
  const [photoUploadStatus, setPhotoUploadStatus] = useState('')
  // Manual matching for unmatched photos
  const [unmatchedFileMap, setUnmatchedFileMap] = useState<Record<string, File>>({})
  const [manualAssigning, setManualAssigning] = useState<string>('')
  const [manualSearchQuery, setManualSearchQuery] = useState('')
  const [allStudentsList, setAllStudentsList] = useState<any[]>([])

  // Flag management
  const [flagUploadOpen, setFlagUploadOpen] = useState(false)
  const [flagColors, setFlagColors] = useState<string[]>([])
  const [flagImages, setFlagImages] = useState<Record<string, string>>({})
  const [flagUploading, setFlagUploading] = useState<string>('')

  const fetchSchool = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}`)
      const data = await res.json()
      if (data.success) setSchool(data.data)
    } catch (err) { console.error(err) }
  }

  const fetchClasses = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes`)
      const data = await res.json()
      if (data.success) setClasses(data.data)
    } catch (err) { console.error(err) }
  }

  const fetchStudents = async (page = 1) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" })
      if (statusFilter) params.set("status", statusFilter)
      if (classFilter) params.set("classId", classFilter)
      if (searchQuery) params.set("search", searchQuery)
      const res = await fetch(`/api/schools/${schoolId}/students?${params}`)
      const data = await res.json()
      if (data.success) {
        setStudents(data.data)
        setStudentTotal(data.pagination.total)
        setStudentPage(data.pagination.page)
      }
    } catch (err) { console.error(err) }
  }

  const fetchBatches = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/batches`)
      const data = await res.json()
      if (data.success) setBatches(data.data)
    } catch (err) { console.error(err) }
  }

  const fetchTemplate = async () => {
    try {
      // cache: 'no-store' ensures the live JpgCardPreview reflects the latest
      // mappings/photo styling immediately after onSave, instead of a stale
      // cached template (e.g. previous photoBorderRadius value).
      const res = await fetch(`/api/schools/${schoolId}/template`, { cache: 'no-store' })
      const data = await res.json()
      if (data.success) setTemplateData(data.data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => {
    // Load only essential data first (school info, classes, template) for fast initial render
    Promise.all([fetchSchool(), fetchClasses(), fetchTemplate()]).finally(() => setLoading(false))
    // Defer heavier data fetches slightly to avoid blocking initial render
    setTimeout(() => { fetchStudents(); fetchFlags() }, 100)
  }, [schoolId])

  // Re-fetch students when filters/search change (but not on initial tab switch)
  const filtersInitialized = useRef(false)
  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true
      return
    }
    if (tab === "students") {
      setTabLoading(true)
      fetchStudents().finally(() => setTabLoading(false))
    }
  }, [statusFilter, classFilter, searchQuery])

  // Lazy-load tab data when switching tabs
  useEffect(() => {
    if (tab === "students" && students.length === 0 && !loading) {
      setTabLoading(true)
      fetchStudents().finally(() => setTabLoading(false))
    }
    if (tab === "batches" && batches.length === 0 && !loading) {
      setTabLoading(true)
      fetchBatches().finally(() => setTabLoading(false))
    }
  }, [tab])

  // Cleanup debounce timer
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [])

  const getExpiryBadge = (expiresAt: string | null) => {
    if (!expiresAt || !mounted) return null
    const exp = new Date(expiresAt)
    const now = new Date()
    const diffMs = exp.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffMs < 0) {
      return <span className="status-badge status-flagged" style={{ fontSize: 10 }} suppressHydrationWarning>Expired</span>
    } else if (diffDays <= 3) {
      return <span className="status-badge status-review" style={{ fontSize: 10 }} suppressHydrationWarning>Expires in {diffDays}d</span>
    } else {
      return <span style={{ fontSize: 11, color: '#94a3b8' }} suppressHydrationWarning>Expires in {diffDays}d</span>
    }
  }

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim()) return
    setAddingClass(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClassName, expiresAt: newExpiry || null }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("Class created!")
        setNewClassName("")
        setNewExpiry("")
        fetchClasses()
        fetchSchool()
      }
    } catch (err) {
      toast.error("Failed to create class")
    } finally {
      setAddingClass(false)
    }
  }

  const handleToggleClass = async (cid: string, isActive: boolean) => {
    await fetch(`/api/schools/${schoolId}/classes/${cid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    })
    toast.success(isActive ? "Class deactivated" : "Class activated")
    fetchClasses()
  }

  const handleDeleteClass = async (cid: string, name: string) => {
    const confirmed = prompt(`Type "DELETE" to confirm removing class "${name}" and all its students:`)
    if (confirmed !== "DELETE") return
    await fetch(`/api/schools/${schoolId}/classes/${cid}`, { method: "DELETE" })
    toast.success("Class deleted")
    fetchClasses()
    fetchSchool()
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/submit/${token}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied to clipboard!")
  }

  const shareWhatsApp = (token: string, className: string) => {
    const url = `${window.location.origin}/submit/${token}`
    const msg = encodeURIComponent(`📋 ID Card Registration Form\n\nSchool: ${school?.name}\nClass: ${className}\n\nPlease fill your details:\n${url}`)
    window.open(`https://wa.me/?text=${msg}`, "_blank")
  }

  const shareEmail = (token: string, className: string) => {
    const url = `${window.location.origin}/submit/${token}`
    const subject = encodeURIComponent(`ID Card Registration - ${school?.name} - ${className}`)
    const body = encodeURIComponent(`Dear Parent/Student,\n\nPlease fill the ID card registration form for ${className}:\n\n${url}\n\nRegards,\n${school?.name}`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  const handleStatusUpdate = async (sid: string, status: string) => {
    // Optimistic: update local state immediately for instant UI
    setStudents(prev => prev.map(s => s.id === sid ? { ...s, status } : s))
    toast.success(`Student status updated to ${status}`)

    // Fire API in background — revert on failure
    try {
      const res = await fetch(`/api/schools/${schoolId}/students/${sid}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error("API failed")
    } catch {
      toast.error("Failed to update status — reverting")
      fetchStudents(studentPage)
    }
  }

  const handleFlag = async (sid: string) => {
    const note = prompt("Enter flag reason:")
    if (!note) return

    // Optimistic: flag locally
    setStudents(prev => prev.map(s => s.id === sid ? { ...s, status: "FLAGGED", flagNote: note } : s))
    toast.success("Student flagged")

    try {
      const res = await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagNote: note }),
      })
      if (!res.ok) throw new Error("API failed")
    } catch {
      toast.error("Failed to flag — reverting")
      fetchStudents(studentPage)
    }
  }

  const handleUnflag = async (sid: string) => {
    // Optimistic: unflag locally, revert to SUBMITTED
    setStudents(prev => prev.map(s => s.id === sid ? { ...s, status: "SUBMITTED", flagNote: null } : s))
    toast.success("Student unflagged")

    try {
      const res = await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unflag: true }),
      })
      if (!res.ok) throw new Error("API failed")
    } catch {
      toast.error("Failed to unflag — reverting")
      fetchStudents(studentPage)
    }
  }

  const handleGenerateBatch = async () => {
    if (!confirm(`Generate print batch for all submitted/approved students in ${school?.name}?`)) return
    setGeneratingBatch(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/batches`, { method: "POST" })
      const data = await res.json()
      if (data.success) {
        toast.success(`Batch generation started! ${data.data.studentCount} students included.`)
        // Poll for completion
        const batchId = data.data.batchId
        const poll = setInterval(async () => {
          const r = await fetch(`/api/schools/${schoolId}/batches/${batchId}`)
          const d = await r.json()
          if (d.success && d.data.status === "READY") {
            clearInterval(poll)
            toast.success("Batch is ready for download!")
            fetchBatches()
            setGeneratingBatch(false)
          }
        }, 3000)
        // Safety timeout
        setTimeout(() => { clearInterval(poll); setGeneratingBatch(false); fetchBatches() }, 120000)
      } else {
        toast.error(data.error)
        setGeneratingBatch(false)
      }
    } catch (err) {
      toast.error("Failed to generate batch")
      setGeneratingBatch(false)
    }
  }

  // Bulk import handlers
  const handleImportValidate = async () => {
    if (!importFile) {
      toast.error("Please upload a file.")
      return
    }
    setImportUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      if (importClassId) fd.append("classId", importClassId)
      fd.append("mode", "validate")
      const res = await fetch(`/api/schools/${schoolId}/students/import`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setImportPreview(data.data)
        setImportStep("preview")
        // If flag colors were detected, update the flag state
        if (data.data.hasFlagColumn && data.data.uniqueFlagColors?.length > 0) {
          setFlagColors(prev => {
            const merged = new Set([...prev, ...data.data.uniqueFlagColors])
            return Array.from(merged)
          })
        }
      } else {
        toast.error(data.error || "Validation failed")
      }
    } catch (err) {
      toast.error("Failed to validate file")
    } finally {
      setImportUploading(false)
    }
  }

  const handleImportConfirm = async () => {
    if (!importFile) return
    setImportUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      if (importClassId) fd.append("classId", importClassId)
      fd.append("mode", "import")
      const res = await fetch(`/api/schools/${schoolId}/students/import`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setImportResult(data.data)
        setImportStep("result")
        toast.success(`${data.data.imported} students imported!`)
        fetchStudents()
        fetchSchool() // Refreshes template.fieldConfig (auto-synced from Excel columns)
        fetchClasses()
        fetchTemplate() // Refresh template data for dynamic columns
      } else {
        toast.error(data.error || "Import failed")
      }
    } catch (err) {
      toast.error("Import failed")
    } finally {
      setImportUploading(false)
    }
  }

  // Delete-all-students workflow — lets admins wipe a school's roster so a
  // corrected Excel can be re-uploaded without serial-number collisions or
  // stale rows from a previous import.
  const [deletingAll, setDeletingAll] = useState(false)
  const handleDeleteAllStudents = async () => {
    if (studentTotal === 0) {
      toast.info("No students to delete.")
      return
    }
    const confirm1 = window.prompt(
      `⚠️ This will PERMANENTLY delete ALL ${studentTotal} students for this school ` +
      `(including their photos and QR codes from the database).\n\n` +
      `Type DELETE to confirm:`
    )
    if (confirm1 !== "DELETE") {
      if (confirm1 !== null) toast.info("Delete cancelled — confirmation text did not match.")
      return
    }
    setDeletingAll(true)
    try {
      const res = await fetch(`/api/schools/${schoolId}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE_ALL" }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Deleted ${data.deleted} students. You can now re-upload your Excel.`)
        // Refresh local state
        setStudents([])
        setStudentTotal(0)
        setSelectedStudent(null)
        // Refetch in case anything else changed (e.g. classes from import-side-effects)
        fetchStudents()
      } else {
        toast.error(data.error || "Delete failed.")
      }
    } catch (err: any) {
      toast.error(err?.message || "Delete failed.")
    } finally {
      setDeletingAll(false)
    }
  }

  const resetImport = () => {
    setImportOpen(false)
    setImportStep("upload")
    setImportFile(null)
    setImportClassId("")
    setImportPreview(null)
    setImportResult(null)
  }

  // Bulk photo upload handlers
  const handleBulkPhotoUpload = async () => {
    if (photoFiles.length === 0) {
      toast.error("Please select photos to upload.")
      return
    }
    setPhotoUploading(true)
    setPhotoUploadProgress(0)
    setPhotoUploadStatus('Preparing upload...')
    
    try {
      // Upload in SIZE-AWARE batches. Vercel's serverless body limit is ~4.5 MB
      // per request, so we cap each POST at BATCH_MAX_BYTES and also at
      // BATCH_MAX_FILES to keep per-request memory/time bounded. We build the
      // batches up-front so the progress UI can show accurate batch counts.
      const BATCH_MAX_BYTES = 3.5 * 1024 * 1024 // ~3.5 MB — safely below the 4.5 MB platform limit
      const BATCH_MAX_FILES = 8                 // cap on file count per request
      const totalFiles = photoFiles.length

      const batches: File[][] = []
      {
        let current: File[] = []
        let currentSize = 0
        for (const f of photoFiles) {
          const size = f.size
          // If a single file is already over the limit, still send it alone —
          // the server will reject it with a clear 413 we can surface.
          if (current.length > 0 && (currentSize + size > BATCH_MAX_BYTES || current.length >= BATCH_MAX_FILES)) {
            batches.push(current)
            current = []
            currentSize = 0
          }
          current.push(f)
          currentSize += size
        }
        if (current.length > 0) batches.push(current)
      }

      let allMatched: any[] = []
      let allUnmatched: string[] = []
      let allErrors: any[] = []
      let processed = 0

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b]
        const batchNum = b + 1
        const totalBatches = batches.length

        setPhotoUploadStatus(`Uploading batch ${batchNum} of ${totalBatches} (${processed + batch.length}/${totalFiles} photos)...`)
        setPhotoUploadProgress(Math.round((processed / totalFiles) * 90))

        const fd = new FormData()
        for (const file of batch) {
          fd.append("photos", file)
        }

        let data: any = null
        try {
          const res = await fetch(`/api/schools/${schoolId}/students/bulk-photos`, { method: "POST", body: fd })
          // Guard against HTML error pages (413/502/etc.) — Vercel returns HTML, not JSON
          const ct = res.headers.get("content-type") || ""
          if (ct.includes("application/json")) {
            data = await res.json()
          } else {
            const text = await res.text().catch(() => "")
            data = {
              success: false,
              error:
                res.status === 413
                  ? "Batch too large for server (try smaller photos)"
                  : `Server error ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`,
            }
          }
        } catch (netErr: any) {
          data = { success: false, error: netErr?.message || "Network error" }
        }

        if (data?.success) {
          if (data.data.matchedFiles) allMatched = [...allMatched, ...data.data.matchedFiles]
          if (data.data.unmatchedFiles) allUnmatched = [...allUnmatched, ...data.data.unmatchedFiles]
          if (data.data.errorFiles) allErrors = [...allErrors, ...data.data.errorFiles]
        } else {
          for (const file of batch) {
            allErrors.push({ filename: file.name, error: data?.error || 'Batch upload failed' })
          }
        }
        processed += batch.length
      }

      setPhotoUploadProgress(100)
      setPhotoUploadStatus('Complete!')

      // Build a map of unmatched filenames → File objects for manual assignment
      const fileMap: Record<string, File> = {}
      for (const filename of allUnmatched) {
        const file = photoFiles.find(f => f.name === filename)
        if (file) fileMap[filename] = file
      }
      setUnmatchedFileMap(fileMap)

      // Fetch all students list for manual matching dropdown
      if (allUnmatched.length > 0) {
        try {
          const studRes = await fetch(`/api/schools/${schoolId}/students?limit=2000`)
          const studData = await studRes.json()
          if (studData.success) setAllStudentsList(studData.data)
        } catch {}
      }

      const result = {
        total: totalFiles,
        matched: allMatched.length,
        unmatched: allUnmatched.length,
        errors: allErrors.length,
        matchedFiles: allMatched.slice(0, 100),
        unmatchedFiles: allUnmatched.slice(0, 50),
        errorFiles: allErrors.slice(0, 20),
      }
      setPhotoResult(result)
      toast.success(`${result.matched} of ${totalFiles} photos matched to students!`)
      fetchStudents(studentPage)
    } catch (err) {
      toast.error("Bulk photo upload failed")
    } finally {
      setPhotoUploading(false)
    }
  }

  // Handle folder selection via webkitdirectory
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => 
      f.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    )
    if (files.length === 0) {
      toast.error('No image files found in the selected folder.')
      return
    }
    setPhotoFiles(files)
    toast.success(`${files.length} photos found in folder!`)
  }

  const resetPhotoUpload = () => {
    setPhotoUploadOpen(false)
    setPhotoFiles([])
    setPhotoResult(null)
    setPhotoUploadProgress(0)
    setPhotoUploadStatus('')
    setUnmatchedFileMap({})
    setManualAssigning('')
    setManualSearchQuery('')
    setAllStudentsList([])
  }

  // Flag management handlers
  const fetchFlags = async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/flags`)
      const data = await res.json()
      if (data.success) {
        setFlagColors(data.data.colors || [])
        const imgMap: Record<string, string> = {}
        for (const f of data.data.flags || []) {
          if (f.imageUrl) imgMap[f.color] = f.imageUrl
        }
        setFlagImages(imgMap)
      }
    } catch (err) { console.error(err) }
  }

  const handleFlagUpload = async (color: string, file: File, opts: { silent?: boolean } = {}): Promise<{ ok: boolean; error?: string }> => {
    setFlagUploading(color)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("color", color)
      const res = await fetch(`/api/schools/${schoolId}/flags`, { method: "POST", body: fd })
      let data: any = null
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (res.ok && data?.success) {
        if (!opts.silent) toast.success(`Flag image uploaded for "${color}"!`)
        setFlagImages(prev => ({ ...prev, [color]: data.data.imageUrl }))
        return { ok: true }
      }
      const errMsg = data?.error || `Flag upload failed (HTTP ${res.status})`
      if (!opts.silent) toast.error(errMsg)
      return { ok: false, error: errMsg }
    } catch (err: any) {
      const errMsg = err?.message || "Flag upload failed"
      if (!opts.silent) toast.error(errMsg)
      return { ok: false, error: errMsg }
    } finally {
      setFlagUploading('')
    }
  }

  // Bulk flag upload — uses filename (without extension) as the color name.
  // If a detected student-color matches the filename, that exact casing is used;
  // otherwise the filename itself becomes a new flag color (capitalized for display).
  // This lets users upload flag images BEFORE importing students.
  const handleBulkFlagUpload = async (files: FileList) => {
    if (!files.length) return
    let uploaded = 0, failed = 0
    const errors: string[] = []

    for (const file of Array.from(files)) {
      const baseName = file.name.replace(/\.[^.]+$/, "").trim()
      if (!baseName) { failed++; continue }
      const lower = baseName.toLowerCase()
      // Prefer matching an existing student-derived color (preserves casing)
      let colorName = flagColors.find(c => c.toLowerCase().trim() === lower)
        || flagColors.find(c => lower.includes(c.toLowerCase().trim()) || c.toLowerCase().trim().includes(lower))
      // Otherwise create a new color from the filename
      if (!colorName) colorName = baseName.charAt(0).toUpperCase() + baseName.slice(1)

      const result = await handleFlagUpload(colorName, file, { silent: true })
      if (result.ok) {
        uploaded++
      } else {
        failed++
        if (result.error && !errors.includes(result.error)) errors.push(result.error)
      }
    }

    if (uploaded > 0) toast.success(`${uploaded} flag image(s) uploaded!`)
    if (failed > 0) {
      const detail = errors.length > 0 ? ` ${errors[0]}` : ''
      toast.error(`${failed} file(s) failed.${detail}`)
    }
    // Refresh to pick up any newly created colors
    await fetchFlags()
  }

  // Manual photo assignment handler
  const handleManualAssign = async (filename: string, studentId: string) => {
    const file = unmatchedFileMap[filename]
    if (!file || !studentId) return
    
    setManualAssigning(filename)
    try {
      const fd = new FormData()
      fd.append("photo", file)
      fd.append("studentId", studentId)
      const res = await fetch(`/api/schools/${schoolId}/students/assign-photo`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        toast.success(`Photo "${filename}" assigned to ${data.data.studentName}!`)
        // Move from unmatched to matched
        setPhotoResult((prev: any) => ({
          ...prev,
          matched: prev.matched + 1,
          unmatched: prev.unmatched - 1,
          matchedFiles: [...(prev.matchedFiles || []), {
            filename,
            studentName: data.data.studentName,
            serialNumber: data.data.serialNumber,
            matchedBy: 'Manual',
          }],
          unmatchedFiles: (prev.unmatchedFiles || []).filter((f: string) => f !== filename),
        }))
        // Remove from unmatched file map
        setUnmatchedFileMap(prev => {
          const next = { ...prev }
          delete next[filename]
          return next
        })
        fetchStudents(studentPage)
      } else {
        toast.error(data.error || "Failed to assign photo")
      }
    } catch (err) {
      toast.error("Failed to assign photo")
    } finally {
      setManualAssigning('')
    }
  }

  const handleExport = (format: "csv" | "excel") => {
    const params = new URLSearchParams()
    if (classFilter) params.set("classId", classFilter)
    if (statusFilter) params.set("status", statusFilter)
    window.open(`/api/schools/${schoolId}/export/${format}?${params}`, "_blank")
  }

  // Logo Upload Handler
  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", `logos`)
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok || !uploadData.success) {
        toast.error(uploadData.error || "Failed to upload logo")
        return
      }
      const logoUrl = uploadData.url

      // Update school record
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("School logo updated!")
        fetchSchool()
      } else {
        toast.error("Failed to update school record")
      }
    } catch (err) {
      toast.error("Logo upload failed")
    } finally {
      setUploadingLogo(false)
    }
  }

  // Template orientation updater
  const handleOrientationChange = async (orientation: "PORTRAIT" | "LANDSCAPE") => {
    try {
      const widthMm = orientation === "LANDSCAPE" ? 85.6 : 54.0
      const heightMm = orientation === "LANDSCAPE" ? 54.0 : 85.6
      const res = await fetch(`/api/schools/${schoolId}/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orientation,
          cardWidthMm: widthMm,
          cardHeightMm: heightMm,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Card set to ${orientation === "LANDSCAPE" ? "Horizontal" : "Vertical"} (${widthMm} × ${heightMm} mm)`)
        fetchTemplate()
      } else {
        toast.error("Failed to update orientation")
      }
    } catch (err) {
      toast.error("Update failed")
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )
  if (!school) return <div style={{ padding: 32 }}>School not found.</div>

  const tabs = ["overview", "classes", "students", "template", "generate", "batches", "export"] as const

  return (
    <>
      {/* Breadcrumbs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', marginBottom: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none' }}>Dashboard</Link>
        <span>›</span>
        <Link href="/schools" style={{ color: '#64748b', textDecoration: 'none' }}>Schools</Link>
        <span>›</span>
        <span style={{ color: '#0f172a', fontWeight: 600 }}>{school.name}</span>
      </nav>

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="btn-ghost" onClick={() => router.push('/schools')} style={{ padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0 }}>
              {school.name.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 'min(20px, 5vw)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{school.name}</h1>
              <p style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{school.address || school.contactEmail}</p>
            </div>
          </div>
          <Link href={`/schools/${schoolId}/verify`} className="btn btn-outline" style={{ fontSize: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="8" height="8" rx="1" /><rect x="14" y="2" width="8" height="8" rx="1" /><rect x="2" y="14" width="8" height="8" rx="1" /><rect x="14" y="14" width="4" height="4" rx="0.5" /></svg>
            <span className="hide-on-small-mobile">QR Verify</span>
          </Link>
        </div>

        <div className="school-tabs-scroll" style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', marginBottom: 24, paddingBottom: 0 }}>
          {["overview", "classes", "students", "template", "generate", "batches", "export"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`tab-item ${tab === t ? "active" : ""}`}
              style={{ 
                textTransform: 'capitalize', 
                padding: '12px 0px', 
                marginRight: 32, 
                background: 'none', 
                border: 'none',
                fontSize: 14,
                fontWeight: tab === t ? 700 : 500,
                color: tab === t ? 'var(--blue-600)' : 'var(--gray-500)',
                cursor: 'pointer'
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="fade-in">
            <div className="school-stats-mobile stat-grid">
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">Total Classes</div>
                <div className="stat-card-value text-blue-600">{school._count.classes}</div>
              </div>
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">Total Students</div>
                <div className="stat-card-value text-blue-600">{school._count.students}</div>
              </div>
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">Print Batches</div>
                <div className="stat-card-value text-blue-600">{school._count.batches}</div>
              </div>
              <div className="stat-card glass-card premium-shadow">
                <div className="stat-card-label">Template Status</div>
                <div className="stat-card-value" style={{ color: school.template ? 'var(--green-600)' : 'var(--gray-300)' }}>
                  {school.template ? "Active" : "None"}
                </div>
              </div>
            </div>

            {/* Main Teacher Login Credentials */}
            <div style={{ marginTop: 24, background: 'linear-gradient(135deg, #f8fafc, #eff6ff)', borderRadius: 16, border: '1px solid #bfdbfe', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🔑</span> Main Teacher Login
              </h3>
              <p style={{ fontSize: 13, color: '#3b82f6', marginBottom: 16 }}>
                These are the credentials for the school administrator. Hand these over to the school so they can log in, add classes, map templates, and assign sub-teachers. Note: default password is <b>Teacher@123</b>.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {school.teachers?.filter((t: any) => t.isMainTeacher).map((t: any) => (
                  <div key={t.id} style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Login URL</span>
                      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        <span>{mounted ? `${window.location.origin}/login` : '/login'}</span>
                        <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 11, minHeight: 0 }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/login`); toast.success('Copied URL') }}>Copy</button>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: 0 }}>
                      <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Email Address (Username)</span>
                      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        <span style={{ wordBreak: 'break-all' }}>{t.email}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 11, minHeight: 0 }} onClick={() => { navigator.clipboard.writeText(t.email); toast.success('Copied Email') }}>Copy</button>
                          <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 11, minHeight: 0, color: '#dc2626' }} onClick={async () => {
                            if (confirm("Reset this teacher's password to Teacher@123?")) {
                              const res = await fetch(`/api/schools/${schoolId}/main-teacher`, { method: "POST", body: JSON.stringify({ reset: true }) })
                              if (res.ok) toast.success("Password Reset!"); else toast.error("Failed to reset.")
                            }
                          }}>Reset Pw</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Manual Add Option (Always show as an alternative or if missing) */}
                {(!school.teachers || !school.teachers.some((t: any) => t.isMainTeacher)) && (
                  <div style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Setup school administrator account</p>
                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%' }}
                        onClick={async () => {
                          if (!confirm("Auto-generate a Main Teacher login?")) return
                          const res = await fetch(`/api/schools/${schoolId}/main-teacher`, { method: "POST" })
                          if (res.ok) { toast.success("Created!"); fetchSchool() } else toast.error("Error")
                        }}
                      >
                        🚀 Quick Auto-Generate
                      </button>
                    </div>
                    
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                      <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginBottom: 8 }}>OR ENTER EMAIL MANUALLY</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input 
                          type="email" 
                          id="manual-teacher-email" 
                          placeholder="principal@school.com" 
                          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
                        />
                        <button 
                          className="btn btn-outline" 
                          style={{ minHeight: 0, padding: '0 12px' }}
                          onClick={async () => {
                            const email = (document.getElementById('manual-teacher-email') as HTMLInputElement).value
                            if (!email) return toast.error("Enter email")
                            const res = await fetch(`/api/schools/${schoolId}/main-teacher`, { method: "POST", body: JSON.stringify({ email }) })
                            if (res.ok) { toast.success("Created!"); fetchSchool() } else { const j = await res.json(); toast.error(j.error || "Error") }
                          }}
                        >Add</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* School Logo Upload Section */}
            <div style={{ marginTop: 24, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>School Logo</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Upload the school logo to appear on ID cards.</p>
              
              <div className="school-logo-section" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                {/* Current Logo Preview */}
                {school.logoUrl && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 120, height: 120, borderRadius: 12, overflow: 'hidden', border: '2px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={school.logoUrl} alt="School Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Current Logo</div>
                  </div>
                )}

                {/* Upload Zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setLogoDragOver(true) }}
                  onDragLeave={() => setLogoDragOver(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setLogoDragOver(false)
                    const file = e.dataTransfer.files[0]
                    if (file && file.type.startsWith('image/')) handleLogoUpload(file)
                  }}
                  onClick={() => document.getElementById('logo-upload-input')?.click()}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    border: `2px dashed ${logoDragOver ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: 12,
                    padding: 32,
                    textAlign: 'center',
                    cursor: uploadingLogo ? 'wait' : 'pointer',
                    background: logoDragOver ? '#eff6ff' : '#fafafa',
                    transition: 'all 0.2s',
                  }}
                >
                  <input
                    id="logo-upload-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleLogoUpload(file)
                    }}
                  />
                  {uploadingLogo ? (
                    <>
                      <div className="login-spinner" style={{ width: 24, height: 24, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 13, color: '#3b82f6' }}>Uploading...</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🏫</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{school.logoUrl ? 'Replace Logo' : 'Upload School Logo'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Drag & drop or click to browse</div>
                      <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>JPEG, PNG, WebP — Max 5MB</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CLASSES TAB */}
        {tab === "classes" && (
          <div className="fade-in">
            <form onSubmit={handleAddClass} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
                <input placeholder="New class name (e.g. Grade 10-A)" value={newClassName} onChange={e => setNewClassName(e.target.value)} required />
              </div>
              <div className="form-group" style={{ width: 200 }}>
                <input type="datetime-local" value={newExpiry} onChange={e => setNewExpiry(e.target.value)} placeholder="Expiry (optional)" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: 44 }} disabled={addingClass}>
                {addingClass ? "Adding..." : "Add Class"}
              </button>
            </form>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class Name</th>
                    <th>Approval Teacher</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th>Link</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(cls => {
                    const classTeacher = cls.teachers?.find(t => !t.isMainTeacher)
                    return (
                    <tr key={cls.id}>
                      <td style={{ fontWeight: 600 }}>{cls.name}</td>
                      <td>
                        {classTeacher ? (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 600, color: '#334155' }}>{classTeacher.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: 11 }}>{classTeacher.email}</div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td><span className="status-badge status-submitted">{cls._count.students}</span></td>
                      <td>
                        <span className={`status-badge ${cls.isActive ? 'status-approved' : 'status-pending'}`}>
                          {cls.isActive ? "Active" : "Inactive"}
                        </span>
                        {cls.expiresAt && (
                          <div style={{ marginTop: 4 }}>
                            {getExpiryBadge(cls.expiresAt)}
                          </div>
                        )}
                      </td>
                      <td style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>...{cls.linkToken.slice(-8)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline" onClick={() => copyLink(cls.linkToken)} style={{ fontSize: 11, padding: '5px 10px' }}>📋 Copy</button>
                          <button className="btn btn-outline" onClick={() => shareWhatsApp(cls.linkToken, cls.name)} style={{ fontSize: 11, padding: '5px 10px', color: '#22c55e', borderColor: '#22c55e' }}>💬 WhatsApp</button>
                          <button className="btn btn-outline" onClick={() => shareEmail(cls.linkToken, cls.name)} style={{ fontSize: 11, padding: '5px 10px' }}>📧 Email</button>
                          <button className="btn btn-outline" onClick={() => handleToggleClass(cls.id, cls.isActive)} style={{ fontSize: 11, padding: '5px 10px' }}>
                            {cls.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button className="btn btn-danger" onClick={() => handleDeleteClass(cls.id, cls.name)} style={{ fontSize: 11, padding: '5px 8px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})
                  }
                  {classes.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No classes created yet. Add one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STUDENTS TAB */}
        {tab === "students" && (
          <>
          <div className="fade-in">
            {/* Action Bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={() => setImportOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                Bulk Import Excel
              </button>
              <button className="btn btn-outline" onClick={() => setPhotoUploadOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#8b5cf6', color: '#7c3aed' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                Bulk Upload Photos
              </button>
              <button className="btn btn-outline" onClick={() => setFlagUploadOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#f59e0b', color: '#d97706' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
                Manage Flags{flagColors.length > 0 ? ` (${flagColors.length})` : ''}
              </button>
              <a href={`/api/schools/${schoolId}/students/import-template`} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', textDecoration: 'none', fontSize: 13 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Download Template
              </a>
              {studentTotal > 0 && (
                <button
                  className="btn btn-outline"
                  onClick={handleDeleteAllStudents}
                  disabled={deletingAll}
                  title="Permanently delete every student in this school so you can re-upload a fresh Excel."
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderColor: '#ef4444', color: '#dc2626', marginLeft: 'auto', fontSize: 13 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                  {deletingAll ? 'Deleting…' : `Delete All (${studentTotal})`}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <input placeholder="Search by name or serial..." value={searchInput} onChange={e => { const v = e.target.value; setSearchInput(v); if (searchTimerRef.current) clearTimeout(searchTimerRef.current); searchTimerRef.current = setTimeout(() => { setSearchQuery(v); setStudentPage(1); }, 400); }} style={{ height: 40, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, flex: 1, minWidth: 200 }} />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Status</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="FLAGGED">Flagged</option>
                <option value="PRINTED">Printed</option>
                <option value="PENDING">Pending</option>
              </select>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {studentTotal} students found
                {(() => { const missing = students.filter(s => !s.photoUrl).length; return missing > 0 ? (
                  <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 600, color: '#ef4444', background: '#fef2f2', padding: '3px 10px', borderRadius: 6 }}>
                    📷 {missing} missing photos
                  </span>
                ) : null; })()}
              </div>
            </div>

            <div className="data-table-wrapper" style={{ overflowX: 'auto', position: 'relative', opacity: tabLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              {tabLoading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, background: 'rgba(255,255,255,0.6)', borderRadius: 14 }}><div className="login-spinner" style={{ width: 28, height: 28, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} /></div>}
              {(() => {
                // Derive display columns directly from student formData keys
                // This ensures columns always match the actual imported Excel data
                const keyToLabel: Record<string, string> = {
                  srNo: "NO.", fullName: "Name", grNo: "GR NO", photoId: "PHOTO NO.",
                  flagColor: "House", phone: "MOBILE", address: "Address", rollNo: "Roll No.",
                  dob: "DOB", bloodGroup: "Blood Group", fatherName: "Father Name",
                  motherName: "Mother Name", section: "Section", branch: "Branch",
                }
                // Collect all unique formData keys from current students (excluding "class")
                const allKeys: string[] = []
                const keySet = new Set<string>()
                if (students.length > 0) {
                  // Use first student to determine column order, then add any extra keys
                  for (const s of students) {
                    const fd = s.formData as any
                    if (fd && typeof fd === "object") {
                      for (const k of Object.keys(fd)) {
                        if (!keySet.has(k) && k !== "class") {
                          keySet.add(k)
                          allKeys.push(k)
                        }
                      }
                    }
                  }
                }
                // Also check template fieldConfig for label overrides
                const fc = (templateData?.fieldConfig || []) as Array<{ key: string; label: string }>
                for (const f of fc) {
                  if (f.key && f.label && f.key !== "class" && f.key !== "classSection") {
                    keyToLabel[f.key] = f.label
                  }
                }
                const dataColumns = allKeys.filter(k => k !== "class" && k !== "classSection")
                const hasDynamicColumns = dataColumns.length > 0
                const totalCols = 1 + (hasDynamicColumns ? dataColumns.length : 2) + 3

                return (
                <table className="data-table" style={{ minWidth: hasDynamicColumns ? Math.max(800, dataColumns.length * 120) : 800 }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>Photo</th>
                      {hasDynamicColumns ? (
                        dataColumns.map(k => <th key={k}>{keyToLabel[k] || k}</th>)
                      ) : (
                        <>
                          <th>Serial No.</th>
                          <th>Name</th>
                        </>
                      )}
                      <th>Class</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => {
                      const fd = s.formData as any
                      const studentName = fd?.fullName || fd?.["Full Name"] || fd?.name || "—"
                      const hasPhoto = !!s.photoUrl

                      return (
                        <tr key={s.id}>
                          <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                            {s.photoUrl ? (
                              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid #e2e8f0' }}>
                                <img src={s.photoUrl} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fef2f2', border: '2px dashed #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: '#ef4444', border: '1.5px solid white' }} title="Photo missing" />
                              </div>
                            )}
                          </td>
                          {hasDynamicColumns ? (
                            dataColumns.map(k => {
                              const val = fd?.[k] || ""
                              const isPhotoIdCol = k === "photoId"
                              const isNumCol = k === "srNo" || k === "rollNo" || k === "grNo"
                              return (
                                <td key={k} style={{
                                  fontSize: 12,
                                  fontFamily: isPhotoIdCol || isNumCol ? 'monospace' : 'inherit',
                                  fontWeight: k === "fullName" ? 500 : 'normal',
                                  color: !val ? '#cbd5e1' : isPhotoIdCol ? '#6366f1' : '#334155',
                                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {val || "—"}
                                </td>
                              )
                            })
                          ) : (
                            <>
                              <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{s.serialNumber}</td>
                              <td style={{ fontWeight: 500 }}>{studentName}</td>
                            </>
                          )}
                          <td>{s.class?.name || "—"}</td>
                          <td>
                            <span className={`status-badge ${
                              s.status === 'APPROVED' ? 'status-approved' :
                              s.status === 'FLAGGED' ? 'status-flagged' :
                              s.status === 'PRINTED' ? 'status-review' :
                              s.status === 'SUBMITTED' ? 'status-submitted' :
                              'status-pending'
                            }`}>{s.status}</span>
                            {!hasPhoto && <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3, fontWeight: 600 }}>⚠ Photo</div>}
                            {s.flagNote && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>📌 {s.flagNote}</div>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#6366f1', color: '#4f46e5' }} onClick={() => setSelectedStudent(s)}>👁 View</button>
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#22c55e', color: '#16a34a' }} onClick={() => handleStatusUpdate(s.id, "APPROVED")}>✓</button>
                              {s.status === "FLAGGED" ? (
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#3b82f6', color: '#2563eb' }} onClick={() => handleUnflag(s.id)}>Unflag</button>
                              ) : (
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', borderColor: '#ef4444', color: '#dc2626' }} onClick={() => handleFlag(s.id)}>🚩</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {students.length === 0 && (
                      <tr><td colSpan={totalCols} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No students found</td></tr>
                    )}
                  </tbody>
                </table>
                )
              })()}
            </div>

            {/* Pagination */}
            {studentTotal > 50 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                <button className="btn btn-outline" disabled={studentPage <= 1} onClick={() => fetchStudents(studentPage - 1)}>← Previous</button>
                <span style={{ padding: '8px 16px', fontSize: 13, color: '#64748b' }}>Page {studentPage} of {Math.ceil(studentTotal / 50)}</span>
                <button className="btn btn-outline" disabled={studentPage >= Math.ceil(studentTotal / 50)} onClick={() => fetchStudents(studentPage + 1)}>Next →</button>
              </div>
            )}
          </div>

          {/* IMPORT MODAL */}
          {importOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={resetImport}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                      {importStep === 'upload' ? '📊 Bulk Import Students' : importStep === 'preview' ? '🔍 Preview & Validate' : '✅ Import Complete'}
                    </h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                      {importStep === 'upload' ? 'Upload an Excel or CSV file with student data' : importStep === 'preview' ? 'Review the data before importing' : 'Import results'}
                    </p>
                  </div>
                  <button onClick={resetImport} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 24 }}>
                  {/* STEP 1: UPLOAD */}
                  {importStep === 'upload' && (
                    <div>
                      {/* File upload zone */}
                      <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setImportFile(f) }}
                        style={{
                          border: `2px dashed ${dragOver ? '#3b82f6' : importFile ? '#22c55e' : '#e2e8f0'}`,
                          borderRadius: 16, padding: 40, textAlign: 'center', cursor: 'pointer',
                          background: dragOver ? '#eff6ff' : importFile ? '#f0fdf4' : '#fafafa',
                          transition: 'all 0.2s',
                        }}
                        onClick={() => document.getElementById('import-file-input')?.click()}
                      >
                        <input
                          id="import-file-input"
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) setImportFile(f) }}
                        />
                        {importFile ? (
                          <>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>{importFile.name}</div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>{(importFile.size / 1024).toFixed(1)} KB — Click to change</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Drop your Excel/CSV file here</div>
                            <div style={{ fontSize: 13, color: '#94a3b8' }}>or click to browse • .xlsx, .xls, .csv supported • Max 10MB</div>
                          </>
                        )}
                      </div>

                      {/* Fallback class selector (optional) */}
                      <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Fallback Class (optional)</label>
                        <select value={importClassId} onChange={e => setImportClassId(e.target.value)} style={{ width: '100%', height: 40, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                          <option value="">Auto-detect from Excel column</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c._count.students} students)</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>If your Excel has a "Class-Section" column, classes are created automatically. Otherwise select a fallback class here.</div>
                      </div>

                      {/* Info box */}
                      <div style={{ marginTop: 16, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600, marginBottom: 4 }}>💡 Smart Import</div>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#3b82f6', lineHeight: 1.8 }}>
                          <li><strong>Mixed classes supported!</strong> Include a "Class-Section" column — classes are auto-created</li>
                          <li><strong>Photo ID column</strong> — if present, used to match bulk photos later</li>
                          <li>Column headers matched automatically: "Student Name", "Father", "Mother", "Photo ID", etc.</li>
                          <li>Only <strong>Student Name</strong> is required — all other fields are optional</li>
                          <li>Max 2000 students per import</li>
                        </ul>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" onClick={resetImport}>Cancel</button>
                        <button
                          className="btn btn-primary"
                          onClick={handleImportValidate}
                          disabled={!importFile || importUploading}
                          style={{ padding: '10px 24px' }}
                        >
                          {importUploading ? 'Validating...' : 'Validate & Preview →'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: PREVIEW */}
                  {importStep === 'preview' && importPreview && (
                    <div>
                      {/* Stats cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{importPreview.validRows}</div>
                          <div style={{ fontSize: 12, color: '#15803d' }}>Valid Rows</div>
                        </div>
                        <div style={{ padding: 16, background: importPreview.errorRows > 0 ? '#fef2f2' : '#f8fafc', borderRadius: 12, border: `1px solid ${importPreview.errorRows > 0 ? '#fecaca' : '#e2e8f0'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: importPreview.errorRows > 0 ? '#dc2626' : '#64748b' }}>{importPreview.errorRows}</div>
                          <div style={{ fontSize: 12, color: importPreview.errorRows > 0 ? '#b91c1c' : '#64748b' }}>Errors</div>
                        </div>
                        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#334155' }}>{importPreview.totalRows}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>Total Rows</div>
                        </div>
                      </div>

                      {/* Column Mapping */}
                      <div style={{ marginBottom: 20 }}>
                        <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>📋 Column Mapping</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {importPreview.mappedColumns?.map((c: any, i: number) => (
                            <span key={i} style={{ padding: '4px 10px', background: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#2563eb', border: '1px solid #bfdbfe' }}>
                              {c.excelColumn} → {c.label}
                            </span>
                          ))}
                        </div>
                        {importPreview.unmappedColumns?.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Ignored columns: </span>
                            {importPreview.unmappedColumns.map((c: string, i: number) => (
                              <span key={i} style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 4, fontSize: 11, color: '#64748b', marginRight: 4 }}>{c}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Data preview table */}
                      {importPreview.preview?.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>👀 Data Preview (first {importPreview.preview.length} rows)</h4>
                          <div className="data-table-wrapper" style={{ overflowX: 'auto', maxHeight: 240 }}>
                            <table className="data-table" style={{ fontSize: 12 }}>
                              <thead>
                                <tr>
                                  <th>Row</th>
                                  {importPreview.mappedColumns?.map((c: any) => <th key={c.mappedTo}>{c.label}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {importPreview.preview.map((row: any, i: number) => (
                                  <tr key={i}>
                                    <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{row._rowNum}</td>
                                    {importPreview.mappedColumns?.map((c: any) => (
                                      <td key={c.mappedTo} style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {row[c.mappedTo] || <span style={{ color: '#cbd5e1' }}>—</span>}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Errors */}
                      {importPreview.errors?.length > 0 && (
                        <div style={{ marginBottom: 20, padding: 14, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>⚠️ Validation Errors ({importPreview.errorRows} rows)</h4>
                          <div style={{ maxHeight: 160, overflow: 'auto' }}>
                            {importPreview.errors.map((e: any, i: number) => (
                              <div key={i} style={{ fontSize: 12, color: '#b91c1c', padding: '3px 0' }}>
                                Row {e.row}: <strong>{e.field}</strong> — {e.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" onClick={() => { setImportStep('upload'); setImportPreview(null) }}>← Back</button>
                        <button
                          className="btn btn-primary"
                          onClick={handleImportConfirm}
                          disabled={importPreview.validRows === 0 || importUploading}
                          style={{ padding: '10px 24px', background: importPreview.validRows > 0 ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#94a3b8' }}
                        >
                          {importUploading ? 'Importing...' : `Import ${importPreview.validRows} Students ✓`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: RESULT */}
                  {importStep === 'result' && importResult && (
                    <div>
                      <div style={{ textAlign: 'center', padding: 20 }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                        <h3 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                          {importResult.imported} Students Imported!
                        </h3>
                        {importResult.classesCreated > 0 && (
                          <p style={{ fontSize: 14, color: '#3b82f6', marginBottom: 4 }}>📚 {importResult.classesCreated} classes auto-created</p>
                        )}
                        {importResult.failed > 0 && (
                          <p style={{ fontSize: 14, color: '#dc2626' }}>{importResult.failed} rows failed</p>
                        )}
                      </div>

                      {/* Show first few imported students */}
                      {importResult.students?.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>Imported Students</h4>
                          <div className="data-table-wrapper" style={{ maxHeight: 240, overflowY: 'auto' }}>
                            <table className="data-table" style={{ fontSize: 12 }}>
                              <thead><tr><th>Serial Number</th><th>Name</th></tr></thead>
                              <tbody>
                                {importResult.students.map((s: any) => (
                                  <tr key={s.id}>
                                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.serialNumber}</td>
                                    <td>{s.name}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Errors */}
                      {importResult.errors?.length > 0 && (
                        <div style={{ marginTop: 16, padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Failed Rows</h4>
                          {importResult.errors.map((e: any, i: number) => (
                            <div key={i} style={{ fontSize: 12, color: '#b91c1c' }}>Row {e.row}: {e.error}</div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                        <button className="btn btn-primary" onClick={resetImport} style={{ padding: '10px 28px' }}>Done ✓</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BULK PHOTO UPLOAD MODAL */}
          {photoUploadOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => { if (!photoUploading) resetPhotoUpload() }}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 700, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>📸 Bulk Upload Photos</h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>
                      {photoResult ? 'Upload results' : photoUploading ? 'Uploading photos...' : 'Upload a folder of student photos — auto-matched by Photo ID from Excel'}
                    </p>
                  </div>
                  {!photoUploading && <button onClick={resetPhotoUpload} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>}
                </div>

                <div style={{ padding: 24 }}>
                  {/* UPLOADING STATE — Progress Bar */}
                  {photoUploading && !photoResult && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{photoUploadStatus}</h3>
                      <div style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{
                          width: `${photoUploadProgress}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
                          borderRadius: 4,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <p style={{ fontSize: 13, color: '#64748b' }}>{photoUploadProgress}% — {photoFiles.length} photos being processed</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Please don't close this window. Large folders may take a few minutes.</p>
                    </div>
                  )}

                  {/* UPLOAD FORM */}
                  {!photoResult && !photoUploading && (
                    <div>
                      {/* Two upload options: Folder (primary) or Individual Files */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        {/* SELECT FOLDER — Primary option */}
                        <div
                          onClick={() => document.getElementById('bulk-photo-folder-input')?.click()}
                          style={{
                            border: `2px dashed ${photoFiles.length > 0 ? '#22c55e' : '#8b5cf6'}`,
                            borderRadius: 16, padding: 28, textAlign: 'center', cursor: 'pointer',
                            background: photoFiles.length > 0 ? '#f0fdf4' : '#f5f3ff',
                            transition: 'all 0.2s',
                          }}
                        >
                          <input
                            id="bulk-photo-folder-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            {...({ webkitdirectory: 'true', directory: '' } as any)}
                            style={{ display: 'none' }}
                            onChange={handleFolderSelect}
                          />
                          {photoFiles.length > 0 ? (
                            <>
                              <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>{photoFiles.length} photos ready</div>
                              <div style={{ fontSize: 12, color: '#64748b' }}>Click to change folder</div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 32, marginBottom: 6 }}>📁</div>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>Select Folder</div>
                              <div style={{ fontSize: 12, color: '#7c3aed' }}>Pick the entire photos folder</div>
                            </>
                          )}
                        </div>

                        {/* DROP/SELECT INDIVIDUAL FILES — Secondary option */}
                        <div
                          onDragOver={e => { e.preventDefault(); setPhotoDragOver(true) }}
                          onDragLeave={() => setPhotoDragOver(false)}
                          onDrop={e => {
                            e.preventDefault()
                            setPhotoDragOver(false)
                            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
                            if (files.length > 0) {
                              setPhotoFiles(prev => [...prev, ...files])
                              toast.success(`${files.length} photos added!`)
                            }
                          }}
                          onClick={() => document.getElementById('bulk-photo-input')?.click()}
                          style={{
                            border: `2px dashed ${photoDragOver ? '#3b82f6' : '#e2e8f0'}`,
                            borderRadius: 16, padding: 28, textAlign: 'center', cursor: 'pointer',
                            background: photoDragOver ? '#eff6ff' : '#fafafa',
                            transition: 'all 0.2s',
                          }}
                        >
                          <input
                            id="bulk-photo-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            style={{ display: 'none' }}
                            onChange={e => {
                              const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
                              if (files.length > 0) {
                                setPhotoFiles(prev => [...prev, ...files])
                                toast.success(`${files.length} photos added!`)
                              }
                            }}
                          />
                          <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Select Files</div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>Or drag & drop photos here</div>
                        </div>
                      </div>

                      {/* File list preview */}
                      {photoFiles.length > 0 && (
                        <div style={{ marginTop: 8, maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>📄 {photoFiles.length} Photos Selected — {(photoFiles.reduce((a, f) => a + f.size, 0) / (1024 * 1024)).toFixed(1)} MB total</span>
                            <button onClick={() => setPhotoFiles([])} style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear All</button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 4 }}>
                            {photoFiles.slice(0, 30).map((f, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#f8fafc', borderRadius: 6, fontSize: 11 }}>
                                <span style={{ color: '#3b82f6', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name.replace(/\.[^.]+$/, '')}</span>
                                <span style={{ color: '#cbd5e1', flexShrink: 0, fontSize: 10 }}>.{f.name.split('.').pop()}</span>
                              </div>
                            ))}
                            {photoFiles.length > 30 && <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: 4, gridColumn: '1/-1' }}>...and {photoFiles.length - 30} more</div>}
                          </div>
                        </div>
                      )}

                      {/* Photo ID matching guide */}
                      <div style={{ marginTop: 16, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600, marginBottom: 6 }}>🔗 How Photo Matching Works</div>
                        <div style={{ fontSize: 12, color: '#2563eb', lineHeight: 1.8 }}>
                          Photos are matched to students automatically. The filename (without extension) is matched in this <strong>priority order</strong>:
                        </div>
                        <ol style={{ margin: '6px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#3b82f6', lineHeight: 2 }}>
                          <li><strong>Photo ID</strong> column from Excel — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>BB25035.jpg</code> matches Photo ID <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>BB25035</code></li>
                          <li><strong>Serial Number</strong> — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>AARYAN-0078.jpg</code></li>
                          <li><strong>Roll No.</strong> — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>23.jpg</code></li>
                          <li><strong>Full Name</strong> — e.g. <code style={{ background: '#dbeafe', padding: '1px 6px', borderRadius: 4 }}>Aarav Sharma.png</code></li>
                        </ol>
                      </div>

                      {/* Tip for Photo ID */}
                      <div style={{ marginTop: 10, padding: 12, background: '#fefce8', borderRadius: 10, border: '1px solid #fde68a' }}>
                        <div style={{ fontSize: 12, color: '#92400e' }}>
                          💡 <strong>Tip:</strong> If your Excel has a &quot;<strong>Photo ID</strong>&quot; column (e.g. BB25035, DSC_8541), simply keep your photo filenames as-is — the system will match them automatically!
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" onClick={resetPhotoUpload}>Cancel</button>
                        <button
                          className="btn btn-primary"
                          onClick={handleBulkPhotoUpload}
                          disabled={photoFiles.length === 0 || photoUploading}
                          style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
                        >
                          {`Upload & Match ${photoFiles.length} Photos`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* RESULTS */}
                  {photoResult && !photoUploading && (
                    <div>
                      <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <div style={{ fontSize: 48, marginBottom: 8 }}>{photoResult.matched > 0 ? '🎉' : '⚠️'}</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                          {photoResult.matched} of {photoResult.total} Photos Matched!
                        </h3>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{photoResult.matched}</div>
                          <div style={{ fontSize: 12, color: '#15803d' }}>Matched</div>
                        </div>
                        <div style={{ padding: 16, background: photoResult.unmatched > 0 ? '#fffbeb' : '#f8fafc', borderRadius: 12, border: `1px solid ${photoResult.unmatched > 0 ? '#fed7aa' : '#e2e8f0'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: photoResult.unmatched > 0 ? '#d97706' : '#64748b' }}>{photoResult.unmatched}</div>
                          <div style={{ fontSize: 12, color: photoResult.unmatched > 0 ? '#b45309' : '#64748b' }}>No Match</div>
                        </div>
                        <div style={{ padding: 16, background: photoResult.errors > 0 ? '#fef2f2' : '#f8fafc', borderRadius: 12, border: `1px solid ${photoResult.errors > 0 ? '#fecaca' : '#e2e8f0'}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: photoResult.errors > 0 ? '#dc2626' : '#64748b' }}>{photoResult.errors}</div>
                          <div style={{ fontSize: 12, color: photoResult.errors > 0 ? '#b91c1c' : '#64748b' }}>Errors</div>
                        </div>
                      </div>

                      {/* Matched details */}
                      {photoResult.matchedFiles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>✅ Matched Photos ({photoResult.matched})</h4>
                          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f0fdf4', position: 'sticky', top: 0 }}>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Photo File</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Student</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Serial No.</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#15803d' }}>Matched By</th>
                                </tr>
                              </thead>
                              <tbody>
                                {photoResult.matchedFiles.map((m: any, i: number) => (
                                  <tr key={i} style={{ borderBottom: '1px solid #dcfce7' }}>
                                    <td style={{ padding: '5px 10px', color: '#334155', fontFamily: 'monospace' }}>{m.filename}</td>
                                    <td style={{ padding: '5px 10px', color: '#16a34a', fontWeight: 600 }}>{m.studentName}</td>
                                    <td style={{ padding: '5px 10px', color: '#64748b', fontFamily: 'monospace' }}>{m.serialNumber}</td>
                                    <td style={{ padding: '5px 10px' }}><span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{m.matchedBy}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Unmatched — Manual Matching UI */}
                      {photoResult.unmatchedFiles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>⚠️ Unmatched Photos ({photoResult.unmatchedFiles.length}) — Assign Manually</h4>
                            <input
                              type="text"
                              placeholder="🔍 Search students..."
                              value={manualSearchQuery}
                              onChange={e => setManualSearchQuery(e.target.value)}
                              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, width: 180, outline: 'none' }}
                            />
                          </div>
                          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #fed7aa', borderRadius: 10, background: '#fffbeb' }}>
                            {photoResult.unmatchedFiles.map((filename: string, idx: number) => {
                              const file = unmatchedFileMap[filename]
                              const thumbUrl = file ? URL.createObjectURL(file) : ''
                              const filteredStudents = manualSearchQuery
                                ? allStudentsList.filter((s: any) => {
                                    const fd = s.formData as Record<string, string>
                                    const name = (fd?.fullName || fd?.["Full Name"] || fd?.["Student Name"] || fd?.name || '').toLowerCase()
                                    const serial = s.serialNumber.toLowerCase()
                                    const q = manualSearchQuery.toLowerCase()
                                    return name.includes(q) || serial.includes(q)
                                  })
                                : allStudentsList.slice(0, 50)

                              return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: idx < photoResult.unmatchedFiles.length - 1 ? '1px solid #fde68a' : 'none' }}>
                                  {/* Photo thumbnail */}
                                  {thumbUrl && (
                                    <img
                                      src={thumbUrl}
                                      alt={filename}
                                      style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid #fbbf24', flexShrink: 0 }}
                                    />
                                  )}
                                  {/* Filename */}
                                  <div style={{ flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', fontFamily: 'monospace' }}>{filename.replace(/\.[^.]+$/, '')}</span>
                                    <span style={{ fontSize: 10, color: '#b45309' }}>.{filename.split('.').pop()}</span>
                                  </div>
                                  {/* Student dropdown */}
                                  <select
                                    id={`assign-${idx}`}
                                    style={{
                                      flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
                                      fontSize: 12, background: 'white', outline: 'none', minWidth: 0,
                                    }}
                                    defaultValue=""
                                  >
                                    <option value="">Select student...</option>
                                    {filteredStudents.map((s: any) => {
                                      const fd = s.formData as Record<string, string>
                                      const name = fd?.fullName || fd?.["Full Name"] || fd?.["Student Name"] || fd?.name || 'Unknown'
                                      return (
                                        <option key={s.id} value={s.id}>{name} ({s.serialNumber})</option>
                                      )
                                    })}
                                  </select>
                                  {/* Assign button */}
                                  <button
                                    onClick={() => {
                                      const select = document.getElementById(`assign-${idx}`) as HTMLSelectElement
                                      if (select?.value) handleManualAssign(filename, select.value)
                                      else toast.error('Please select a student first')
                                    }}
                                    disabled={manualAssigning === filename}
                                    style={{
                                      padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                                      background: manualAssigning === filename ? '#94a3b8' : '#16a34a', color: 'white',
                                      cursor: manualAssigning === filename ? 'wait' : 'pointer', flexShrink: 0,
                                    }}
                                  >
                                    {manualAssigning === filename ? '...' : 'Assign'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Select a student from the dropdown and click "Assign" to manually match each photo.</p>
                        </div>
                      )}

                      {/* Errors */}
                      {photoResult.errorFiles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>❌ Upload Errors</h4>
                          <div style={{ maxHeight: 100, overflow: 'auto', padding: '8px 12px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                            {photoResult.errorFiles.map((e: any, i: number) => (
                              <div key={i} style={{ fontSize: 12, color: '#b91c1c', padding: '2px 0' }}>{e.filename}: {e.error}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                        {photoResult.unmatched > 0 && (
                          <button className="btn btn-outline" onClick={() => { setPhotoResult(null); setPhotoFiles([]); setPhotoUploadProgress(0) }} style={{ borderColor: '#8b5cf6', color: '#7c3aed' }}>Upload More Photos</button>
                        )}
                        <button className="btn btn-primary" onClick={resetPhotoUpload} style={{ padding: '10px 28px' }}>Done ✓</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FLAG UPLOAD MODAL */}
          {flagUploadOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setFlagUploadOpen(false)}>
              <div style={{ background: 'white', borderRadius: 20, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>🏴 Manage Flag Images</h2>
                    <p style={{ fontSize: 13, color: '#64748b' }}>Upload flag/house images for each color group. These will appear on student ID cards.</p>
                  </div>
                  <button onClick={() => setFlagUploadOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>

                <div style={{ padding: 24 }}>
                  {/* Bulk Upload Section — always visible */}
                  <div style={{ marginBottom: 20, padding: 16, background: '#fefce8', borderRadius: 14, border: '1.5px solid #fde68a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <span style={{ fontSize: 24 }}>📁</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e' }}>Upload Flag Images by Filename</div>
                        <div style={{ fontSize: 12, color: '#a16207' }}>
                          Each file's name (without extension) becomes the house/color name. Example: <strong>Yellow.png</strong> → Yellow house, <strong>Blue.jpg</strong> → Blue house. When students are imported with a matching <strong>House</strong> column, the correct flag is placed automatically on each ID card.
                        </div>
                      </div>
                    </div>
                    <input
                      id="bulk-flag-input"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                      style={{ display: 'none' }}
                      onChange={e => {
                        if (e.target.files && e.target.files.length > 0) handleBulkFlagUpload(e.target.files)
                        e.target.value = ''
                      }}
                    />
                    <button
                      className="btn btn-outline"
                      onClick={() => document.getElementById('bulk-flag-input')?.click()}
                      disabled={!!flagUploading}
                      style={{ fontSize: 13, padding: '10px 20px', borderColor: '#f59e0b', color: '#d97706', fontWeight: 600, width: '100%' }}
                    >
                      📷 Select Flag Images (color = filename)
                    </button>
                    {flagColors.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#78716c', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span>Expected filenames:</span>
                        {flagColors.map(c => <span key={c} style={{ background: '#fff', padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', fontWeight: 600 }}>{c}.png</span>)}
                      </div>
                    )}
                  </div>

                  {flagColors.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>🏳️</div>
                      <p style={{ fontSize: 13, marginBottom: 6, color: '#475569', fontWeight: 600 }}>No flag images uploaded yet</p>
                      <p style={{ fontSize: 12, color: '#64748b', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
                        Use the upload box above to add flag images now (named by house/color), <strong>or</strong> import students with a <strong>"House"</strong> / <strong>"Flag Color"</strong> column first to auto-detect colors.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Individual Flag Assignment ({flagColors.filter(c => flagImages[c]).length}/{flagColors.length} uploaded)
                      </div>
                      {flagColors.map(color => {
                        const hasImage = !!flagImages[color]
                        return (
                          <div key={color} style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: 14,
                            background: hasImage ? '#f0fdf4' : '#fff',
                            border: `1.5px solid ${hasImage ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: 12,
                          }}>
                            {/* Color swatch */}
                            <div style={{
                              width: 44, height: 44, borderRadius: 10,
                              background: color.toLowerCase(),
                              border: '2px solid rgba(0,0,0,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 18, flexShrink: 0,
                            }}>
                              {hasImage ? '✓' : '🏴'}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'capitalize', marginBottom: 2 }}>
                                {color}
                              </div>
                              {hasImage ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <img src={flagImages[color]} alt={`${color} flag`} style={{ width: 48, height: 32, objectFit: 'contain', borderRadius: 4, border: '1px solid #e2e8f0' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Matched</span>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: '#d97706' }}>⚠ No flag image — upload or bulk-match</span>
                              )}
                            </div>
                            {/* Individual upload button */}
                            <div>
                              <input
                                id={`flag-input-${color}`}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) handleFlagUpload(color, f)
                                  e.target.value = ''
                                }}
                              />
                              <button
                                className="btn btn-outline"
                                onClick={() => document.getElementById(`flag-input-${color}`)?.click()}
                                disabled={flagUploading === color}
                                style={{
                                  fontSize: 11, padding: '6px 14px',
                                  borderColor: hasImage ? '#22c55e' : '#e2e8f0',
                                  color: hasImage ? '#16a34a' : '#64748b',
                                }}
                              >
                                {flagUploading === color ? '...' : hasImage ? 'Replace' : 'Upload'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 20, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.8 }}>
                      <strong>How it works:</strong><br/>
                      1. Students imported with a "House" column (e.g., Yellow, Blue, Red, Green) are auto-detected.<br/>
                      2. Upload flag images named by color (e.g., <strong>Yellow.png</strong>, <strong>Blue.jpg</strong>).<br/>
                      3. The system matches each flag to the correct house and places it on the ID card at the flag placeholder position.
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button className="btn btn-primary" onClick={() => setFlagUploadOpen(false)} style={{ padding: '10px 28px' }}>Done</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          </>
        )}

        {/* TEMPLATE TAB */}
        {tab === "template" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* JPG Template Mapper — Main Feature */}
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🖼️</div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>JPG Template Mapper</h3>
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>Upload the school's pre-designed ID card image and map student fields onto it</p>
                </div>
              </div>

              <JpgTemplateMapper
                schoolId={schoolId}
                templateImageUrl={templateData?.templateImageUrl || null}
                fieldMappings={(templateData?.fieldMappings as any) || []}
                fieldConfig={(templateData?.fieldConfig as any[]) || []}
                initialPhotoBgColor={(templateData as any)?.photoBgColor || "#FFFFFF"}
                previewStudent={students[0] ? {
                  formData: students[0].formData as Record<string, string>,
                  photoUrl: students[0].photoUrl || null,
                } : null}
                onSave={async (templateImageUrl, fieldMappings, photoBgColor, cardSettings) => {
                  try {
                    const res = await fetch(`/api/schools/${schoolId}/template`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        templateImageUrl,
                        fieldMappings,
                        photoBgColor,
                        ...(cardSettings ? {
                          cardWidthMm: cardSettings.cardWidth,
                          cardHeightMm: cardSettings.cardHeight,
                          printDpi: cardSettings.cardDpi,
                          orientation: cardSettings.cardOrientation === "landscape" ? "LANDSCAPE" : "PORTRAIT",
                          hasBackSide: cardSettings.printSides === "both",
                          backTemplateImageUrl: cardSettings.backImageUrl,
                          backFieldMappings: cardSettings.backMappings,
                        } : {}),
                      }),
                    })
                    const data = await res.json()
                    if (data.success) {
                      toast.success('Template saved successfully!')
                      fetchTemplate()
                    } else {
                      toast.error('Failed to save template')
                    }
                  } catch (err) {
                    toast.error('Failed to save template')
                  }
                }}
                onUploadImage={async (file) => {
                  const fd = new FormData()
                  fd.append('file', file)
                  fd.append('folder', `templates`)
                  const res = await fetch('/api/upload', { method: 'POST', body: fd })
                  const data = await res.json()
                  if (!res.ok || !data.success) {
                    throw new Error(data.error || data.detail || 'Upload failed')
                  }
                  return data.url
                }}
              />
            </div>


          </div>
        )}

        {/* BATCHES TAB */}
        {tab === "batches" && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Print Batches</h3>
              <button className="btn btn-primary" onClick={handleGenerateBatch} disabled={generatingBatch}>
                {generatingBatch ? "Generating..." : "Generate New Batch"}
              </button>
            </div>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Students</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Downloads</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>...{b.id.slice(-8)}</td>
                      <td><strong>{b.studentCount}</strong></td>
                      <td>
                        <span className={`status-badge ${
                          b.status === 'READY' ? 'status-approved' :
                          b.status === 'GENERATING' ? 'status-review' :
                          b.status === 'DOWNLOADED' ? 'status-submitted' :
                          'status-pending'
                        }`}>{b.status}</span>
                      </td>
                      <td style={{ fontSize: 13, color: '#64748b' }} suppressHydrationWarning>
                        {mounted ? new Date(b.createdAt).toLocaleDateString() : b.createdAt.split('T')[0]}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {b.status === "READY" || b.status === "DOWNLOADED" ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {b.frontPdfPath && (
                              <a href={`/api/schools/${schoolId}/batches/${b.id}/download/front`} className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>📄 Front PDF</a>
                            )}
                            {b.backPdfPath && (
                              <a href={`/api/schools/${schoolId}/batches/${b.id}/download/back`} className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>📄 Back PDF</a>
                            )}
                            {b.manifestPath && (
                              <a href={`/api/schools/${schoolId}/batches/${b.id}/download/manifest`} className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>📊 Manifest</a>
                            )}
                          </div>
                        ) : b.status === "GENERATING" ? (
                          <span style={{ fontSize: 12, color: '#f59e0b' }}>⏳ Generating...</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No batches generated yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* GENERATE ID CARDS TAB */}
        {tab === "generate" && (
          <BatchGenerator
            schoolId={schoolId}
            schoolName={school.name}
            classes={classes}
          />
        )}

        {/* EXPORT TAB */}
        {tab === "export" && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Export Student Data</h3>
            <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>Download student records in your preferred format.</p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 40, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Status</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="FLAGGED">Flagged</option>
                <option value="PRINTED">Printed</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <button className="btn btn-primary" style={{ padding: '14px 28px' }} onClick={() => handleExport("csv")}>
                📄 Download CSV
              </button>
              <button className="btn btn-outline" style={{ padding: '14px 28px' }} onClick={() => handleExport("excel")}>
                📊 Download Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* STUDENT DETAIL MODAL */}
      {selectedStudent && (() => {
        const editFd = { ...(selectedStudent.formData as Record<string, string>) }
        const studentName = editFd.fullName || editFd["Full Name"] || editFd["Student Name"] || editFd.Student_Name || editFd.name || ""
        const fatherVal = editFd.fatherName || editFd["Father"] || editFd["Father Name"] || editFd.father || ""
        const motherVal = editFd.motherName || editFd["Mother"] || editFd["Mother Name"] || editFd.mother || ""

        // Determine critical missing fields
        const missingItems: string[] = []
        if (!selectedStudent.photoUrl) missingItems.push("Photo")
        if (!studentName) missingItems.push("Student Name")

        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setSelectedStudent(null)}>
          <div style={{ background: 'white', borderRadius: 20, maxWidth: 960, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Student Detail — Edit</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>{selectedStudent.serialNumber} · {selectedStudent.class?.name}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {missingItems.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca' }}>
                    ⚠ Missing: {missingItems.join(', ')}
                  </span>
                )}
                <button onClick={() => setSelectedStudent(null)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
            </div>

            <div style={{ padding: 24 }}>
              {/* Student Info — Editable */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '20px', marginBottom: 28 }}>
                {/* Photo — clickable to upload */}
                <div style={{ position: 'relative' }}>
                  <div
                    style={{ width: 100, height: 130, borderRadius: 12, overflow: 'hidden', border: selectedStudent.photoUrl ? '2px solid #e2e8f0' : '2px dashed #fca5a5', background: selectedStudent.photoUrl ? '#f8fafc' : '#fef2f2', cursor: 'pointer' }}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*'
                      input.onchange = async (e: any) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const fd = new FormData()
                        fd.append("photo", file)
                        fd.append("studentId", selectedStudent.id)
                        try {
                          const res = await fetch(`/api/schools/${schoolId}/students/assign-photo`, { method: "POST", body: fd })
                          const data = await res.json()
                          if (data.success) {
                            toast.success("Photo updated!")
                            setSelectedStudent({ ...selectedStudent, photoUrl: data.data.photoUrl })
                            fetchStudents(studentPage)
                          } else {
                            toast.error(data.error || "Upload failed")
                          }
                        } catch { toast.error("Upload failed") }
                      }
                      input.click()
                    }}
                  >
                    {selectedStudent.photoUrl ? (
                      <img src={selectedStudent.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4, color: '#ef4444' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span style={{ fontSize: 9, fontWeight: 600 }}>Click to add</span>
                      </div>
                    )}
                  </div>
                  <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: '#64748b', background: 'white', padding: '1px 6px', borderRadius: 4, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                    📷 Click to change
                  </div>
                </div>

                {/* Editable Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {Object.entries(selectedStudent.formData as Record<string, string>).map(([key, value]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize', marginBottom: 2 }}>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</div>
                      <input
                        type="text"
                        defaultValue={String(value || '')}
                        onBlur={(e) => {
                          if (e.target.value !== String(value || '')) {
                            const updatedFormData = { ...(selectedStudent.formData as Record<string, string>), [key]: e.target.value }
                            setSelectedStudent({ ...selectedStudent, formData: updatedFormData })
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          border: `1px solid ${!value ? '#fca5a5' : '#e2e8f0'}`,
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#0f172a',
                          background: !value ? '#fffbeb' : 'white',
                          outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Status</div>
                    <span className={`status-badge ${selectedStudent.status === 'APPROVED' ? 'status-approved' : selectedStudent.status === 'FLAGGED' ? 'status-flagged' : selectedStudent.status === 'PRINTED' ? 'status-review' : 'status-submitted'}`}>{selectedStudent.status}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Submitted At</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }} suppressHydrationWarning>
                      {mounted ? new Date(selectedStudent.submittedAt).toLocaleString() : selectedStudent.submittedAt}
                    </div>
                  </div>
                </div>
              </div>

              {/* Flag note */}
              {selectedStudent.flagNote && (
                <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
                  📌 <strong>Flag Note:</strong> {selectedStudent.flagNote}
                </div>
              )}

              {templateData?.templateImageUrl && templateData?.fieldMappings && (templateData.fieldMappings as any[]).length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>ID Card Preview (JPG Template)</h3>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>FRONT SIDE</div>
                      <JpgCardPreview
                        templateImageUrl={templateData.templateImageUrl}
                        fieldMappings={templateData.fieldMappings as any[]}
                        formData={selectedStudent.formData as Record<string, string>}
                        studentPhoto={selectedStudent.photoUrl}
                        flagImageUrl={resolveFlagImageUrl(selectedStudent.formData as Record<string, string>, flagImages)}
                        scale={1}
                        watermark="PREVIEW"
                      />
                    </div>
                    {templateData.hasBackSide && templateData.backTemplateImageUrl && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>BACK SIDE</div>
                        <JpgCardPreview
                          templateImageUrl={templateData.backTemplateImageUrl}
                          fieldMappings={templateData.backFieldMappings as any[] || []}
                          formData={selectedStudent.formData as Record<string, string>}
                          studentPhoto={selectedStudent.photoUrl}
                          flagImageUrl={resolveFlagImageUrl(selectedStudent.formData as Record<string, string>, flagImages)}
                          scale={1}
                          watermark="PREVIEW"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ID Card Preview (Canvas-based, fallback) */}
              {templateData && !templateData.templateImageUrl && (
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>ID Card Preview</h3>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>FRONT</div>
                      <IDCardPreview
                        layout={templateData.frontLayout || []}
                        widthMm={templateData.cardWidthMm || 85.6}
                        heightMm={templateData.cardHeightMm || 54.0}
                        formData={selectedStudent.formData as Record<string, string>}
                        studentPhoto={selectedStudent.photoUrl}
                        schoolLogo={school?.logoUrl || undefined}
                        serialNumber={selectedStudent.serialNumber}
                        scale={3.5}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>BACK</div>
                      <IDCardPreview
                        layout={templateData.backLayout || []}
                        widthMm={templateData.cardWidthMm || 85.6}
                        heightMm={templateData.cardHeightMm || 54.0}
                        formData={selectedStudent.formData as Record<string, string>}
                        serialNumber={selectedStudent.serialNumber}
                        scale={3.5}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#22c55e', color: '#16a34a' }} onClick={() => { handleStatusUpdate(selectedStudent.id, "APPROVED"); setSelectedStudent(null) }}>✓ Approve</button>
                  {selectedStudent.status === "FLAGGED" ? (
                    <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#3b82f6', color: '#2563eb' }} onClick={() => { handleUnflag(selectedStudent.id); setSelectedStudent(null) }}>Unflag</button>
                  ) : (
                    <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#ef4444', color: '#dc2626' }} onClick={() => { handleFlag(selectedStudent.id); setSelectedStudent(null) }}>🚩 Flag</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 13, background: '#8b5cf6', padding: '8px 20px' }}
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/schools/${schoolId}/students/${selectedStudent.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ formData: selectedStudent.formData }),
                        })
                        const data = await res.json()
                        if (data.success) {
                          toast.success("Student data saved!")
                          fetchStudents(studentPage)
                        } else {
                          toast.error(data.error || "Save failed")
                        }
                      } catch { toast.error("Save failed") }
                    }}
                  >
                    💾 Save Changes
                  </button>
                  <button className="btn btn-outline" onClick={() => setSelectedStudent(null)} style={{ fontSize: 13 }}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}
    </>
  )
}
