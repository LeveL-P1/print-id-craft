"use client"
import { useState, useRef, useEffect } from "react"

type MatchResult = {
  id: string
  serialNumber: string
  photoUrl: string | null
  formData: any
  status: string
  schoolName: string
  className: string
  matched: boolean
} | null

export default function MatcherPage() {
  const [scanInput, setScanInput] = useState("")
  const [result, setResult] = useState<MatchResult>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState("")
  const [history, setHistory] = useState<{ serial: string, name: string, status: string, time: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanInput.trim()) return
    setScanning(true)
    setError("")
    setResult(null)

    try {
      const res = await fetch(`/api/matcher/${encodeURIComponent(scanInput.trim())}`)
      const json = await res.json()
      if (json.success) {
        setResult(json.data)
        setHistory(prev => [{
          serial: json.data.serialNumber,
          name: json.data.formData?.['Student Name'] || json.data.formData?.['Name'] || '-',
          status: json.data.status,
          time: new Date().toLocaleTimeString()
        }, ...prev].slice(0, 20))
      } else {
        setError("No student match found for this ID")
      }
    } catch (err) {
      setError("Scanner connection error")
    } finally {
      setScanning(false)
      setScanInput("")
      inputRef.current?.focus()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#f8fafc', display: 'flex' }}>
      {/* Main Scanner Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{ height: 60, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 12px rgba(34,197,94,0.5)', animation: 'pulse 2s infinite' }} />
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Print Floor Matcher</h1>
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Scanned: {history.length} IDs</span>
        </header>

        {/* Scan Input Bar */}
        <div style={{ padding: '24px 32px 0' }}>
          <form onSubmit={handleScan} style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 14, top: 14 }}>
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                <line x1="7" x2="17" y1="12" y2="12"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                placeholder="Scan barcode or type serial / QR token..."
                style={{ width: '100%', height: 48, paddingLeft: 44, paddingRight: 14, background: '#1a1a2e', border: '1.5px solid #2d2d44', borderRadius: 10, color: 'white', fontSize: 15, outline: 'none' }}
                autoFocus
              />
            </div>
            <button type="submit" style={{ height: 48, padding: '0 24px', background: '#22c55e', color: '#0a0a0f', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {scanning ? 'Scanning...' : 'Match'}
            </button>
          </form>
        </div>

        {/* Result Display */}
        <div style={{ flex: 1, padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '2px solid rgba(239,68,68,0.3)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>NO MATCH</h2>
              <p style={{ color: '#64748b', fontSize: 14 }}>{error}</p>
            </div>
          )}

          {result && (
            <div style={{ width: '100%', maxWidth: 500 }}>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '2px solid rgba(34,197,94,0.3)' }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>MATCH FOUND</h2>
              </div>

              <div style={{ display: 'flex', gap: 20, background: '#12121f', borderRadius: 16, padding: 24, border: '1px solid #2d2d44' }}>
                {result.photoUrl && (
                  <img src={result.photoUrl} alt="Student" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid #22c55e', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{result.formData?.['Student Name'] || result.formData?.['Name'] || 'Unknown'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#64748b' }}>Serial</span>
                      <span style={{ fontFamily: 'monospace', color: '#22c55e' }}>{result.serialNumber}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#64748b' }}>School</span>
                      <span>{result.schoolName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#64748b' }}>Class</span>
                      <span>{result.className}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#64748b' }}>Status</span>
                      <span className={`status-badge ${result.status === 'APPROVED' ? 'status-approved' : 'status-flagged'}`}>{result.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!result && !error && (
            <div style={{ textAlign: 'center', color: '#4a4a6a' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" style={{ marginBottom: 20, opacity: 0.4 }}>
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                <line x1="7" x2="17" y1="12" y2="12"/>
              </svg>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Ready to Scan</h3>
              <p style={{ fontSize: 14 }}>Scan a barcode or type a serial number to match a printed card.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Scan History */}
      <div style={{ width: 320, borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#0f0f1a', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>
          Recent Scans
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {history.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#4a4a6a', fontSize: 13 }}>No scans yet</div>
          )}
          {history.map((h, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 4, background: i === 0 ? 'rgba(34,197,94,0.05)' : 'transparent', border: i === 0 ? '1px solid rgba(34,197,94,0.15)' : '1px solid transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                <span>{h.name}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{h.time}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{h.serial}</span>
                <span className={`status-badge ${h.status === 'APPROVED' ? 'status-approved' : 'status-flagged'}`} style={{ fontSize: 9, padding: '2px 6px' }}>{h.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
