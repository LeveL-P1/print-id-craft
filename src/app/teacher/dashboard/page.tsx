"use client"
import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"

type Student = {
  id: string
  serialNumber: string
  photoUrl: string | null
  formData: any
  status: "PENDING" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "FLAGGED"
  submittedAt: string
  classGroup: { name: string }
}

export default function TeacherDashboard() {
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStudents = async () => {
    try {
      const res = await fetch("/api/teacher/students")
      const json = await res.json()
      if (json.success) setStudents(json.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session?.user?.role === "TEACHER") fetchStudents()
  }, [session])

  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`/api/students/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    })
    fetchStudents()
  }

  const approvedCount = students.filter(s => s.status === "APPROVED").length
  const flaggedCount = students.filter(s => s.status === "FLAGGED").length
  const pendingCount = students.filter(s => s.status === "SUBMITTED" || s.status === "UNDER_REVIEW").length

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>P</div>
            <span className="sidebar-brand-text">PrintID Pro</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <Link href="/teacher/dashboard" className={`sidebar-link ${pathname === '/teacher/dashboard' ? 'sidebar-link-active' : ''}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            Submissions
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, #22c55e, #15803d)' }}>{session?.user?.email?.charAt(0).toUpperCase() || "T"}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name" style={{ color: 'white' }}>{session?.user?.email || "Teacher"}</div>
              <div className="sidebar-user-role">Teacher Portal</div>
            </div>
            <button className="btn-ghost" onClick={() => signOut({ callbackUrl: '/login' })} style={{ padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="app-content">
        <div className="page-header">
          <h1>Teacher Dashboard</h1>
          <p>Review student data submissions inside your school environment.</p>
        </div>
        <div className="page-body">
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-label">Pending Review</div>
              <div className="stat-card-value">{pendingCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Approved to Print</div>
              <div className="stat-card-value">{approvedCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Flagged issues</div>
              <div className="stat-card-value text-red-500">{flaggedCount}</div>
            </div>
          </div>

          <div className="data-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>ID Number</th>
                  <th>Class</th>
                  <th>Extracted Info</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td>
                      {s.photoUrl ? (
                         <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '2px solid #e2e8f0' }}>
                           <img src={s.photoUrl} alt="student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                         </div>
                      ) : (
                         <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                         </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{s.serialNumber}</td>
                    <td>{s.classGroup.name}</td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                         {Object.entries(s.formData).slice(0, 2).map(([k, v]) => (
                           <div key={k} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                             <span style={{ color: '#94a3b8' }}>{String(k).substring(0, 10)}:</span> 
                             <span style={{ fontWeight: 500 }} className="truncate">{String(v)}</span>
                           </div>
                         ))}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${s.status === 'APPROVED' ? 'status-approved' : s.status === 'FLAGGED' ? 'status-flagged' : 'status-submitted'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '4px 10px', fontSize: 12, borderColor: '#22c55e', color: '#16a34a' }}
                          onClick={() => handleStatusChange(s.id, "APPROVED")}
                        >
                          Approve
                        </button>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '4px 10px', fontSize: 12, borderColor: '#ef4444', color: '#dc2626' }}
                          onClick={() => handleStatusChange(s.id, "FLAGGED")}
                        >
                          Flag
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && !loading && (
                   <tr>
                     <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                        No submissions available at this time.
                     </td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
