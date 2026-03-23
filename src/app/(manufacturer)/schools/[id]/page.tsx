"use client"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import IDCardPreview from "@/components/IDCardPreview"

type ClassData = {
  id: string
  name: string
  linkToken: string
  isActive: boolean
  expiresAt: string | null
  _count: { students: number }
  createdAt: string
}

type StudentData = {
  id: string
  serialNumber: string
  photoUrl: string
  formData: any
  status: string
  flagNote: string | null
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

  const [tab, setTab] = useState<"overview"|"classes"|"students"|"template"|"batches"|"export">("overview")
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

  // Add class
  const [newClassName, setNewClassName] = useState("")
  const [newExpiry, setNewExpiry] = useState("")
  const [addingClass, setAddingClass] = useState(false)

  // Batch generation
  const [generatingBatch, setGeneratingBatch] = useState(false)

  // Student detail modal
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null)
  const [templateData, setTemplateData] = useState<any>(null)

  // Bulk import
  const [importOpen, setImportOpen] = useState(false)
  const [importStep, setImportStep] = useState<"upload" | "preview" | "result">("upload")
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importClassId, setImportClassId] = useState("")
  const [importUploading, setImportUploading] = useState(false)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [dragOver, setDragOver] = useState(false)

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
      const res = await fetch(`/api/schools/${schoolId}/template`)
      const data = await res.json()
      if (data.success) setTemplateData(data.data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => {
    Promise.all([fetchSchool(), fetchClasses(), fetchTemplate()]).finally(() => setLoading(false))
  }, [schoolId])

  useEffect(() => {
    if (tab === "students") fetchStudents()
    if (tab === "batches") fetchBatches()
  }, [tab, statusFilter, classFilter, searchQuery])

  const getExpiryBadge = (expiresAt: string | null) => {
    if (!expiresAt) return null
    const exp = new Date(expiresAt)
    const now = new Date()
    const diffMs = exp.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffMs < 0) {
      return <span className="status-badge status-flagged" style={{ fontSize: 10 }}>Expired</span>
    } else if (diffDays <= 3) {
      return <span className="status-badge status-review" style={{ fontSize: 10 }}>Expires in {diffDays}d</span>
    } else {
      return <span style={{ fontSize: 11, color: '#94a3b8' }}>Expires in {diffDays}d</span>
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
    await fetch(`/api/schools/${schoolId}/students/${sid}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    toast.success(`Student status updated to ${status}`)
    fetchStudents(studentPage)
  }

  const handleFlag = async (sid: string) => {
    const note = prompt("Enter flag reason:")
    if (!note) return
    await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagNote: note }),
    })
    toast.success("Student flagged")
    fetchStudents(studentPage)
  }

  const handleUnflag = async (sid: string) => {
    await fetch(`/api/schools/${schoolId}/students/${sid}/flag`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unflag: true }),
    })
    toast.success("Student unflagged")
    fetchStudents(studentPage)
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
    if (!importFile || !importClassId) {
      toast.error("Please select a class and upload a file.")
      return
    }
    setImportUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      fd.append("classId", importClassId)
      fd.append("mode", "validate")
      const res = await fetch(`/api/schools/${schoolId}/students/import`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setImportPreview(data.data)
        setImportStep("preview")
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
    if (!importFile || !importClassId) return
    setImportUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", importFile)
      fd.append("classId", importClassId)
      fd.append("mode", "import")
      const res = await fetch(`/api/schools/${schoolId}/students/import`, { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setImportResult(data.data)
        setImportStep("result")
        toast.success(`${data.data.imported} students imported!`)
        fetchStudents()
        fetchSchool()
      } else {
        toast.error(data.error || "Import failed")
      }
    } catch (err) {
      toast.error("Import failed")
    } finally {
      setImportUploading(false)
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

  const handleExport = (format: "csv" | "excel") => {
    const params = new URLSearchParams()
    if (classFilter) params.set("classId", classFilter)
    if (statusFilter) params.set("status", statusFilter)
    window.open(`/api/schools/${schoolId}/export/${format}?${params}`, "_blank")
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )
  if (!school) return <div style={{ padding: 32 }}>School not found.</div>

  const tabs = ["overview", "classes", "students", "template", "batches", "export"] as const

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
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white' }}>
              {school.name.charAt(0)}
            </div>
            <div>
              <h1>{school.name}</h1>
              <p>{school.address || school.contactEmail}</p>
            </div>
          </div>
          <Link href={`/schools/${schoolId}/verify`} className="btn btn-outline" style={{ fontSize: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="8" height="8" rx="1" /><rect x="14" y="2" width="8" height="8" rx="1" /><rect x="2" y="14" width="8" height="8" rx="1" /><rect x="14" y="14" width="4" height="4" rx="0.5" /></svg>
            QR Verify
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 16, background: '#f1f5f9', borderRadius: 10, padding: 4, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tab === t ? 'white' : 'transparent',
                color: tab === t ? '#0f172a' : '#64748b',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
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
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-label">Total Classes</div>
              <div className="stat-card-value">{school._count.classes}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Total Students</div>
              <div className="stat-card-value">{school._count.students}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Print Batches</div>
              <div className="stat-card-value">{school._count.batches}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Template</div>
              <div className="stat-card-value">{school.template ? "✓" : "—"}</div>
            </div>
          </div>
        )}

        {/* CLASSES TAB */}
        {tab === "classes" && (
          <div>
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
                    <th>Students</th>
                    <th>Status</th>
                    <th>Link</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(cls => (
                    <tr key={cls.id}>
                      <td style={{ fontWeight: 600 }}>{cls.name}</td>
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
                  ))}
                  {classes.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No classes created yet. Add one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STUDENTS TAB */}
        {tab === "students" && (
          <>
          <div>
            {/* Action Bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={() => setImportOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                Bulk Import Excel
              </button>
              <a href={`/api/schools/${schoolId}/students/import-template`} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', textDecoration: 'none', fontSize: 13 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                Download Template
              </a>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <input placeholder="Search by name or serial..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value) }} style={{ height: 40, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, flex: 1, minWidth: 200 }} />
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

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{studentTotal} students found</div>

            <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Serial No.</th>
                    <th>Name</th>
                    <th>Class</th>
                    <th>Roll No.</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => {
                    const fd = s.formData as any
                    return (
                      <tr key={s.id}>
                        <td>
                          {s.photoUrl ? (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid #e2e8f0' }}>
                              <img src={s.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            </div>
                          )}
                        </td>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{s.serialNumber}</td>
                        <td style={{ fontWeight: 500 }}>{fd.fullName || fd["Full Name"] || "—"}</td>
                        <td>{s.class?.name || "—"}</td>
                        <td>{fd.rollNo || fd["Roll No."] || "—"}</td>
                        <td>
                          <span className={`status-badge ${
                            s.status === 'APPROVED' ? 'status-approved' :
                            s.status === 'FLAGGED' ? 'status-flagged' :
                            s.status === 'PRINTED' ? 'status-review' :
                            s.status === 'SUBMITTED' ? 'status-submitted' :
                            'status-pending'
                          }`}>{s.status}</span>
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
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No students found</td></tr>
                  )}
                </tbody>
              </table>
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
                      {/* Class selector */}
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Select Class *</label>
                        <select value={importClassId} onChange={e => setImportClassId(e.target.value)} style={{ width: '100%', height: 44, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14 }}>
                          <option value="">Choose a class...</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c._count.students} students)</option>)}
                        </select>
                      </div>

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

                      {/* Info box */}
                      <div style={{ marginTop: 16, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600, marginBottom: 4 }}>💡 Tips</div>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#3b82f6', lineHeight: 1.8 }}>
                          <li>Use the <strong>Download Template</strong> button to get a pre-formatted Excel with correct columns</li>
                          <li>Column headers are matched automatically (e.g. &quot;Full Name&quot;, &quot;Name&quot;, &quot;Student Name&quot; all work)</li>
                          <li>Required fields: Full Name, Roll No., Date of Birth, Father Name, Phone</li>
                          <li>Max 2000 students per import</li>
                        </ul>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline" onClick={resetImport}>Cancel</button>
                        <button
                          className="btn btn-primary"
                          onClick={handleImportValidate}
                          disabled={!importFile || !importClassId || importUploading}
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
          </>
        )}

        {/* TEMPLATE TAB */}
        {tab === "template" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', padding: 40, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>ID Card Template Studio</h3>
            <p style={{ color: '#94a3b8', maxWidth: 380, textAlign: 'center', fontSize: 14 }}>Design your ID card front and back using a drag-and-drop canvas. Add student photos, dynamic text fields, QR codes, and more.</p>
            <Link href={`/schools/${schoolId}/template`} className="btn btn-primary" style={{ marginTop: 8, padding: '12px 28px', fontSize: 15 }}>
              Open Template Studio →
            </Link>
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
                      <td style={{ fontSize: 13, color: '#64748b' }}>{new Date(b.createdAt).toLocaleDateString()}</td>
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
      {selectedStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setSelectedStudent(null)}>
          <div style={{ background: 'white', borderRadius: 20, maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Student Detail</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>{selectedStudent.serialNumber} · {selectedStudent.class?.name}</p>
              </div>
              <button onClick={() => setSelectedStudent(null)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Student Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '20px', marginBottom: 28 }}>
                {/* Photo */}
                <div style={{ width: 100, height: 130, borderRadius: 12, overflow: 'hidden', border: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  {selectedStudent.photoUrl ? (
                    <img src={selectedStudent.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                  {Object.entries(selectedStudent.formData as Record<string, string>).map(([key, value]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{String(value) || '—'}</div>
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Status</div>
                    <span className={`status-badge ${selectedStudent.status === 'APPROVED' ? 'status-approved' : selectedStudent.status === 'FLAGGED' ? 'status-flagged' : selectedStudent.status === 'PRINTED' ? 'status-review' : 'status-submitted'}`}>{selectedStudent.status}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Submitted At</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{new Date(selectedStudent.submittedAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              {/* Flag note */}
              {selectedStudent.flagNote && (
                <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
                  📌 <strong>Flag Note:</strong> {selectedStudent.flagNote}
                </div>
              )}

              {/* ID Card Preview */}
              {templateData && (
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
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
                <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#22c55e', color: '#16a34a' }} onClick={() => { handleStatusUpdate(selectedStudent.id, "APPROVED"); setSelectedStudent(null) }}>✓ Approve</button>
                {selectedStudent.status === "FLAGGED" ? (
                  <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#3b82f6', color: '#2563eb' }} onClick={() => { handleUnflag(selectedStudent.id); setSelectedStudent(null) }}>Unflag</button>
                ) : (
                  <button className="btn btn-outline" style={{ fontSize: 13, borderColor: '#ef4444', color: '#dc2626' }} onClick={() => { handleFlag(selectedStudent.id); setSelectedStudent(null) }}>🚩 Flag</button>
                )}
                <button className="btn btn-primary" onClick={() => setSelectedStudent(null)} style={{ fontSize: 13 }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
