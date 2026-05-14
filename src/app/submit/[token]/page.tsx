"use client"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import SharedIDCardPreview from "@/components/IDCardPreview"
import dynamic from "next/dynamic"
import PhotoVerifier from "@/components/PhotoVerifier"

const JpgCardPreview = dynamic(() => import("@/components/JpgCardPreview"), { ssr: false })
const PhotoBgProcessor = dynamic(() => import("@/components/PhotoBgProcessor"), { ssr: false })

type FieldConfig = { key: string; label: string; type: string; required: boolean }
type TemplateElement = { 
  id: string; type: string; x: number; y: number; width: number; height: number; 
  content: string; fontSize?: number; fill?: string; align?: string; bold?: boolean 
}

type FormConfig = {
  schoolName: string
  schoolLogo: string | null
  className: string
  schoolId: string
  classId: string
  fieldConfig: FieldConfig[]
  frontLayout: TemplateElement[]
  backLayout: TemplateElement[]
  cardWidthMm: number
  cardHeightMm: number
  orientation: "PORTRAIT" | "LANDSCAPE"
  // JPG template fields
  templateImageUrl: string | null
  fieldMappings: any[]
  // Photo background color
  photoBgColor: string
}

// Helper components moved outside to keep SubmitPage clean
const IDCardPreview = ({ 
  layout, 
  widthMm, 
  heightMm, 
  formData, 
  config, 
  croppedPhoto 
}: { 
  layout: TemplateElement[], 
  widthMm: number, 
  heightMm: number,
  formData: Record<string, string>,
  config: FormConfig | null,
  croppedPhoto: string
}) => {
  const SCALE = 3.8 // px per mm for preview
  const w = widthMm * SCALE
  const h = heightMm * SCALE

  const resolveTemplateText = (text: string) => {
    let resolved = text
    Object.entries(formData).forEach(([key, value]) => {
      resolved = resolved.replace(new RegExp(`{{${key}}}`, 'g'), value || "")
    })
    resolved = resolved.replace(/{{class}}/g, config?.className || "")
    resolved = resolved.replace(/{{serialNumber}}/g, "Pending...")
    return resolved
  }

  return (
    <div style={{ position: 'relative', width: w, height: h, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', margin: '0 auto' }}>
      {layout.map(el => (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: el.x, top: el.y,
            width: el.width, height: el.height,
            display: 'flex', alignItems: 'center', justifyContent: el.align === 'left' ? 'flex-start' : el.align === 'right' ? 'flex-end' : 'center',
            padding: 2,
            fontSize: el.fontSize || 14,
            color: el.fill || '#000',
            fontWeight: el.bold ? 'bold' : 'normal',
            background: el.type === 'photo' ? '#f1f5f9' : 'transparent',
            userSelect: 'none',
            overflow: 'hidden',
          }}
        >
          {el.type === 'photo' ? (
            <img src={croppedPhoto || "https://via.placeholder.com/150?text=Photo"} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : el.type === 'logo' ? (
            <img src={config?.schoolLogo || "https://via.placeholder.com/150?text=Logo"} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : el.type === 'qr' ? (
            <div style={{ width: '100%', height: '100%', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 10 }}>[QR]</span>
            </div>
          ) : resolveTemplateText(el.content)}
        </div>
      ))}
    </div>
  )
}

export default function SubmitPage() {
  const params = useParams()
  const token = params.token as string

  const [step, setStep] = useState<"loading" | "error" | "form" | "photo" | "bgprocess" | "review" | "success">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [config, setConfig] = useState<FormConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("") // Data URL of the accepted photo
  const [croppedPhoto, setCroppedPhoto] = useState("")
  const [cardSide, setCardSide] = useState<"front" | "back">("front")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ serialNumber: string; studentId: string } | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [alertMsg, setAlertMsg] = useState("")
  const [photoVerified, setPhotoVerified] = useState(false)
  const [bgSkippable, setBgSkippable] = useState(false)

  useEffect(() => {
    fetch(`/api/submit/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setConfig(data.data)
          // Auto-populate class in formData so template preview always has it
          if (data.data.className) {
            setFormData(prev => ({ ...prev, class: data.data.className }))
          }
          setStep("form")
        } else {
          setErrorMsg(data.error || "Invalid link")
          setStep("error")
        }
      })
      .catch(() => { setErrorMsg("Failed to load form"); setStep("error") })
  }, [token])

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  // Note: PhotoVerifier now returns stable data URLs directly

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!photoFile) {
      setStep("photo")
      return
    }
    handleReview()
  }

  const handleReview = async () => {
    if (photoPreview && !croppedPhoto) {
      setCroppedPhoto(photoPreview)
    }
    setStep("review")
  }

  const handleSubmit = async () => {
    if (!config) return
    setSubmitting(true)
    setUploadProgress(0)
    try {
      let photoUrl = ""
      if (croppedPhoto) {
        try {
          setUploadProgress(10)
          const blob = await fetch(croppedPhoto).then(r => r.blob())
          setUploadProgress(25)
          const fd = new FormData()
          fd.append("file", new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }))
          fd.append("folder", `students/${config.schoolId}`)
          setUploadProgress(30)
          const uploadRes = await fetch("/api/upload", { method: "POST", body: fd })
          const uploadData = await uploadRes.json()
          setUploadProgress(70)
          if (uploadRes.ok && uploadData.success) {
            photoUrl = uploadData.url
          } else {
            console.error("Photo upload error:", uploadData.error)
          }
          setUploadProgress(80)
        } catch (photoErr) {
          console.error("Photo upload failed:", photoErr)
        }
      } else {
        setUploadProgress(80)
      }

      setUploadProgress(85)
      const res = await fetch(`/api/submit/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData, photoUrl }),
      })
      setUploadProgress(95)
      const data = await res.json()
      if (data.success) {
        setUploadProgress(100)
        setResult(data.data)
        setStep("success")
      } else {
        setAlertMsg(data.error || "Submission failed")
        setTimeout(() => setAlertMsg(""), 5000)
        setSubmitting(false)
      }
    } catch (err) {
      console.error(err)
      setAlertMsg("Submission failed. Please try again.")
      setTimeout(() => setAlertMsg(""), 5000)
      setSubmitting(false)
    }
  }

  if (step === "loading") return (
    <div className="submit-page">
      <div className="submit-container">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60 }}>
          <div className="login-spinner" style={{ width: 32, height: 32, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6' }} />
          <p style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>Loading form...</p>
        </div>
      </div>
    </div>
  )

  if (step === "error") return (
    <div className="submit-page">
      <div className="submit-container">
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            {errorMsg === "Invalid link" ? "Invalid Form Link" :
             errorMsg === "This link is closed" ? "Form Closed" :
             errorMsg === "This link has expired" ? "Link Expired" : "Error"}
          </h2>
          <p style={{ fontSize: 14, color: '#64748b' }}>{errorMsg}</p>
        </div>
      </div>
    </div>
  )

  if (step === "success") return (
    <div className="submit-page">
      <div className="submit-container" style={{ maxWidth: 520 }}>
        <div style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Submitted Successfully!</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>Your ID card registration has been received.</p>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Serial Number</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>{result?.serialNumber}</p>
          </div>

          {/* ID Card Preview */}
          {config && (
            <div style={{ marginBottom: 24 }}>
              {config.templateImageUrl && config.fieldMappings?.length > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <JpgCardPreview
                    templateImageUrl={config.templateImageUrl}
                    fieldMappings={config.fieldMappings}
                    formData={formData}
                    studentPhoto={croppedPhoto}
                    scale={1}
                    watermark="Wise Melon"
                  />
                </div>
              ) : (
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>Your ID card is being prepared.</p>
                </div>
              )}
            </div>
          )}

          <p style={{ fontSize: 13, color: '#94a3b8' }}>Please save this serial number for your records.</p>
        </div>
      </div>
    </div>
  )

  if (step === "review") return (
    <div className="submit-page">
      <div className="submit-container" style={{ maxWidth: 720 }}>
        {/* Header */}
        <div style={{ padding: '28px 24px 0 24px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4, letterSpacing: '-0.01em' }}>Review ID Card</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 0 }}>Please confirm your details before submitting.</p>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>
          {/* Main content — side-by-side on desktop, stacked on mobile */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 24 }}>
            
            {/* Card Preview */}
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Card Preview</div>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {config?.templateImageUrl && config?.fieldMappings?.length > 0 ? (
                  <JpgCardPreview
                    templateImageUrl={config.templateImageUrl}
                    fieldMappings={config.fieldMappings}
                    formData={formData}
                    studentPhoto={croppedPhoto}
                    scale={1}
                    watermark="Wise Melon"
                  />
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, background: '#f1f5f9', padding: 3, borderRadius: 8, width: '100%' }}>
                      <button onClick={() => setCardSide("front")} style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: cardSide === "front" ? 'white' : 'transparent', color: cardSide === "front" ? '#3b82f6' : '#94a3b8', boxShadow: cardSide === "front" ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>Front</button>
                      <button onClick={() => setCardSide("back")} style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 600, borderRadius: 5, border: 'none', cursor: 'pointer', background: cardSide === "back" ? 'white' : 'transparent', color: cardSide === "back" ? '#3b82f6' : '#94a3b8', boxShadow: cardSide === "back" ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>Back</button>
                    </div>
                    <IDCardPreview 
                      layout={cardSide === 'front' ? config?.frontLayout || [] : config?.backLayout || []} 
                      widthMm={config?.cardWidthMm || 85.6}
                      heightMm={config?.cardHeightMm || 54}
                      formData={formData}
                      config={config}
                      croppedPhoto={croppedPhoto}
                    />
                  </>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#cbd5e1' }}>Powered by Print ID Craft</div>
            </div>

            {/* Details Check Panel */}
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Details Check</div>
              <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {/* Student Photo Thumbnail */}
                {croppedPhoto && (
                  <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={croppedPhoto} alt="Photo" style={{ width: 48, height: 60, borderRadius: 6, objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{formData.name || formData.fullName || '—'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{config?.className}</div>
                    </div>
                  </div>
                )}
                
                {/* Field Details */}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {config?.fieldConfig.filter(f => f.key !== "class").map((field, idx) => (
                      formData[field.key] && (
                        <div 
                          key={field.key} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'baseline',
                            padding: '10px 0', 
                            borderBottom: idx < (config?.fieldConfig.filter(f => f.key !== "class").length || 0) - 1 ? '1px solid #e2e8f0' : 'none',
                          }}
                        >
                          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>{field.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', textAlign: 'right', marginLeft: 12, wordBreak: 'break-word' }}>{formData[field.key]}</span>
                        </div>
                      )
                    ))}
                    {/* Class (auto-filled) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0' }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Class</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{config?.className}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmation note */}
              <div style={{ 
                marginTop: 12, padding: '10px 14px', borderRadius: 8, 
                background: '#eff6ff', border: '1px solid #bfdbfe', 
                display: 'flex', alignItems: 'flex-start', gap: 8 
              }}>
                <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>ℹ️</span>
                <span style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
                  Please verify all details carefully. Once submitted, changes cannot be made without contacting the school.
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar during submission */}
          {submitting && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                <span>{uploadProgress < 80 ? 'Uploading photo...' : uploadProgress < 95 ? 'Submitting...' : 'Finalizing...'}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #3b82f6, #2563eb)', width: `${uploadProgress}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {/* Alert message */}
          {alertMsg && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
              ⚠️ {alertMsg}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              className="btn btn-outline" 
              style={{ flex: 1, padding: '14px', fontSize: 14, fontWeight: 600 }} 
              onClick={() => setStep("photo")}
              disabled={submitting}
            >
              ← Back
            </button>
            <button 
              className="btn btn-primary" 
              style={{ flex: 2, padding: '14px', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }} 
              disabled={submitting} 
              onClick={handleSubmit}
            >
              {submitting ? "Submitting..." : "✓ Submit Registration"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="submit-page">
      <div className="submit-container">
        {/* School Header */}
        <div style={{ textAlign: 'center', padding: '28px 20px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #1B4F8A)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, fontWeight: 700, color: 'white' }}>
            {config?.schoolName.charAt(0)}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{config?.schoolName}</h1>
          <p style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>ID Registration — {config?.className}</p>
        </div>

        {/* Step Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '16px 20px', background: '#f8fafc', flexWrap: 'wrap' }}>
          {["Details", "Photo", "Background", "Review"].map((s, i) => {
            const currentStep = step as string
            const stepOrder = ["form", "photo", "bgprocess", "review"]
            const currentIdx = stepOrder.indexOf(currentStep)
            const isActive = currentIdx === i
            const isDone = currentIdx > i
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700,
                  background: isActive ? '#3b82f6' : isDone ? '#22c55e' : '#e2e8f0',
                  color: isActive || isDone ? 'white' : '#94a3b8',
                }}>
                  {isDone ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#0f172a' : '#94a3b8' }}>{s}</span>
                {i < 3 && <div style={{ width: 16, height: 1, background: '#e2e8f0' }} />}
              </div>
            )
          })}
        </div>

        <div style={{ padding: 24 }}>
          {/* FORM STEP */}
          {step === "form" && (
            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Auto-filled Class field - read only */}
                {config?.className && (
                  <div className="form-group">
                    <label>Class</label>
                    <input
                      type="text"
                      value={config.className}
                      readOnly
                      disabled
                      style={{ background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'not-allowed', border: '1px solid #e2e8f0' }}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>Auto-assigned based on your form link</span>
                  </div>
                )}
                {config?.fieldConfig.filter(f => f.key !== "class").map(field => (
                  <div key={field.key} className="form-group">
                    <label>
                      {field.label}
                      {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                    </label>
                    {field.type === "select" && field.key === "bloodGroup" ? (
                      <select
                        required={field.required}
                        value={formData[field.key] || ""}
                        onChange={e => handleFieldChange(field.key, e.target.value)}
                      >
                        <option value="">Select...</option>
                        {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        required={field.required}
                        value={formData[field.key] || ""}
                        onChange={e => handleFieldChange(field.key, e.target.value)}
                        rows={3}
                        style={{ resize: 'vertical', minHeight: 60 }}
                      />
                    ) : (
                      <input
                        type={field.type === "tel" ? "tel" : field.type === "date" ? "date" : "text"}
                        required={field.required}
                        value={formData[field.key] || ""}
                        onChange={e => handleFieldChange(field.key, e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 24, padding: '14px', fontSize: 15 }}>
                Next: Upload Photo →
              </button>
            </form>
          )}

          {/* PHOTO STEP */}
          {step === "photo" && (
            <div>
              <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>
                Upload a passport-style photo. If your photo already has a plain
                background like the sample below, no AI processing is needed.
              </p>

              {/* Reference Sample + Instructions card */}
              {!photoPreview && (
                <div style={{
                  display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap',
                  padding: 14, background: '#f0f9ff', border: '1px solid #bae6fd',
                  borderRadius: 12, marginBottom: 16,
                }}>
                  {/* Sample reference photo */}
                  <div style={{ flex: '0 0 110px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: 110, aspectRatio: '3 / 4', borderRadius: 8, overflow: 'hidden',
                      border: '2px solid #22c55e', background: '#fee2e2',
                      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      {/* Real reference image if provided in /public/sample-id-photo.jpg.
                          Falls back to an SVG silhouette illustration so the card always renders. */}
                      <img
                        src="/sample-id-photo.jpg"
                        alt="Sample ID photo"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <svg
                        viewBox="0 0 60 80" width="100%" height="100%"
                        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                        aria-hidden
                      >
                        {/* Subtle silhouette overlay — only visible if the photo above failed to load */}
                        <circle cx="30" cy="26" r="11" fill="#fecaca" />
                        <path d="M8 80 C 10 56, 50 56, 52 80 Z" fill="#1e3a5f" />
                      </svg>
                      {/* Privacy: blur the face region of the sample reference photo so a real
                          student's identity is never exposed when an admin drops a photo into
                          /public/sample-id-photo.jpg. The oval is sized to cover the upper face
                          area of a standard 3:4 head-and-shoulders portrait. */}
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: '6%', left: '22%', width: '56%', height: '46%',
                          borderRadius: '50%',
                          backdropFilter: 'blur(12px)',
                          WebkitBackdropFilter: 'blur(12px)',
                          background: 'rgba(255,255,255,0.05)',
                          pointerEvents: 'none',
                        }}
                      />
                      <div style={{
                        position: 'absolute', top: 4, left: 4,
                        background: '#22c55e', color: 'white',
                        fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      }}>SAMPLE</div>
                    </div>
                    <div style={{ fontSize: 10, color: '#0369a1', marginTop: 6, textAlign: 'center', fontWeight: 600 }}>
                      Reference photo
                      <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>(face blurred for privacy)</div>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0c4a6e', marginBottom: 6 }}>
                      📸 How to take the perfect ID photo
                    </div>
                    <ul style={{
                      margin: 0, paddingLeft: 18, fontSize: 12,
                      color: '#0369a1', lineHeight: 1.7,
                    }}>
                      <li><strong>Front-facing</strong> — look straight at the camera</li>
                      <li><strong>Head &amp; shoulders only</strong> — passport style</li>
                      <li><strong>Plain solid background</strong> (red curtain, wall, or any single colour)</li>
                      <li><strong>School uniform</strong> with tie/blazer if applicable</li>
                      <li><strong>Bright, even lighting</strong> — no shadows on face</li>
                      <li><strong>Neutral expression</strong>, eyes open, no sunglasses/cap</li>
                    </ul>
                    <div style={{
                      marginTop: 8, padding: '6px 10px', background: '#dcfce7',
                      borderRadius: 6, fontSize: 11, color: '#166534', fontWeight: 600,
                    }}>
                      ✅ If your photo already looks like the sample, we skip AI processing and use it as-is.
                    </div>
                  </div>
                </div>
              )}

              {!photoPreview ? (
                <PhotoVerifier
                  onPhotoAccepted={(file, previewUrl, bgQualityGood) => {
                    setPhotoFile(file)
                    // previewUrl is already a stable data URL from PhotoVerifier
                    setPhotoPreview(previewUrl)
                    setPhotoVerified(true)
                    // If background is already clean, skip AI bg removal
                    setBgSkippable(!!bgQualityGood)
                  }}
                  schoolBgColor={config?.photoBgColor}
                />
              ) : (
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <div style={{
                    padding: '10px 14px',
                    background: bgSkippable ? '#dcfce7' : '#fef3c7',
                    borderRadius: 10, fontSize: 13,
                    color: bgSkippable ? '#16a34a' : '#92400e',
                    fontWeight: 600, marginBottom: 12, textAlign: 'center',
                  }}>
                    {bgSkippable
                      ? "✅ Photo verified — background is already plain, no AI needed"
                      : "✅ Photo verified — AI will clean up the background next"}
                  </div>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid #22c55e', maxWidth: 200, margin: '0 auto' }}>
                    <img src={photoPreview} alt="Preview" style={{ width: '100%', display: 'block' }} />
                  </div>
                  <button onClick={() => { setPhotoPreview(""); setPhotoFile(null); setCroppedPhoto(""); setPhotoVerified(false); setBgSkippable(false) }} className="btn btn-outline" style={{ width: '100%', marginTop: 12, fontSize: 12 }}>
                    Choose Different Photo
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep("form")}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={!photoPreview} onClick={() => {
                  if (bgSkippable) {
                    // Photo already has clean background — skip AI processing
                    setCroppedPhoto(photoPreview)
                    setStep("review")
                  } else {
                    setStep("bgprocess")
                  }
                }}>
                  {bgSkippable ? "Continue to Review →" : "Process Background →"}
                </button>
              </div>
            </div>
          )}

          {/* BACKGROUND PROCESSING STEP */}
          {step === "bgprocess" && photoPreview && (
            <div>
              <PhotoBgProcessor
                photoUrl={photoPreview}
                defaultBgColor={config?.photoBgColor || "#FFFFFF"}
                onProcessed={(processedUrl) => {
                  // Use the processed photo (bg removed + color applied)
                  setPhotoPreview(processedUrl)
                  setCroppedPhoto(processedUrl)
                  setStep("review")
                }}
                onSkip={() => {
                  // Skip bg processing, go straight to review
                  setCroppedPhoto(photoPreview)
                  setStep("review")
                }}
              />

              <div style={{ marginTop: 16 }}>
                <button className="btn btn-outline" style={{ width: '100%', fontSize: 12 }} onClick={() => setStep("photo")}>
                  ← Back to Photo Upload
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
