"use client"
import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"

type VerifyResult = {
  found: boolean
  student?: {
    id: string
    serialNumber: string
    formData: any
    photoUrl: string
    status: string
    class: { name: string }
  }
}

export default function VerifyPage() {
  const params = useParams()
  const schoolId = params.id as string
  const [mode, setMode] = useState<"manual" | "scan">("manual")
  const [serialInput, setSerialInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [schoolName, setSchoolName] = useState("")

  useEffect(() => {
    fetch(`/api/schools/${schoolId}`)
      .then(r => r.json())
      .then(d => { if (d.success) setSchoolName(d.data.name) })
      .catch(() => {})
  }, [schoolId])

  const handleVerify = async (serial?: string) => {
    const query = serial || serialInput.trim()
    if (!query) return
    setLoading(true)
    setResult(null)
    try {
      // Search by serial number
      const res = await fetch(`/api/schools/${schoolId}/students?search=${encodeURIComponent(query)}&limit=1`)
      const data = await res.json()
      if (data.success && data.data.length > 0) {
        setResult({ found: true, student: data.data[0] })
        toast.success("Student found!")
      } else {
        setResult({ found: false })
        toast.error("No student found with this serial number")
      }
    } catch (err) {
      toast.error("Verification failed")
    } finally {
      setLoading(false)
    }
  }

  const handleQRInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // QR scanner devices typically auto-submit by pressing Enter
    setSerialInput(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      // Try to parse QR data (could be JSON or plain serial)
      let serial = serialInput.trim()
      try {
        const parsed = JSON.parse(serial)
        if (parsed.serial) serial = parsed.serial
      } catch {}
      handleVerify(serial)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, fontWeight: 700, color: 'white' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="8" height="8" rx="1" /><rect x="14" y="2" width="8" height="8" rx="1" /><rect x="2" y="14" width="8" height="8" rx="1" /><rect x="14" y="14" width="4" height="4" rx="0.5" /><rect x="20" y="14" width="2" height="2" rx="0.25" /><rect x="14" y="20" width="2" height="2" rx="0.25" /><rect x="18" y="18" width="4" height="4" rx="0.5" /></svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>ID Card Verification</h1>
        <p style={{ fontSize: 14, color: '#64748b' }}>{schoolName || "Verify student ID cards"}</p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 24 }}>
        <button
          onClick={() => setMode("manual")}
          style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === "manual" ? 'white' : 'transparent', color: mode === "manual" ? '#0f172a' : '#64748b', boxShadow: mode === "manual" ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          🔢 Manual Entry
        </button>
        <button
          onClick={() => setMode("scan")}
          style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: mode === "scan" ? 'white' : 'transparent', color: mode === "scan" ? '#0f172a' : '#64748b', boxShadow: mode === "scan" ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
        >
          📱 QR Scanner
        </button>
      </div>

      {/* Input Area */}
      <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', marginBottom: 24 }}>
        {mode === "manual" ? (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>Serial Number</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={serialInput}
                onChange={e => setSerialInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. STJOHN-0001"
                style={{ flex: 1, height: 44, padding: '0 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 15, fontFamily: 'monospace', letterSpacing: 1 }}
                autoFocus
              />
              <button className="btn btn-primary" onClick={() => handleVerify()} disabled={loading} style={{ padding: '10px 24px' }}>
                {loading ? "..." : "Verify"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Point QR Scanner at Card</p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Use a USB/Bluetooth barcode scanner. The input field below will auto-capture.</p>
            <input
              value={serialInput}
              onChange={handleQRInput}
              onKeyDown={handleKeyDown}
              placeholder="Waiting for QR scan..."
              style={{ width: '100%', height: 48, padding: '0 16px', border: '2px solid #3b82f6', borderRadius: 12, fontSize: 16, fontFamily: 'monospace', textAlign: 'center', background: '#eff6ff' }}
              autoFocus
            />
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Scanner will auto-verify on scan</p>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div style={{ background: 'white', borderRadius: 16, border: `2px solid ${result.found ? '#22c55e' : '#ef4444'}`, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', background: result.found ? '#f0fdf4' : '#fef2f2', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: result.found ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {result.found ? "✓" : "✗"}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: result.found ? '#16a34a' : '#dc2626' }}>
                {result.found ? "VERIFIED — Student Found" : "NOT FOUND"}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {result.found ? `Serial: ${result.student?.serialNumber}` : "No student matches this serial number"}
              </div>
            </div>
          </div>

          {result.found && result.student && (
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20 }}>
                {/* Photo */}
                <div style={{ width: 80, height: 105, borderRadius: 10, overflow: 'hidden', border: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  {result.student.photoUrl ? (
                    <img src={result.student.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                  {Object.entries(result.student.formData as Record<string, string>).slice(0, 8).map(([key, value]) => (
                    <div key={key}>
                      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{String(value) || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div style={{ marginTop: 16, padding: '10px 16px', background: '#f8fafc', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>Print Status</span>
                <span className={`status-badge ${
                  result.student.status === 'PRINTED' ? 'status-approved' :
                  result.student.status === 'APPROVED' ? 'status-submitted' :
                  result.student.status === 'FLAGGED' ? 'status-flagged' :
                  'status-pending'
                }`}>{result.student.status}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scan Another */}
      {result && (
        <button
          className="btn btn-outline"
          onClick={() => { setResult(null); setSerialInput("") }}
          style={{ width: '100%', marginTop: 16, padding: '12px' }}
        >
          Verify Another Card
        </button>
      )}
    </div>
  )
}
