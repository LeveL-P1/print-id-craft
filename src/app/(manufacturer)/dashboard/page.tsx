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
        // Bust browser and Next.js client router cache entirely
        const res = await fetch(`/api/schools?limit=5&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        })
        const json = await res.json()
        if (json.success) {
          const schools = json.data
          // Use DB-aggregated stats from API (no client-side counting)
          const s = json.stats || {}
          setData({
            totalSchools: s.totalSchools || schools.length,
            totalStudents: s.totalStudents || 0,
            pendingBatches: s.totalBatches || 0,
            studentsThisMonth: s.totalStudents || 0,
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
              <div key={i} className="stat-card skeleton-card">
                <div className="skeleton-line" style={{ width: 100, height: 14, marginBottom: 12 }} />
                <div className="skeleton-line" style={{ width: 60, height: 32 }} />
              </div>
            ))}
          </div>
        </div>
      </>
    )
  }

  const statCards = [
    {
      label: "Total Schools",
      value: data?.totalSchools || 0,
      change: "Active",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
        </svg>
      ),
      color: "#3b82f6",
      bgColor: "#eff6ff",
    },
    {
      label: "Total Students",
      value: data?.totalStudents || 0,
      change: "All submissions",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      color: "#8b5cf6",
      bgColor: "#f3e8ff",
    },
    {
      label: "Print Batches",
      value: data?.pendingBatches || 0,
      change: "Total batches",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>
        </svg>
      ),
      color: "#f59e0b",
      bgColor: "#fefce8",
    },
    {
      label: "This Month",
      value: data?.studentsThisMonth || 0,
      change: "Students",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      ),
      color: "#22c55e",
      bgColor: "#f0fdf4",
    },
  ]

  return (
    <>
      <div className="page-header dashboard-header">
        <div className="dashboard-header-text">
          <h1>Dashboard</h1>
          <p>Welcome back! Here&apos;s your overview.</p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/schools" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
            <span className="btn-label">Add School</span>
          </Link>
          <Link href="/schools" className="btn btn-outline hide-on-small-mobile">
            View All Schools
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Stats Row */}
        <div className="stat-grid">
          {statCards.map((card, index) => (
            <div
              key={card.label}
              className="stat-card stat-card-animated"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="stat-card-header">
                <div className="stat-card-label">{card.label}</div>
                <div className="stat-card-icon" style={{ backgroundColor: card.bgColor, color: card.color }}>
                  {card.icon}
                </div>
              </div>
              <div className="stat-card-value">{card.value.toLocaleString()}</div>
              <div className="stat-card-change positive">
                <span className="stat-card-change-dot" style={{ backgroundColor: card.color }} />
                {card.change}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Schools */}
        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <h2>Recent Schools</h2>
            <Link href="/schools" className="dashboard-view-all">View All →</Link>
          </div>

          {data?.recentSchools && data.recentSchools.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="data-table-wrapper hide-on-mobile">
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
                          <div className="school-row-info">
                            <div className="school-row-avatar" style={{ background: `linear-gradient(135deg, ${['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'][Math.abs(school.name.charCodeAt(0)) % 5]}, ${['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626'][Math.abs(school.name.charCodeAt(0)) % 5]})`, color: 'white' }}>
                              {school.name.charAt(0)}
                            </div>
                            <div>
                              <div className="school-row-name">{school.name}</div>
                              <div className="school-row-email">{school.contactEmail}</div>
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

              {/* Mobile Card View */}
              <div className="mobile-school-cards show-on-mobile">
                {data.recentSchools.map((school: any) => (
                  <div
                    key={school.id}
                    className="mobile-school-card"
                    onClick={() => router.push(`/schools/${school.id}`)}
                  >
                    <div className="mobile-school-card-top">
                      <div className="school-row-avatar" style={{ background: `linear-gradient(135deg, ${['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'][Math.abs(school.name.charCodeAt(0)) % 5]}, ${['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626'][Math.abs(school.name.charCodeAt(0)) % 5]})`, color: 'white' }}>
                        {school.name.charAt(0)}
                      </div>
                      <div className="mobile-school-card-info">
                        <div className="school-row-name">{school.name}</div>
                        <div className="school-row-email">{school.contactEmail}</div>
                      </div>
                    </div>
                    <div className="mobile-school-card-stats">
                      <div className="mobile-school-stat">
                        <span className="mobile-school-stat-value">{school._count?.students || 0}</span>
                        <span className="mobile-school-stat-label">Students</span>
                      </div>
                      <div className="mobile-school-stat">
                        <span className="mobile-school-stat-value">{school._count?.classes || 0}</span>
                        <span className="mobile-school-stat-label">Classes</span>
                      </div>
                      <div className="mobile-school-stat">
                        {school.template ? (
                          <span className="status-badge status-approved" style={{ fontSize: 11 }}>Ready</span>
                        ) : (
                          <span className="status-badge status-pending" style={{ fontSize: 11 }}>Not Set</span>
                        )}
                        <span className="mobile-school-stat-label">Template</span>
                      </div>
                    </div>
                    <div className="mobile-school-card-action">
                      <button className="btn btn-outline btn-sm-full" onClick={(e) => { e.stopPropagation(); router.push(`/schools/${school.id}`) }}>
                        Manage School →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
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
