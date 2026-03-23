"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"

type School = {
  id: string
  name: string
  contactEmail: string
  logoUrl: string | null
  address: string | null
  _count: { classes: number; students: number; batches: number }
  template: { id: string } | null
  createdAt: string
}

export default function SchoolsPage() {
  const router = useRouter()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newAddress, setNewAddress] = useState("")
  const [newLogo, setNewLogo] = useState<File | null>(null)
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
      let logoUrl = ""
      // Upload logo if provided
      if (newLogo) {
        const { createClient } = await import("@supabase/supabase-js")
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || "",
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
        )
        const ext = newLogo.name.split('.').pop() || 'png'
        const fileName = `logos/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from("student-photos")
          .upload(fileName, newLogo, { contentType: newLogo.type, upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("student-photos").getPublicUrl(fileName)
          logoUrl = urlData.publicUrl
        }
      }

      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          contactEmail: newEmail,
          address: newAddress,
          logoUrl: logoUrl || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("School created successfully!")
        setShowAdd(false)
        setNewName("")
        setNewEmail("")
        setNewAddress("")
        setNewLogo(null)
        fetchSchools()
      } else {
        toast.error(data.error?.message || "Failed to create school")
      }
    } catch (err) {
      toast.error("Network error")
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    const confirmed = prompt(`Type "DELETE" to confirm deleting "${name}" and all its data:`)
    if (confirmed !== "DELETE") return
    try {
      const res = await fetch(`/api/schools/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        toast.success("School deleted")
        fetchSchools()
      }
    } catch (err) {
      toast.error("Failed to delete school")
    }
  }

  if (loading) {
    return (
      <>
        <div className="page-header"><h1>Schools</h1><p>Manage your registered educational institutions</p></div>
        <div className="page-body">
          <div className="stat-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="stat-card">
                <div style={{ height: 14, width: 100, background: '#f1f5f9', borderRadius: 6, marginBottom: 12 }} />
                <div style={{ height: 32, width: 60, background: '#f1f5f9', borderRadius: 6 }} />
              </div>
            ))}
          </div>
          <div className="card-grid">
            {[1, 2, 3].map(i => (
              <div key={i} className="school-card" style={{ pointerEvents: 'none' }}>
                <div className="school-card-banner" style={{ background: '#f1f5f9' }} />
                <div className="school-card-body">
                  <div style={{ height: 20, width: 150, background: '#f1f5f9', borderRadius: 6, marginBottom: 8 }} />
                  <div style={{ height: 14, width: 100, background: '#f1f5f9', borderRadius: 6 }} />
                </div>
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
          <h1>Schools</h1>
          <p>Manage your registered educational institutions</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          Add School
        </button>
      </div>

      <div className="page-body">
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Total Schools</div>
            <div className="stat-card-value">{schools.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Students</div>
            <div className="stat-card-value">{schools.reduce((a, s) => a + (s._count?.students || 0), 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Classes</div>
            <div className="stat-card-value">{schools.reduce((a, s) => a + (s._count?.classes || 0), 0)}</div>
          </div>
        </div>

        {schools.length === 0 ? (
          <div className="empty-state" style={{ background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0' }}>
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
            <h3>No schools registered</h3>
            <p>Start by adding your first client institution.</p>
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowAdd(true)}>Add First School</button>
          </div>
        ) : (
          <div className="card-grid">
            {schools.map((school) => (
              <div key={school.id} className="school-card" onClick={() => router.push(`/schools/${school.id}`)}>
                <div className="school-card-banner" style={{ background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)' }} />
                <div className="school-card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                      {school.name.charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="school-card-name">{school.name}</div>
                      <div className="school-card-address">{school.address || school.contactEmail}</div>
                    </div>
                  </div>
                  <div className="school-card-stats">
                    <span className="school-card-stat"><strong>{school._count?.students || 0}</strong> students</span>
                    <span className="school-card-stat"><strong>{school._count?.classes || 0}</strong> classes</span>
                    {school.template && <span className="status-badge status-approved" style={{ fontSize: 11 }}>Template Ready</span>}
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px', flex: 1 }} onClick={(e) => { e.stopPropagation(); router.push(`/schools/${school.id}`) }}>Manage</button>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '6px 10px' }} onClick={(e) => { e.stopPropagation(); handleDelete(school.id, school.name) }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
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
                <label>School Name *</label>
                <input required placeholder="e.g. St. John's High School" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Contact Email *</label>
                <input type="email" required placeholder="e.g. admin@school.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input placeholder="e.g. 123 School Street, City" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
              </div>
              <div className="form-group">
                <label>School Logo (optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {newLogo ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img src={URL.createObjectURL(newLogo)} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }} />
                      <span style={{ fontSize: 12, color: '#64748b' }}>{newLogo.name}</span>
                      <button type="button" onClick={() => setNewLogo(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', border: '1.5px dashed #e2e8f0', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                      🏫 Upload Logo
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setNewLogo(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                    </label>
                  )}
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
