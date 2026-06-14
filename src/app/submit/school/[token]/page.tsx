"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"

type SchoolFormConfig = {
  schoolName: string
  schoolLogo: string | null
  classes: { id: string; name: string }[]
}

/**
 * School-wide registration entry point. Parents open a single URL
 * (`/submit/school/<schoolToken>`), pick their child's class from a
 * dropdown, and the page hands off to the existing per-class submit
 * flow. This replaces the old "share one link per class" workflow
 * without rewriting the form itself.
 */
export default function SchoolSubmitPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [step, setStep] = useState<"loading" | "error" | "pick">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [config, setConfig] = useState<SchoolFormConfig | null>(null)
  const [selectedClassId, setSelectedClassId] = useState("")
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/submit/school/${token}`)
        const json = await res.json()
        if (!res.ok || !json.success) {
          setErrorMsg(json.error || "This registration link is not available.")
          setStep("error")
          return
        }
        setConfig(json.data)
        setStep("pick")
      } catch (e: any) {
        setErrorMsg("Could not load the registration form. Please check your internet connection.")
        setStep("error")
      }
    }
    load()
  }, [token])

  const handleContinue = async () => {
    if (!selectedClassId) return
    setRedirecting(true)
    // Resolve class → its linkToken via existing per-class API. We fetch
    // the class's token through a small helper endpoint already in place
    // on the school: each class's tokens are owned by the school, so we
    // can include them directly in the GET response. To keep the public
    // surface small, we hand the classId to a redirect helper that maps
    // it to a per-class token server-side.
    try {
      const res = await fetch(`/api/submit/school/${token}/resolve?classId=${encodeURIComponent(selectedClassId)}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        setErrorMsg(json.error || "Could not open the form for the selected class.")
        setStep("error")
        return
      }
      router.replace(`/submit/${json.data.classToken}`)
    } catch (e: any) {
      setErrorMsg("Network error while opening the form.")
      setStep("error")
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      background: "linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 460,
        background: "white",
        borderRadius: 16,
        padding: 28,
        boxShadow: "0 12px 40px rgba(15,23,42,0.08)",
      }}>
        {step === "loading" && (
          <div style={{ textAlign: "center", padding: "30px 10px" }}>
            <div className="login-spinner" style={{
              width: 36, height: 36, borderWidth: 3,
              borderColor: "rgba(59,130,246,0.2)", borderTopColor: "#3b82f6",
              margin: "0 auto 14px",
            }} />
            <div style={{ color: "#475569", fontSize: 14 }}>Loading registration form…</div>
          </div>
        )}

        {step === "error" && (
          <div>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
              Registration link unavailable
            </h1>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{errorMsg}</p>
          </div>
        )}

        {step === "pick" && config && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {config.schoolLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.schoolLogo}
                  alt="School logo"
                  style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, background: "#f8fafc", padding: 4 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                  School Registration
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>
                  {config.schoolName}
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "#475569", marginBottom: 18, lineHeight: 1.55 }}>
              Welcome! Please select your child&apos;s section to begin the ID card
              registration form. You will choose class and division on the next screen.
            </p>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
              Select Section <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{
                width: "100%",
                padding: "11px 12px",
                fontSize: 14,
                border: "1.5px solid #cbd5e1",
                borderRadius: 10,
                background: "white",
                color: "#0f172a",
                outline: "none",
                marginBottom: 16,
              }}
            >
              <option value="">— Choose a section —</option>
              {config.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {config.classes.length === 0 && (
              <div style={{
                padding: "10px 12px",
                background: "#fef3c7",
                border: "1px solid #fde68a",
                borderRadius: 10,
                fontSize: 12,
                color: "#92400e",
                marginBottom: 16,
                lineHeight: 1.5,
              }}>
                No classes are open for registration right now. Please contact your school.
              </div>
            )}

            <button
              onClick={handleContinue}
              disabled={!selectedClassId || redirecting}
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 700,
                background: !selectedClassId || redirecting
                  ? "#cbd5e1"
                  : "linear-gradient(135deg, #3b82f6, #6366f1)",
                color: "white",
                border: "none",
                borderRadius: 10,
                cursor: !selectedClassId || redirecting ? "not-allowed" : "pointer",
                transition: "transform 0.1s",
              }}
            >
              {redirecting ? "Opening form…" : "Continue →"}
            </button>

            <div style={{
              marginTop: 16,
              fontSize: 11,
              color: "#94a3b8",
              textAlign: "center",
              lineHeight: 1.6,
            }}>
              You&apos;ll be asked for your child&apos;s details and a passport-style
              photo on the next screen.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
