"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type School = {
  id: string
  name: string
  logo: string | null
  address: string | null
  primaryColor: string | null
  status: string
  _count: {
    classes: number
  }
}

export default function ManufacturerSchools() {
  const router = useRouter()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newAddress, setNewAddress] = useState("")
  const [newColor, setNewColor] = useState("#3b82f6")
  const [creating, setCreating] = useState(false)

  const fetchSchools = async () => {
    try {
      const res = await fetch("/api/schools")
      const data = await res.json()
      if (data.success) setSchools(data.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSchools() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, address: newAddress, primaryColor: newColor })
      })
      const data = await res.json()
      if (data.success) {
        setShowAdd(false)
        setNewName("")
        setNewAddress("")
        fetchSchools()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
      </div>
    )
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Schools</h1>
          <p>Manage your registered educational institutions</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Add School
        </button>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Total Schools</div>
            <div className="stat-card-value">{schools.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Classes</div>
            <div className="stat-card-value">{schools.reduce((a, s) => a + (s._count?.classes || 0), 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Active</div>
            <div className="stat-card-value">{schools.filter(s => s.status === "ACTIVE").length}</div>
          </div>
        </div>

        {schools.length === 0 ? (
          <div className="empty-state" style={{ background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0' }}>
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
            <h3>No schools registered</h3>
            <p>Start by adding your first client institution.</p>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowAdd(true)}>Add First School</button>
          </div>
        ) : (
          <div className="card-grid">
            {schools.map((school) => (
              <div key={school.id} className="school-card" onClick={() => router.push(`/manufacturer/schools/${school.id}`)}>
                <div className="school-card-banner" style={{ background: school.primaryColor || '#3b82f6' }} />
                <div className="school-card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
                    </div>
                    <div>
                      <div className="school-card-name">{school.name}</div>
                      <div className="school-card-address">{school.address || "No address provided"}</div>
                    </div>
                  </div>
                  <div className="school-card-stats">
                    <span className="school-card-stat"><strong>{school._count?.classes || 0}</strong> classes</span>
                    <span className="status-badge status-approved" style={{ fontSize: 11 }}>Active</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add School Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 460, padding: 32 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Add New School</h2>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>Register a new institution to your portfolio.</p>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label>School Name</label>
                <input required placeholder="e.g. Springfield High" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input placeholder="e.g. 123 Main St" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Brand Color</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 44, height: 44, borderRadius: 8, border: '2px solid #e2e8f0', cursor: 'pointer', padding: 2 }} />
                  <input value={newColor} onChange={e => setNewColor(e.target.value)} style={{ flex: 1 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating}>
                  {creating ? 'Creating...' : 'Create School'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
