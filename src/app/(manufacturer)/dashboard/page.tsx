"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type DashboardData = {
  totalSchools: number
  totalStudents: number
  pendingBatches: number
  studentsThisMonth: number
  recentSchools: any[]
}

export default function ManufacturerDashboard() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/schools")
        const json = await res.json()
        if (json.success) {
          const schools = json.data
          const totalStudents = schools.reduce((a: number, s: any) => a + (s._count?.students || 0), 0)
          const pendingBatches = schools.reduce((a: number, s: any) => a + (s._count?.batches || 0), 0)

          setData({
            totalSchools: schools.length,
            totalStudents,
            pendingBatches,
            studentsThisMonth: totalStudents, // simplified
            recentSchools: schools.slice(0, 5),
          })
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <>
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Welcome back! Here&apos;s your overview.</p>
        </div>
        <div className="page-body">
          <div className="stat-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stat-card">
                <div style={{ height: 14, width: 100, background: '#f1f5f9', borderRadius: 6, marginBottom: 12 }} />
                <div style={{ height: 32, width: 60, background: '#f1f5f9', borderRadius: 6 }} />
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back! Here&apos;s your overview.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/schools" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
            Add School
          </Link>
          <Link href="/schools" className="btn btn-outline">
            View All Schools
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Stats Row */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Total Schools</div>
            <div className="stat-card-value">{data?.totalSchools || 0}</div>
            <div className="stat-card-change positive">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
              {' '}Active
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Students</div>
            <div className="stat-card-value">{data?.totalStudents || 0}</div>
            <div className="stat-card-change positive">↑ All submissions</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Print Batches</div>
            <div className="stat-card-value">{data?.pendingBatches || 0}</div>
            <div className="stat-card-change" style={{ color: '#f59e0b' }}>Total batches</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">This Month</div>
            <div className="stat-card-value">{data?.studentsThisMonth || 0}</div>
            <div className="stat-card-change positive">↑ Students</div>
          </div>
        </div>

        {/* Recent Schools */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Recent Schools</h2>
            <Link href="/schools" style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600, textDecoration: 'none' }}>View All →</Link>
          </div>

          {data?.recentSchools && data.recentSchools.length > 0 ? (
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>School</th>
                    <th>Students</th>
                    <th>Classes</th>
                    <th>Template</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSchools.map((school: any) => (
                    <tr key={school.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/schools/${school.id}`)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                            {school.name.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{school.name}</div>
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>{school.contactEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="status-badge status-submitted">{school._count?.students || 0}</span></td>
                      <td>{school._count?.classes || 0}</td>
                      <td>
                        {school.template ? (
                          <span className="status-badge status-approved">Ready</span>
                        ) : (
                          <span className="status-badge status-pending">Not Set</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }} onClick={(e) => { e.stopPropagation(); router.push(`/schools/${school.id}`) }}>
                          Manage →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0' }}>
              <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
              <h3>No schools yet</h3>
              <p>Add your first school to get started.</p>
              <Link href="/schools" className="btn btn-primary" style={{ marginTop: 20 }}>Add First School</Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
