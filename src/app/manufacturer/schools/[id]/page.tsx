"use client"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

type ClassGroup = {
  id: string
  name: string
  submissionLink: string
  _count: { students: number }
}

type SubmissionField = {
  id: string
  fieldName: string
  fieldType: string
  isRequired: boolean
  sortOrder: number
}

type SchoolDetail = {
  id: string
  name: string
  address: string
  primaryColor: string
  totalSubmissions: number
  _count: { classes: number }
}

export default function SchoolDetailPage() {
  const params = useParams()
  const router = useRouter()
  const schoolId = params.id as string

  const [tab, setTab] = useState<"overview" | "classes" | "fields" | "templates">("overview")
  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [fields, setFields] = useState<SubmissionField[]>([])
  const [loading, setLoading] = useState(true)

  // Add class
  const [newClassName, setNewClassName] = useState("")
  // Add field
  const [newFieldName, setNewFieldName] = useState("")
  const [newFieldType, setNewFieldType] = useState("TEXT")

  const fetchAll = async () => {
    try {
      const [sRes, cRes, fRes] = await Promise.all([
        fetch(`/api/schools/${schoolId}`).then(r => r.json()),
        fetch(`/api/schools/${schoolId}/classes`).then(r => r.json()),
        fetch(`/api/schools/${schoolId}/fields`).then(r => r.json()),
      ])
      if (sRes.success) setSchool(sRes.data)
      if (cRes.success) setClasses(cRes.data)
      if (fRes.success) setFields(fRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [schoolId])

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClassName.trim()) return
    await fetch(`/api/schools/${schoolId}/classes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClassName })
    })
    setNewClassName("")
    const cRes = await fetch(`/api/schools/${schoolId}/classes`).then(r => r.json())
    if (cRes.success) setClasses(cRes.data)
  }

  const handleDeleteClass = async (id: string) => {
    if (!confirm("Deactivate this class?")) return
    await fetch(`/api/classes/${id}`, { method: "DELETE" })
    const cRes = await fetch(`/api/schools/${schoolId}/classes`).then(r => r.json())
    if (cRes.success) setClasses(cRes.data)
  }

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFieldName.trim()) return
    await fetch(`/api/schools/${schoolId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldName: newFieldName, fieldType: newFieldType, isRequired: false })
    })
    setNewFieldName("")
    const fRes = await fetch(`/api/schools/${schoolId}/fields`).then(r => r.json())
    if (fRes.success) setFields(fRes.data)
  }

  const handleDeleteField = async (id: string) => {
    if (!confirm("Remove this field?")) return
    await fetch(`/api/fields/${id}`, { method: "DELETE" })
    const fRes = await fetch(`/api/schools/${schoolId}/fields`).then(r => r.json())
    if (fRes.success) setFields(fRes.data)
  }

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/form/${link}`)
    alert("Link copied!")
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} /></div>
  if (!school) return <div style={{ padding: 32 }}>School not found.</div>

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <button className="btn-ghost" onClick={() => router.push('/manufacturer/schools')} style={{ padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </button>
          <div>
            <h1>{school.name}</h1>
            <p>{school.address || "No address"}</p>
          </div>
        </div>
        
        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginTop: 16, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {(["overview", "classes", "fields", "templates"] as const).map(t => (
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
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {tab === "overview" && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-label">Total Classes</div>
              <div className="stat-card-value">{school._count.classes}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Total Submissions</div>
              <div className="stat-card-value">{school.totalSubmissions || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Form Fields</div>
              <div className="stat-card-value">{fields.length}</div>
            </div>
          </div>
        )}

        {tab === "classes" && (
          <div>
            <form onSubmit={handleAddClass} style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <div className="form-group" style={{ flex: 1, maxWidth: 360 }}>
                <input placeholder="New class name (e.g. Grade 10-A)" value={newClassName} onChange={e => setNewClassName(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: 44 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
                Add Class
              </button>
            </form>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class Name</th>
                    <th>Submissions</th>
                    <th>Form Link</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(cls => (
                    <tr key={cls.id}>
                      <td style={{ fontWeight: 600 }}>{cls.name}</td>
                      <td><span className="status-badge status-submitted">{cls._count.students} students</span></td>
                      <td style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>...{cls.submissionLink.slice(-12)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="btn btn-outline" onClick={() => copyLink(cls.submissionLink)} style={{ fontSize: 12, padding: '6px 12px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            Copy
                          </button>
                          <button className="btn btn-danger" onClick={() => handleDeleteClass(cls.id)} style={{ fontSize: 12, padding: '6px 10px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {classes.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No classes created yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "fields" && (
          <div>
            <form onSubmit={handleAddField} style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, maxWidth: 280 }}>
                <label>Field Name</label>
                <input placeholder="e.g. Father Name" value={newFieldName} onChange={e => setNewFieldName(e.target.value)} required />
              </div>
              <div className="form-group" style={{ width: 160 }}>
                <label>Type</label>
                <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)} style={{ height: 44, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: 'white', width: '100%' }}>
                  <option value="TEXT">Short Text</option>
                  <option value="DATE">Date Picker</option>
                  <option value="PHOTO">Photo Upload</option>
                  <option value="SIGNATURE">Signature</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ height: 44 }}>Add Field</button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fields.map(field => (
                <div key={field.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"><line x1="8" x2="16" y1="6" y2="6"/><line x1="8" x2="16" y1="12" y2="12"/><line x1="8" x2="16" y1="18" y2="18"/><line x1="4" x2="4" y1="6" y2="6"/><line x1="4" x2="4" y1="12" y2="12"/><line x1="4" x2="4" y1="18" y2="18"/></svg>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{field.fieldName}</div>
                      <span className="status-badge" style={{ background: '#f1f5f9', color: '#64748b', fontSize: 11, marginTop: 4, display: 'inline-block' }}>{field.fieldType}</span>
                    </div>
                  </div>
                  <button className="btn btn-danger" onClick={() => handleDeleteField(field.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                  </button>
                </div>
              ))}
              {fields.length === 0 && (
                <div className="empty-state" style={{ background: 'white', borderRadius: 14, border: '2px dashed #e2e8f0' }}>
                  <h3>No custom fields</h3>
                  <p>Add fields that students will fill in during registration.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "templates" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', padding: 40, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" style={{ marginBottom: 8 }}><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>ID Card Template Studio</h3>
            <p style={{ color: '#94a3b8', maxWidth: 380, textAlign: 'center', fontSize: 14 }}>Design your ID card front and back using a drag-and-drop canvas. Add student photos, dynamic text fields, QR codes, and more.</p>
            <button className="btn btn-primary" style={{ marginTop: 8, padding: '12px 28px', fontSize: 15 }} onClick={() => router.push(`/manufacturer/schools/${schoolId}/templates`)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/></svg>
              Open Template Studio
            </button>
          </div>
        )}
      </div>
    </>
  )
}
