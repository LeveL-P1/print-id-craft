"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type School = {
  id: string
  name: string
  primaryColor: string | null
}

export default function TemplatesOverview() {
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch("/api/schools")
      .then(r => r.json())
      .then(res => { if (res.success) setSchools(res.data) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )

  return (
    <>
      <div className="page-header">
        <h1>ID Card Templates</h1>
        <p>Select a school to design its ID card template</p>
      </div>
      <div className="page-body">
        <div className="card-grid">
          {schools.map(school => (
            <div
              key={school.id}
              className="school-card"
              onClick={() => router.push(`/manufacturer/schools/${school.id}/templates`)}
            >
              <div className="school-card-banner" style={{ background: school.primaryColor || '#3b82f6' }} />
              <div className="school-card-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{school.name}</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>Click to open Template Studio</div>
                </div>
              </div>
            </div>
          ))}
          {schools.length === 0 && (
            <div className="empty-state" style={{ background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0', gridColumn: '1/-1' }}>
              <h3>No schools registered</h3>
              <p>Create a school first to design its ID card templates.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
