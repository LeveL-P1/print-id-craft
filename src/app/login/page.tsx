"use client"

import { useState, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isAdminMode = searchParams.get("mode") === "admin"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const role = isAdminMode ? "MANUFACTURER" : "TEACHER"

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (res?.error) {
        toast.error("Invalid email or password")
        setLoading(false)
        return
      }

      toast.success("Login successful! Redirecting...")
      if (isAdminMode) {
        router.push("/dashboard")
      } else {
        router.push("/teacher/dashboard")
      }
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error("An unexpected error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="login-container fade-in">
      {/* Left Panel */}
      <div className="login-left" style={{ animationDelay: '0.1s' }}>
        <div className="login-left-content">
          <div className="login-logo">
            <div className="login-logo-icon">P</div>
            <span className="login-logo-text">Print ID Craft</span>
          </div>

          <div className="login-illustration">
            <div className="id-card-mock">
              <div className="id-card-mock-inner">
                <div className="id-card-header-bar" />
                <div className="id-card-avatar">
                  <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="16" r="8" fill="#94a3b8"/>
                    <ellipse cx="20" cy="34" rx="14" ry="10" fill="#94a3b8"/>
                  </svg>
                </div>
                <div className="id-card-lines">
                  <div className="id-card-line long" />
                  <div className="id-card-line short" />
                  <div className="id-card-line medium" />
                </div>
                <div className="id-card-qr">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                    <rect x="2" y="2" width="8" height="8" rx="1" />
                    <rect x="14" y="2" width="8" height="8" rx="1" />
                    <rect x="2" y="14" width="8" height="8" rx="1" />
                    <rect x="14" y="14" width="4" height="4" rx="0.5" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="floating-dot dot-1" />
            <div className="floating-dot dot-2" />
            <div className="floating-dot dot-3" />
          </div>

          <p className="login-tagline">
            {isAdminMode ? (
              <>Manufacturer Portal<br /><span>Print • Manage • Deliver</span></>
            ) : (
              <>School ID Card Management Portal<br /><span>Secure • Simple • Smart</span></>
            )}
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="login-right">
        <div className="login-form-wrapper">
          {isAdminMode ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>
                </div>
                <h1 className="login-heading" style={{ marginBottom: 0 }}>Manufacturer Login</h1>
              </div>
              <p className="login-subheading">Manage schools, templates & printing</p>
            </>
          ) : (
            <>
              <h1 className="login-heading">Welcome back</h1>
              <p className="login-subheading">Sign in to manage your school's ID cards</p>
            </>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                placeholder={isAdminMode ? "admin@printidcraft.com" : "teacher@school.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? (
                <span className="login-spinner" />
              ) : (
                <>
                  Sign In
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </>
              )}
            </button>
          </form>

          {/* Photo Guidelines for teachers */}
          {!isAdminMode && (
            <div style={{ 
              marginTop: 20, padding: '14px 16px', 
              background: '#f0fdf4', borderRadius: 10, 
              border: '1px solid #bbf7d0' 
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 4 }}>📸 Photo Guidelines for Students</div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#16a34a', lineHeight: 1.7 }}>
                <li>Minimum 300 pixels width</li>
                <li>Plain/solid background only</li>
                <li>Passport-size format (3:4 ratio)</li>
                <li>Front-facing photo required</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
