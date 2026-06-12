"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import Link from "next/link"

type DashboardData = {
  totalSchools: number
  totalStudents: number
  pendingBatches: number
  studentsThisMonth: number
  recentSchools: any[]
}

type OpsJob = {
  id: string
  type: string
  status: string
  error?: string | null
  createdAt: string
  updatedAt: string
}

export default function ManufacturerDashboard() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [schoolsLoaded, setSchoolsLoaded] = useState(false)
  const [health, setHealth] = useState<{ status: string; db: string; storage: string } | null>(null)
  const [jobs, setJobs] = useState<OpsJob[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // ── Hydrate from sessionStorage cache for instant first paint ──
    try {
      const cached = sessionStorage.getItem("dashboard-data")
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && Date.now() - parsed.t < 60_000) {
          setData(parsed.data)
          setStatsLoaded(true)
          setSchoolsLoaded(true)
        }
      }
    } catch {}

    // ── Fetch stats (fast: only 4 counts) ──
    fetch("/api/dashboard/stats", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { signOut({ callbackUrl: "/login?mode=admin" }); return null }
        if (!res.ok) throw new Error("Dashboard stats failed")
        return res.json()
      })
      .then((json) => {
        if (cancelled || !json?.success) return
        const s = json.stats
        setData((prev) => ({
          totalSchools: s.totalSchools ?? 0,
          totalStudents: s.totalStudents ?? 0,
          pendingBatches: s.totalBatches ?? 0,
          studentsThisMonth: s.totalStudents ?? 0,
          recentSchools: prev?.recentSchools ?? [],
        }))
        setStatsLoaded(true)
      })
      .catch(() => {
        setLoadError("Dashboard data could not be loaded. Please try again in a moment.")
        setStatsLoaded(true)
      })

    // ── Fetch recent schools (slower: includes per-school counts) ──
    fetch("/api/schools?limit=5", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return null
        if (!res.ok) throw new Error("Schools failed")
        return res.json()
      })
      .then((json) => {
        if (cancelled || !json?.success) return
        const schools = json.data || []
        setData((prev) => {
          const next = {
            totalSchools: prev?.totalSchools ?? schools.length,
            totalStudents: prev?.totalStudents ?? 0,
            pendingBatches: prev?.pendingBatches ?? 0,
            studentsThisMonth: prev?.studentsThisMonth ?? 0,
            recentSchools: schools.slice(0, 5),
          }
          try { sessionStorage.setItem("dashboard-data", JSON.stringify({ data: next, t: Date.now() })) } catch {}
          return next
        })
        setSchoolsLoaded(true)
      })
      .catch(() => {
        setLoadError("Dashboard data could not be loaded. Please try again in a moment.")
        setSchoolsLoaded(true)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch("/api/health", { cache: "no-store" }).then((res) => res.json()).catch(() => null),
      fetch("/api/admin/jobs?limit=5", { cache: "no-store" }).then((res) => res.ok ? res.json() : null).catch(() => null),
    ]).then(([healthJson, jobsJson]) => {
      if (cancelled) return
      if (healthJson) setHealth({ status: healthJson.status, db: healthJson.db, storage: healthJson.storage })
      if (jobsJson?.success) setJobs(jobsJson.data || [])
    })

    return () => { cancelled = true }
  }, [])

  // Only show full skeleton if NOTHING has loaded yet
  const loading = !statsLoaded && !schoolsLoaded && !data

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

  if (loadError && !data) {
    return (
      <>
        <div className="page-header dashboard-header">
          <div className="dashboard-header-text">
            <h1>Dashboard</h1>
            <p>Welcome back! Here&apos;s your overview.</p>
          </div>
        </div>
        <div className="page-body">
          <div className="empty-state" style={{ background: "white", borderRadius: 16, border: "2px dashed #fecaca" }}>
            <h3>Data could not be loaded</h3>
            <p>{loadError}</p>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => window.location.reload()}>
              Retry
            </button>
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

  const healthColor = health?.status === "ok" ? "#16a34a" : health?.status === "degraded" ? "#d97706" : "#dc2626"
  const formatTime = (value: string) => {
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? new Date(value).toLocaleString() : "-"
  }

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

        {/* Operations */}
        <div className="dashboard-section">
          <div className="dashboard-section-header">
            <h2>Operations</h2>
            <span className="status-badge" style={{ background: `${healthColor}18`, color: healthColor }}>
              {health?.status || "checking"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 12 }}>Readiness</div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  ["Database", health?.db || "checking"],
                  ["Storage", health?.storage || "checking"],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>{label}</span>
                    <span className="status-badge" style={{ background: value === "connected" ? "#dcfce7" : "#fee2e2", color: value === "connected" ? "#16a34a" : "#dc2626" }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 12 }}>Recent Jobs</div>
              {jobs.length > 0 ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {jobs.map((job) => (
                    <div key={job.id} style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{job.type}</span>
                        <span style={{ fontSize: 11, color: job.status === "FAILED" ? "#dc2626" : job.status === "COMPLETED" ? "#16a34a" : "#2563eb", fontWeight: 700 }}>{job.status}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{formatTime(job.updatedAt || job.createdAt)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#64748b" }}>No jobs recorded yet.</div>
              )}
            </div>
          </div>
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
