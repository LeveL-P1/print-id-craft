"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
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

type GlobalStats = {
  totalSchools: number
  totalStudents: number
  totalClasses: number
  totalBatches: number
}

export default function SchoolsPage() {
  const router = useRouter()
  const [schools, setSchools] = useState<School[]>([])
  const [stats, setStats] = useState<GlobalStats>({ totalSchools: 0, totalStudents: 0, totalClasses: 0, totalBatches: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Add school modal state
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newAddress, setNewAddress] = useState("")
  const [newLogo, setNewLogo] = useState<File | null>(null)
  const [newLogoPreviewUrl, setNewLogoPreviewUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [classNames, setClassNames] = useState<string[]>([])
  const [newClassInput, setNewClassInput] = useState("")

  const fetchSchools = useCallback(async (p = page, search = searchQuery, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const params = new URLSearchParams({ page: String(p), limit: "50" })
        if (search) params.set("search", search)
        const res = await fetch(`/api/schools?${params}&_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        })
        const data = await res.json()
        if (data.success) {
          setSchools(data.data)
          if (data.stats) setStats(data.stats)
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages)
          }
          setLoading(false)
          return
        }
        // Not successful — retry
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 800))
          continue
        }
      } catch (err) {
        console.error(`Schools fetch attempt ${attempt}/${retries} failed:`, err)
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 800))
          continue
        }
      }
    }
    setLoading(false)
  }, [page, searchQuery])

  useEffect(() => { fetchSchools() }, [fetchSchools])

  useEffect(() => {
    if (!newLogo) {
      setNewLogoPreviewUrl("")
      return
    }

    const previewUrl = URL.createObjectURL(newLogo)
    setNewLogoPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [newLogo])

  // Cleanup
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [])

  const handleSearch = (value: string) => {
    setSearchInput(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value)
      setPage(1)
    }, 400)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      let logoUrl = ""
      if (newLogo) {
        try {
          const fd = new FormData()
          fd.append("file", newLogo)
          fd.append("folder", "logos")
          const uploadRes = await fetch("/api/upload", { method: "POST", body: fd })
          const uploadData = await uploadRes.json()
          if (uploadRes.ok && uploadData.success) logoUrl = uploadData.url
        } catch (uploadErr) {
          console.error("Logo upload failed:", uploadErr)
        }
      }

      // Single API call creates school + template + all classes atomically
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          contactEmail: newEmail,
          address: newAddress,
          logoUrl: logoUrl || undefined,
          classNames: classNames.length > 0 ? classNames : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success("School created! Now upload the ID card template.")
        setShowAdd(false)
        setNewName(""); setNewEmail(""); setNewAddress("")
        setNewLogo(null); setClassNames([]); setNewClassInput("")
        router.push(`/schools/${data.data.id}`)
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
              <div key={i} className="stat-card skeleton-card">
                <div className="skeleton-line" style={{ width: 100, height: 14, marginBottom: 12 }} />
                <div className="skeleton-line" style={{ width: 60, height: 32 }} />
              </div>
            ))}
          </div>
          <div className="card-grid" style={{ marginTop: 24 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="school-card" style={{ pointerEvents: 'none' }}>
                <div className="school-card-banner" style={{ background: '#f1f5f9' }} />
                <div className="school-card-body">
                  <div className="skeleton-line" style={{ height: 20, width: 150, marginBottom: 8 }} />
                  <div className="skeleton-line" style={{ height: 14, width: 100 }} />
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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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
        {/* Stats from DB aggregation — no client-side reduce */}
        <div className="stat-grid">
          <div className="stat-card stat-card-animated">
            <div className="stat-card-label">Total Schools</div>
            <div className="stat-card-value">{stats.totalSchools.toLocaleString()}</div>
          </div>
          <div className="stat-card stat-card-animated" style={{ animationDelay: '80ms' }}>
            <div className="stat-card-label">Total Students</div>
            <div className="stat-card-value">{stats.totalStudents.toLocaleString()}</div>
          </div>
          <div className="stat-card stat-card-animated" style={{ animationDelay: '160ms' }}>
            <div className="stat-card-label">Total Classes</div>
            <div className="stat-card-value">{stats.totalClasses.toLocaleString()}</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ margin: '20px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            placeholder="Search schools by name, email, or address..."
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
            style={{ height: 42, padding: '0 16px', border: '1.5px solid #e2e8f0', borderRadius: 12, fontSize: 14, flex: 1, maxWidth: 400 }}
          />
          {searchQuery && (
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1) }}>
              Clear
            </button>
          )}
          <span style={{ fontSize: 13, color: '#64748b' }}>{schools.length} of {stats.totalSchools} schools</span>
        </div>

        {schools.length === 0 ? (
          <div className="empty-state" style={{ background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0' }}>
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
            <h3>{searchQuery ? "No schools match your search" : "No schools registered"}</h3>
            <p>{searchQuery ? "Try a different search term." : "Start by adding your first client institution."}</p>
            {!searchQuery && <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => setShowAdd(true)}>Add First School</button>}
          </div>
        ) : (
          <>
            <div className="card-grid">
              {schools.map((school) => (
                <div key={school.id} className="school-card" onClick={() => router.push(`/schools/${school.id}`)}>
                  <div className="school-card-banner" style={{ background: `linear-gradient(135deg, ${['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'][Math.abs(school.name.charCodeAt(0)) % 5]}, ${['#1d4ed8', '#6d28d9', '#15803d', '#b45309', '#b91c1c'][Math.abs(school.name.charCodeAt(0)) % 5]})` }} />
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24, alignItems: 'center' }}>
                <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontSize: 13, padding: '8px 16px' }}>← Previous</button>
                <span style={{ fontSize: 13, color: '#64748b', padding: '0 12px' }}>Page {page} of {totalPages}</span>
                <button className="btn btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ fontSize: 13, padding: '8px 16px' }}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add School Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={() => setShowAdd(false)}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 460, padding: 32, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
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
                      {newLogoPreviewUrl && <img src={newLogoPreviewUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0' }} />}
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
              <div className="form-group">
                <label>Classes (you can add more later)</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input
                    placeholder="e.g. 1st A, 2nd B, 3rd..."
                    value={newClassInput}
                    onChange={e => setNewClassInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const name = newClassInput.trim()
                        if (name && !classNames.includes(name)) {
                          setClassNames(prev => [...prev, name])
                          setNewClassInput('')
                        }
                      }
                    }}
                  />
                  <button type="button" onClick={() => { const name = newClassInput.trim(); if (name && !classNames.includes(name)) { setClassNames(prev => [...prev, name]); setNewClassInput('') } }} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
                </div>
                {classNames.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {classNames.map((cn, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
                        {cn}
                        <button type="button" onClick={() => setClassNames(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
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
