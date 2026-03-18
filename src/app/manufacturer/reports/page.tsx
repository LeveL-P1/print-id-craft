"use client"
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
  PENDING: '#94a3b8',
  SUBMITTED: '#3b82f6',
  UNDER_REVIEW: '#f59e0b',
  APPROVED: '#22c55e',
  FLAGGED: '#ef4444'
}

type ReportData = {
  totalSchools: number
  totalStudents: number
  totalBatches: number
  statusBreakdown: { status: string, count: number }[]
  perSchool: { name: string, students: number }[]
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/manufacturer/reports")
      .then(r => r.json())
      .then(res => {
        if (res.success) setData(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )

  if (!data) return <div style={{ padding: 32, color: '#94a3b8' }}>No data available</div>

  return (
    <>
      <div className="page-header">
        <h1>Reports & Analytics</h1>
        <p>Visual overview of your ID card manufacturing pipeline</p>
      </div>
      <div className="page-body">
        {/* Stats Row */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Total Schools</div>
            <div className="stat-card-value">{data.totalSchools}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Registrations</div>
            <div className="stat-card-value">{data.totalStudents}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Batches Created</div>
            <div className="stat-card-value">{data.totalBatches}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
          {/* Bar Chart - Students per School */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Students per School</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Registration volume by institution</p>
            {data.perSchool.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.perSchool}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  <Bar dataKey="students" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>No school data yet</div>
            )}
          </div>

          {/* Donut Chart - Status Breakdown */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Status Breakdown</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Current pipeline distribution</p>
            {data.statusBreakdown.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie data={data.statusBreakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4}>
                      {data.statusBreakdown.map((entry, idx) => (
                        <Cell key={idx} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.statusBreakdown.map((entry) => (
                    <div key={entry.status} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[entry.status] || '#94a3b8' }} />
                      <span style={{ color: '#64748b', flex: 1 }}>{entry.status}</span>
                      <span style={{ fontWeight: 700 }}>{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 14 }}>No submissions yet</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
