"use client"
import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import IDCardPreview from "@/components/IDCardPreview"

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

type DashboardData = {
  school: { name: string; logoUrl: string | null } | null
  classes: any[]
  students: StudentData[]
  stats: { total: number; submitted: number; approved: number; flagged: number; pending: number; printed: number }
}

export default function TeacherDashboard() {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [classFilter, setClassFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null)
  const [templateData, setTemplateData] = useState<any>(null)

  const fetchData = async () => {
    try {
      const res = await fetch("/api/teacher/dashboard")
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // Fetch template for preview
    if (session?.user?.schoolId) {
      fetch(`/api/schools/${session.user.schoolId}/template`)
        .then(r => r.json())
        .then(d => { if (d.success) setTemplateData(d.data) })
        .catch(() => {})
    }
  }, [session?.user?.schoolId])

  const handleApprove = async (sid: string) => {
    try {
      await fetch(`/api/schools/${getSchoolId()}/students/${sid}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const handleFlag = async (sid: string) => {
    const note = prompt("Enter reason for flagging:")
    if (!note) return
    try {
      await fetch(`/api/schools/${getSchoolId()}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagNote: note }),
      })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const handleUnflag = async (sid: string) => {
    try {
      await fetch(`/api/schools/${getSchoolId()}/students/${sid}/flag`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unflag: true }),
      })
      fetchData()
    } catch (err) { console.error(err) }
  }

  const getSchoolId = () => session?.user?.schoolId || ""

  const filtered = data?.students?.filter(s => {
    if (classFilter && s.class?.name !== classFilter) return false
    if (statusFilter && s.status !== statusFilter) return false
    return true
  }) || []

  if (loading) return (
    <div className="teacher-page">
      <div className="teacher-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="teacher-page">
      <div className="teacher-container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              {data?.school?.name || "Teacher Dashboard"}
            </h1>
            <p style={{ fontSize: 14, color: '#64748b' }}>Welcome, {session?.user?.name || session?.user?.email}</p>
          </div>
          <button className="btn btn-outline" onClick={() => signOut({ callbackUrl: "/login" })}>Sign Out</button>
        </div>

        {/* Stats */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-card-label">Total Submissions</div>
            <div className="stat-card-value">{data?.stats.total || 0}</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#22c55e' }}>
            <div className="stat-card-label">Approved</div>
            <div className="stat-card-value" style={{ color: '#16a34a' }}>{data?.stats.approved || 0}</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#f59e0b' }}>
            <div className="stat-card-label">Pending Review</div>
            <div className="stat-card-value" style={{ color: '#d97706' }}>{data?.stats.submitted || 0}</div>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#ef4444' }}>
            <div className="stat-card-label">Flagged</div>
            <div className="stat-card-value" style={{ color: '#dc2626' }}>{data?.stats.flagged || 0}</div>
          </div>
        </div>

        {/* Progress Bar */}
        {data && data.stats.total > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 8 }}>
              <span>Approval Progress</span>
              <span>{Math.round(((data.stats.approved + data.stats.printed) / data.stats.total) * 100)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #22c55e, #16a34a)', width: `${((data.stats.approved + data.stats.printed) / data.stats.total) * 100}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Share Links */}
        {data?.classes && data.classes.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>📋 Class Form Links</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.classes.map((c: any) => {
                const linkToken = c.linkToken || (c.students?.[0]?.class?.linkToken)
                if (!linkToken) return null
                const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/submit/${linkToken}`
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1, minWidth: 100 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', flex: 2, minWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { navigator.clipboard.writeText(url); alert('Link copied!') }}>📋 Copy</button>
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', color: '#22c55e', borderColor: '#22c55e' }} onClick={() => { const msg = encodeURIComponent(`📋 ID Card Registration Form\n\nSchool: ${data?.school?.name}\nClass: ${c.name}\n\nPlease fill your details:\n${url}`); window.open(`https://wa.me/?text=${msg}`, '_blank') }}>💬 WhatsApp</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Class Breakdown Table */}
        {data?.classes && data.classes.length > 0 && (
          <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>📊 Class Breakdown</h3>
              <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => {
                const params = new URLSearchParams()
                if (classFilter) {
                  const cls = data?.classes.find((c: any) => c.name === classFilter)
                  if (cls) params.set('classId', cls.id)
                }
                window.open(`/api/teacher/export/csv?${params}`, '_blank')
              }}>
                📄 Download CSV
              </button>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Students</th>
                    <th>Submitted</th>
                    <th>Approved</th>
                    <th>Flagged</th>
                    <th>Printed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.classes.map((c: any) => {
                    const classStudents = data.students.filter((s: any) => s.class?.name === c.name)
                    const stats = {
                      total: classStudents.length,
                      submitted: classStudents.filter((s: any) => s.status === 'SUBMITTED').length,
                      approved: classStudents.filter((s: any) => s.status === 'APPROVED').length,
                      flagged: classStudents.filter((s: any) => s.status === 'FLAGGED').length,
                      printed: classStudents.filter((s: any) => s.status === 'PRINTED').length,
                    }
                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>{stats.total}</td>
                        <td><span className="status-badge status-submitted">{stats.submitted}</span></td>
                        <td><span className="status-badge status-approved">{stats.approved}</span></td>
                        <td><span className="status-badge status-flagged">{stats.flagged}</span></td>
                        <td><span className="status-badge status-review">{stats.printed}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 38, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
            <option value="">All Classes</option>
            {data?.classes.map(c => <option key={c.id} value={c.name}>{c.name} ({c._count.students})</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 38, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
            <option value="">All Status</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="FLAGGED">Flagged</option>
            <option value="PRINTED">Printed</option>
          </select>
          <span style={{ fontSize: 13, color: '#64748b', padding: '10px 0' }}>{filtered.length} students</span>
        </div>

        {/* Student Table */}
        <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Serial</th>
                <th>Name</th>
                <th>Class</th>
                <th>Roll No.</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const fd = s.formData as any
                return (
                  <tr key={s.id}>
                    <td>
                      {s.photoUrl ? (
                        <img src={s.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f1f5f9', border: '2px dashed #cbd5e1' }} />
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.serialNumber}</td>
                    <td style={{ fontWeight: 500 }}>{fd.fullName || "—"}</td>
                    <td>{s.class?.name || "—"}</td>
                    <td>{fd.rollNo || "—"}</td>
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
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#6366f1', borderColor: '#6366f1' }} onClick={() => setSelectedStudent(s)}>👁 View</button>
                        {s.status !== "APPROVED" && s.status !== "PRINTED" && (
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#22c55e', borderColor: '#22c55e' }} onClick={() => handleApprove(s.id)}>✓ Approve</button>
                        )}
                        {s.status === "FLAGGED" ? (
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#3b82f6', borderColor: '#3b82f6' }} onClick={() => handleUnflag(s.id)}>Unflag</button>
                        ) : s.status !== "PRINTED" ? (
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleFlag(s.id)}>🚩</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STUDENT DETAIL MODAL */}
      {selectedStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setSelectedStudent(null)}>
          <div style={{ background: 'white', borderRadius: 20, maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Student Detail</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>{selectedStudent.serialNumber} · {selectedStudent.class?.name}</p>
              </div>
              <button onClick={() => setSelectedStudent(null)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '20px', marginBottom: 24 }}>
                <div style={{ width: 90, height: 120, borderRadius: 12, overflow: 'hidden', border: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  {selectedStudent.photoUrl ? (
                    <img src={selectedStudent.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                  {Object.entries(selectedStudent.formData as Record<string, string>).map(([key, value]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{String(value) || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
              {selectedStudent.flagNote && (
                <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 20 }}>
                  📌 <strong>Flag Note:</strong> {selectedStudent.flagNote}
                </div>
              )}
              {templateData && (
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>ID Card Preview</h3>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>FRONT</div>
                      <IDCardPreview
                        layout={templateData.frontLayout || []}
                        widthMm={templateData.cardWidthMm || 85.6}
                        heightMm={templateData.cardHeightMm || 54.0}
                        formData={selectedStudent.formData as Record<string, string>}
                        studentPhoto={selectedStudent.photoUrl}
                        serialNumber={selectedStudent.serialNumber}
                        scale={3.2}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6, textAlign: 'center' }}>BACK</div>
                      <IDCardPreview
                        layout={templateData.backLayout || []}
                        widthMm={templateData.cardWidthMm || 85.6}
                        heightMm={templateData.cardHeightMm || 54.0}
                        formData={selectedStudent.formData as Record<string, string>}
                        serialNumber={selectedStudent.serialNumber}
                        scale={3.2}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <button className="btn btn-primary" onClick={() => setSelectedStudent(null)} style={{ fontSize: 13 }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
