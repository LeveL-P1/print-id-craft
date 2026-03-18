"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

type VerifyData = {
  serialNumber: string
  photoUrl: string | null
  formData: any
  status: string
  schoolName: string
  className: string
  primaryColor: string | null
  submittedAt: string
}

export default function VerifyPage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<VerifyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/verify/${token}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) setData(res.data)
        else setError("Invalid or expired verification code.")
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false))
  }, [token])

  const pColor = data?.primaryColor || "#3b82f6"

  if (loading) return (
    <div className="login-container" style={{ background: '#f8fafc', justifyContent: 'center' }}>
      <div className="login-spinner" style={{ width: 40, height: 40, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
    </div>
  )

  if (error || !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', flexDirection: 'column', gap: 16 }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>Verification Failed</h1>
      <p style={{ color: '#64748b' }}>{error}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 20, maxWidth: 440, width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
        <div style={{ height: 8, background: pColor }} />
        
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Verified Identity</h1>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>This ID card is authentic and verified</p>
        </div>

        <div style={{ padding: '0 32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {data.photoUrl && (
            <img src={data.photoUrl} alt="Student" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: `4px solid ${pColor}`, marginBottom: 16 }} />
          )}
        </div>

        <div style={{ padding: '0 32px 32px' }}>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>ID Number</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{data.serialNumber}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>School</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{data.schoolName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Class</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{data.className}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Status</span>
              <span className={`status-badge ${data.status === 'APPROVED' ? 'status-approved' : data.status === 'FLAGGED' ? 'status-flagged' : 'status-submitted'}`}>{data.status}</span>
            </div>
            {Object.entries(data.formData || {}).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>{k}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 32px 24px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
          <p style={{ fontSize: 11, color: '#94a3b8' }}>Powered by PrintID Pro • Verified {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  )
}
