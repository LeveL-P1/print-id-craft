"use client"
import { useState, useEffect, useMemo, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import IDCardPreview from "@/components/IDCardPreview"

type StudentData = {
  id: string
  serialNumber: string
  photoUrl: string
  formData: any
  status: string
  flagNote: string | null
  teacherComment: string | null
  submittedAt: string
  class: { name: string; linkToken?: string }
}

type ClassData = {
  id: string
  name: string
  linkToken: string
  _count: { students: number }
  teachers: { id: string; name: string; email: string; isMainTeacher: boolean }[]
}

type SubTeacher = {
  id: string
  name: string
  email: string
  classId: string | null
  class: { id: string; name: string } | null
  createdAt: string
}

type DashboardData = {
  school: { name: string; logoUrl: string | null } | null
  classes: ClassData[]
  students: StudentData[]
  stats: { total: number; submitted: number; approved: number; flagged: number; pending: number; printed: number }
  isMainTeacher: boolean
  assignedClassId: string | null
}

export default function TeacherDashboard() {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [classFilter, setClassFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null)
  const [templateData, setTemplateData] = useState<any>(null)

  // Sub-teacher management
  const [activeTab, setActiveTab] = useState<"overview" | "students" | "sub-teachers">("overview")
  const [subTeachers, setSubTeachers] = useState<SubTeacher[]>([])
  const [showAddTeacher, setShowAddTeacher] = useState(false)
  const [newTeacherName, setNewTeacherName] = useState("")
  const [newTeacherEmail, setNewTeacherEmail] = useState("")
  const [newTeacherPassword, setNewTeacherPassword] = useState("")
  const [newTeacherClassId, setNewTeacherClassId] = useState("")
  const [addingTeacher, setAddingTeacher] = useState(false)

  // Teacher comment for student
  const [commentStudentId, setCommentStudentId] = useState<string | null>(null)
  const [commentText, setCommentText] = useState("")
  const [savingComment, setSavingComment] = useState(false)

  // Edit student form data
  const [editingStudent, setEditingStudent] = useState<StudentData | null>(null)
  const [editFormData, setEditFormData] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/teacher/dashboard")
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSubTeachers = useCallback(async () => {
    try {
      const res = await fetch("/api/teacher/sub-teachers")
      const json = await res.json()
      if (json.success) setSubTeachers(json.data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  useEffect(() => {
    fetchData()
    if (session?.user?.schoolId) {
      fetch(`/api/schools/${session.user.schoolId}/template`)
        .then(r => r.json())
        .then(d => { if (d.success) setTemplateData(d.data) })
        .catch(() => {})
    }
  }, [session?.user?.schoolId, fetchData])

  useEffect(() => {
    if (activeTab === "sub-teachers" && data?.isMainTeacher) {
      fetchSubTeachers()
    }
  }, [activeTab, data?.isMainTeacher, fetchSubTeachers])

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

  const handleDisapprove = async (sid: string) => {
    try {
      await fetch(`/api/schools/${getSchoolId()}/students/${sid}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FLAGGED" }),
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

  const handleSaveComment = async (sid: string) => {
    setSavingComment(true)
    try {
      await fetch(`/api/teacher/students/${sid}/comment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherComment: commentText }),
      })
      setCommentStudentId(null)
      setCommentText("")
      fetchData()
    } catch (err) { console.error(err) }
    setSavingComment(false)
  }

  const handleAddSubTeacher = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingTeacher(true)
    try {
      const res = await fetch("/api/teacher/sub-teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeacherName,
          email: newTeacherEmail,
          password: newTeacherPassword,
          classId: newTeacherClassId,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setNewTeacherName("")
        setNewTeacherEmail("")
        setNewTeacherPassword("")
        setNewTeacherClassId("")
        setShowAddTeacher(false)
        fetchSubTeachers()
      } else {
        alert(json.error || "Failed to add teacher")
      }
    } catch (err) { console.error(err) }
    setAddingTeacher(false)
  }

  const handleDeleteSubTeacher = async (id: string, name: string) => {
    if (!confirm(`Remove sub-teacher "${name}"? This cannot be undone.`)) return
    try {
      await fetch(`/api/teacher/sub-teachers?id=${id}`, { method: "DELETE" })
      fetchSubTeachers()
    } catch (err) { console.error(err) }
  }

  const handleSaveEdit = async () => {
    if (!editingStudent) return
    setSavingEdit(true)
    try {
      await fetch(`/api/teacher/students/${editingStudent.id}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData: editFormData }),
      })
      setEditingStudent(null)
      setEditFormData({})
      fetchData()
    } catch (err) { console.error(err) }
    setSavingEdit(false)
  }

  const getSchoolId = () => session?.user?.schoolId || ""

  const filtered = useMemo(() => {
    return data?.students?.filter(s => {
      if (classFilter && s.class?.name !== classFilter) return false
      if (statusFilter && s.status !== statusFilter) return false
      return true
    }) || []
  }, [data?.students, classFilter, statusFilter])

  if (loading) return (
    <div className="teacher-page">
      <div className="teacher-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
        </div>
      </div>
    </div>
  )

  const isMain = data?.isMainTeacher ?? false

  return (
    <div className="teacher-page">
      <div className="teacher-container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
              {data?.school?.name || "Teacher Dashboard"}
            </h1>
            <p style={{ fontSize: 14, color: '#64748b' }}>
              Welcome, {session?.user?.name || session?.user?.email}
              {isMain && <span style={{ marginLeft: 8, padding: '2px 8px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Main Teacher</span>}
              {!isMain && <span style={{ marginLeft: 8, padding: '2px 8px', background: '#f1f5f9', color: '#64748b', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Class Teacher</span>}
            </p>
          </div>
          <button className="btn btn-outline" onClick={() => signOut({ callbackUrl: "/login" })}>Sign Out</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 24, gap: 0 }}>
          {(["overview", "students", ...(isMain ? ["sub-teachers"] : [])] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t as any)}
              style={{
                padding: '12px 20px',
                background: 'none',
                border: 'none',
                fontSize: 14,
                fontWeight: activeTab === t ? 700 : 500,
                color: activeTab === t ? '#3b82f6' : '#94a3b8',
                borderBottom: activeTab === t ? '2px solid #3b82f6' : '2px solid transparent',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'sub-teachers' ? '👩‍🏫 Sub-Teachers' : t === 'overview' ? '📊 Overview' : '🎓 Students'}
            </button>
          ))}
        </div>

        {/* ========== OVERVIEW TAB ========== */}
        {activeTab === "overview" && (
          <div className="fade-in">
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

            {/* Class Form Links */}
            {data?.classes && data.classes.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>📋 Class Form Links — Share with Students</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.classes.map((c: any) => {
                    const linkToken = c.linkToken
                    if (!linkToken) return null
                    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/submit/${linkToken}`
                    const assignedTeacher = c.teachers?.find((t: any) => !t.isMainTeacher)
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, flexWrap: 'wrap', border: '1px solid #f1f5f9' }}>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{c.name}</span>
                          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>({c._count?.students || 0} students)</span>
                          {assignedTeacher && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              👩‍🏫 {assignedTeacher.name}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', flex: 2, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { navigator.clipboard.writeText(url); alert('Link copied!') }}>📋 Copy</button>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', color: '#22c55e', borderColor: '#22c55e' }} onClick={() => { const msg = encodeURIComponent(`📋 ID Card Registration Form\n\nSchool: ${data?.school?.name}\nClass: ${c.name}\n\nPlease fill your details:\n${url}`); window.open(`https://wa.me/?text=${msg}`, '_blank') }}>💬 WhatsApp</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Class Breakdown */}
            {data?.classes && data.classes.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 24, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>📊 Class Breakdown</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => {
                      const params = new URLSearchParams()
                      if (classFilter) {
                        const cls = data?.classes.find((c: any) => c.name === classFilter)
                        if (cls) params.set('classId', cls.id)
                      }
                      window.open(`/api/teacher/export/csv?${params}`, '_blank')
                    }}>
                      📄 CSV
                    </button>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px', background: 'linear-gradient(135deg, #22c55e, #16a34a)' }} onClick={() => {
                      const params = new URLSearchParams()
                      if (classFilter) {
                        const cls = data?.classes.find((c: any) => c.name === classFilter)
                        if (cls) params.set('classId', cls.id)
                      }
                      window.open(`/api/teacher/export/excel?${params}`, '_blank')
                    }}>
                      📊 Excel
                    </button>
                  </div>
                </div>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Teacher</th>
                        <th>Students</th>
                        <th>Approved</th>
                        <th>Flagged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.classes.map((c: any) => {
                        const classStudents = data.students.filter((s: any) => s.class?.name === c.name)
                        const approved = classStudents.filter((s: any) => s.status === 'APPROVED').length
                        const flagged = classStudents.filter((s: any) => s.status === 'FLAGGED').length
                        const assignedTeacher = c.teachers?.find((t: any) => !t.isMainTeacher)
                        return (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td style={{ fontSize: 12, color: '#64748b' }}>{assignedTeacher?.name || (isMain ? '—' : session?.user?.name)}</td>
                            <td><span className="status-badge status-submitted">{classStudents.length}</span></td>
                            <td><span className="status-badge status-approved">{approved}</span></td>
                            <td><span className="status-badge status-flagged">{flagged}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== STUDENTS TAB ========== */}
        {activeTab === "students" && (
          <div className="fade-in">
            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {isMain && (
                <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ height: 38, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                  <option value="">All Classes</option>
                  {data?.classes.map(c => <option key={c.id} value={c.name}>{c.name} ({c._count.students})</option>)}
                </select>
              )}
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 38, padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 13 }}>
                <option value="">All Status</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="FLAGGED">Flagged / Disapproved</option>
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
                    <th>Status</th>
                    <th>Comment</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const fd = s.formData as any
                    const studentName = fd.fullName || fd["Full Name"] || fd["Student Name"] || fd.Student_Name || fd.name || "—"
                    return (
                      <tr key={s.id}>
                        <td>
                          {s.photoUrl ? (
                            <img src={s.photoUrl} alt="" loading="lazy" decoding="async" style={{ width: 36, height: 48, borderRadius: 4, objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                          ) : (
                            <div style={{ width: 36, height: 48, borderRadius: 4, background: '#f1f5f9', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>No Photo</div>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.serialNumber}</td>
                        <td style={{ fontWeight: 500 }}>{studentName}</td>
                        <td>{s.class?.name || "—"}</td>
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
                        <td>
                          {s.teacherComment ? (
                            <div style={{ fontSize: 11, color: '#334155', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.teacherComment}>
                              💬 {s.teacherComment}
                            </div>
                          ) : (
                            <button
                              style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => { setCommentStudentId(s.id); setCommentText(s.teacherComment || "") }}
                            >
                              + Add comment
                            </button>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#6366f1', borderColor: '#6366f1' }} onClick={() => setSelectedStudent(s)}>👁</button>
                            {s.status !== "APPROVED" && s.status !== "PRINTED" && (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#22c55e', borderColor: '#22c55e' }} onClick={() => handleApprove(s.id)}>✓</button>
                            )}
                            {s.status !== "FLAGGED" && s.status !== "PRINTED" && (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleDisapprove(s.id)} title="Disapprove">✕</button>
                            )}
                            {s.status === "FLAGGED" ? (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#3b82f6', borderColor: '#3b82f6' }} onClick={() => handleUnflag(s.id)}>Unflag</button>
                            ) : s.status !== "PRINTED" ? (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#f59e0b', borderColor: '#f59e0b' }} onClick={() => handleFlag(s.id)}>🚩</button>
                            ) : null}
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#8b5cf6', borderColor: '#8b5cf6' }} onClick={() => {
                              setEditingStudent(s)
                              setEditFormData({ ...(s.formData as Record<string, string>) })
                            }}>✏️</button>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 8px', color: '#64748b', borderColor: '#cbd5e1' }} onClick={() => {
                              setCommentStudentId(s.id)
                              setCommentText(s.teacherComment || "")
                            }}>💬</button>
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
        )}

        {/* ========== SUB-TEACHERS TAB ========== */}
        {activeTab === "sub-teachers" && isMain && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Class Teachers</h2>
                <p style={{ fontSize: 13, color: '#64748b' }}>Assign teachers to classes. Each class teacher can only see & manage their class.</p>
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddTeacher(!showAddTeacher)}>
                {showAddTeacher ? 'Cancel' : '+ Add Teacher'}
              </button>
            </div>

            {/* Add Teacher Form */}
            {showAddTeacher && (
              <form onSubmit={handleAddSubTeacher} style={{ background: '#f8fafc', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 16 }}>Add New Class Teacher</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div className="form-group">
                    <label>Name</label>
                    <input value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} placeholder="Teacher name" required />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={newTeacherEmail} onChange={e => setNewTeacherEmail(e.target.value)} placeholder="teacher@school.com" required />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={newTeacherPassword} onChange={e => setNewTeacherPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} />
                  </div>
                  <div className="form-group">
                    <label>Assign to Class</label>
                    <select value={newTeacherClassId} onChange={e => setNewTeacherClassId(e.target.value)} required>
                      <option value="">Select class...</option>
                      {data?.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }} disabled={addingTeacher}>
                  {addingTeacher ? 'Adding...' : 'Add Class Teacher'}
                </button>
              </form>
            )}

            {/* Sub-teachers List */}
            {subTeachers.length > 0 ? (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Assigned Class</th>
                      <th>Added</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subTeachers.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 700 }}>
                              {t.name.charAt(0).toUpperCase()}
                            </div>
                            {t.name}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{t.email}</td>
                        <td>
                          {t.class ? (
                            <span className="status-badge status-approved">{t.class.name}</span>
                          ) : (
                            <span className="status-badge status-pending">Unassigned</span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleDeleteSubTeacher(t.id, t.name)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', background: 'white', borderRadius: 12, border: '2px dashed #e2e8f0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>👩‍🏫</div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No Sub-Teachers Yet</h3>
                <p style={{ fontSize: 13 }}>Add class teachers so each one can manage their own class.</p>
              </div>
            )}
          </div>
        )}

        {/* ========== COMMENT MODAL ========== */}
        {commentStudentId && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setCommentStudentId(null)}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>💬 Teacher Comment</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>This comment will be visible to the manufacturer.</p>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="e.g. Photo needs retake, wrong spelling on name, etc."
                style={{ width: '100%', minHeight: 100, padding: 12, border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-outline" onClick={() => setCommentStudentId(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={savingComment} onClick={() => handleSaveComment(commentStudentId)}>
                  {savingComment ? 'Saving...' : 'Save Comment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== EDIT STUDENT MODAL ========== */}
        {editingStudent && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => setEditingStudent(null)}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 16 }}>✏️ Edit Student Data</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(editFormData).map(([key, value]) => (
                  <div key={key} className="form-group">
                    <label style={{ textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</label>
                    <input
                      value={value}
                      onChange={e => setEditFormData(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-outline" onClick={() => setEditingStudent(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={savingEdit} onClick={handleSaveEdit}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== STUDENT DETAIL MODAL ========== */}
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

                {/* Teacher Comment Display */}
                {selectedStudent.teacherComment && (
                  <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, color: '#1d4ed8', fontSize: 13, marginBottom: 16 }}>
                    💬 <strong>Teacher Comment:</strong> {selectedStudent.teacherComment}
                  </div>
                )}

                {selectedStudent.flagNote && (
                  <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
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
                      {templateData.hasBackSide && (
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
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16, flexWrap: 'wrap' }}>
                  {selectedStudent.status !== "APPROVED" && selectedStudent.status !== "PRINTED" && (
                    <button className="btn btn-primary" style={{ fontSize: 13, background: 'linear-gradient(135deg, #22c55e, #16a34a)' }} onClick={() => { handleApprove(selectedStudent.id); setSelectedStudent(null) }}>✓ Approve</button>
                  )}
                  {selectedStudent.status !== "FLAGGED" && selectedStudent.status !== "PRINTED" && (
                    <button className="btn btn-outline" style={{ fontSize: 13, color: '#ef4444', borderColor: '#ef4444' }} onClick={() => { handleDisapprove(selectedStudent.id); setSelectedStudent(null) }}>✕ Disapprove</button>
                  )}
                  <button className="btn btn-outline" style={{ fontSize: 13 }} onClick={() => {
                    setCommentStudentId(selectedStudent.id)
                    setCommentText(selectedStudent.teacherComment || "")
                  }}>💬 Comment</button>
                  <button className="btn btn-outline" style={{ fontSize: 13 }} onClick={() => setSelectedStudent(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
