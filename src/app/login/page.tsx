"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type RoleOption = "MANUFACTURER" | "TEACHER"

const roles = [
  {
    id: "MANUFACTURER" as RoleOption,
    label: "Manufacturer Admin",
    description: "Manage schools, templates & print batches",
    color: "#3b82f6",
    bgColor: "#eff6ff",
  },
  {
    id: "TEACHER" as RoleOption,
    label: "School Teacher",
    description: "Track student submissions & approvals",
    color: "#22c55e",
    bgColor: "#f0fdf4",
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<RoleOption>("MANUFACTURER")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

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
      if (selectedRole === "MANUFACTURER") {
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
    <div className="login-container">
      {/* Left Panel - Dark Branding */}
      <div className="login-left">
        <div className="login-left-content">
          <div className="login-logo">
            <div className="login-logo-icon">P</div>
            <span className="login-logo-text">Print ID Craft</span>
          </div>

          {/* ID Card Illustration */}
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
                    <rect x="20" y="14" width="2" height="2" rx="0.25" />
                    <rect x="14" y="20" width="2" height="2" rx="0.25" />
                    <rect x="18" y="18" width="4" height="4" rx="0.5" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="floating-dot dot-1" />
            <div className="floating-dot dot-2" />
            <div className="floating-dot dot-3" />
          </div>

          <p className="login-tagline">
            Multi-School ID Card Management & Print Portal<br />
            <span>for manufacturers</span>
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="login-right">
        <div className="login-form-wrapper">
          <h1 className="login-heading">Welcome back</h1>
          <p className="login-subheading">Select your role and sign in to continue</p>

          {/* Role Cards */}
          <div className="role-list">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`role-card ${selectedRole === role.id ? "role-card-active" : ""}`}
                onClick={() => setSelectedRole(role.id)}
              >
                <div className="role-card-left">
                  <div className="role-icon" style={{ backgroundColor: role.bgColor, color: role.color }}>
                    {role.id === "MANUFACTURER" && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/></svg>
                    )}
                    {role.id === "TEACHER" && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 6 3 6 3s3 0 6-3v-5"/></svg>
                    )}
                  </div>
                  <div>
                    <div className="role-label">{role.label}</div>
                    <div className="role-desc">{role.description}</div>
                  </div>
                </div>
                <div className={`role-radio ${selectedRole === role.id ? "role-radio-active" : ""}`}>
                  {selectedRole === role.id && <div className="role-radio-dot" />}
                </div>
              </button>
            ))}
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="login-form">
            {error && <div className="login-error" role="alert">{error}</div>}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                placeholder="admin@printidcraft.com"
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

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              Demo: admin@printidcraft.com / Admin@123
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
