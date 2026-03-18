"use client"
import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"

const BarChart = dynamic(() => import("recharts").then(m => m.BarChart), { ssr: false })
const Bar = dynamic(() => import("recharts").then(m => m.Bar), { ssr: false })
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false })
const PieChart = dynamic(() => import("recharts").then(m => m.PieChart), { ssr: false })
const Pie = dynamic(() => import("recharts").then(m => m.Pie), { ssr: false })
const Cell = dynamic(() => import("recharts").then(m => m.Cell), { ssr: false })

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#94a3b8', SUBMITTED: '#3b82f6', UNDER_REVIEW: '#f59e0b', APPROVED: '#22c55e', FLAGGED: '#ef4444'
}

type AdminStats = {
  totalUsers: number
  totalSchools: number
  totalStudents: number
  totalBatches: number
  manufacturers: number
  teachers: number
  statusBreakdown: { status: string, count: number }[]
  recentStudents: any[]
}

export default function AdminDashboard() {
  const { data: session } = useSession()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(res => { if (res.success) setStats(res.data) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>P</div>
            <span className="sidebar-brand-text">PrintID Pro</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-link sidebar-link-active">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Platform Overview
          </div>
          <div className="sidebar-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Users
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>{session?.user?.email?.charAt(0).toUpperCase() || "A"}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{session?.user?.email || "Admin"}</div>
              <div className="sidebar-user-role">Super Admin</div>
            </div>
            <button className="btn-ghost" onClick={() => signOut({ callbackUrl: '/login' })} style={{ padding: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            </button>
          </div>
        </div>
      </aside>
      <main className="app-content">
        <div className="page-header"><h1>Platform Overview</h1><p>System-wide analytics & monitoring</p></div>
        <div className="page-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
            </div>
          ) : stats ? (
            <>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-card-label">Total Users</div>
                  <div className="stat-card-value">{stats.totalUsers}</div>
                  <div className="stat-card-change positive">{stats.manufacturers} Mfgs · {stats.teachers} Teachers</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Active Schools</div>
                  <div className="stat-card-value">{stats.totalSchools}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Student Records</div>
                  <div className="stat-card-value">{stats.totalStudents}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Print Batches</div>
                  <div className="stat-card-value">{stats.totalBatches}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
                {/* Status Donut */}
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>Submission Status Pipeline</h3>
                  {stats.statusBreakdown.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <ResponsiveContainer width="50%" height={200}>
                        <PieChart>
                          <Pie data={stats.statusBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4}>
                            {stats.statusBreakdown.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.status] || '#94a3b8'} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {stats.statusBreakdown.map(e => (
                          <div key={e.status} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[e.status] || '#94a3b8' }} />
                            <span style={{ color: '#64748b', flex: 1 }}>{e.status}</span>
                            <span style={{ fontWeight: 700 }}>{e.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>No data</div>}
                </div>

                {/* Recent Submissions */}
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>Recent Submissions</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stats.recentStudents.length > 0 ? stats.recentStudents.map((s: any) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: '#f8fafc' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{s.serialNumber}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.classGroup?.school?.name || 'Unknown'}</div>
                        </div>
                        <span className={`status-badge ${s.status === 'APPROVED' ? 'status-approved' : s.status === 'FLAGGED' ? 'status-flagged' : 'status-submitted'}`} style={{ fontSize: 10 }}>
                          {s.status}
                        </span>
                      </div>
                    )) : <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>No submissions yet</div>}
                  </div>
                </div>
              </div>
            </>
          ) : <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Failed to load stats</div>}
        </div>
      </main>
    </div>
  )
}
