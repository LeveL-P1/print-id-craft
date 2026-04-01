"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import ReactCrop, { type Crop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import SharedIDCardPreview from "@/components/IDCardPreview"
import dynamic from "next/dynamic"
import PhotoVerifier from "@/components/PhotoVerifier"

const JpgCardPreview = dynamic(() => import("@/components/JpgCardPreview"), { ssr: false })

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

  const [step, setStep] = useState<"loading" | "error" | "form" | "photo" | "review" | "success">("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [config, setConfig] = useState<FormConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState("")
  const [crop, setCrop] = useState<Crop>({ unit: "%", width: 75, height: 100, x: 12.5, y: 0 })
  const [croppedPhoto, setCroppedPhoto] = useState("")
  const [cardSide, setCardSide] = useState<"front" | "back">("front")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ serialNumber: string; studentId: string } | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [alertMsg, setAlertMsg] = useState("")
  const [photoVerified, setPhotoVerified] = useState(false)

  const imgRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/submit/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setConfig(data.data)
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

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAlertMsg("Invalid file type. Please upload JPEG, PNG, or WebP only.")
      setTimeout(() => setAlertMsg(""), 4000)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAlertMsg("Photo must be less than 5MB")
      setTimeout(() => setAlertMsg(""), 4000)
      return
    }
    // Validate minimum 300px dimension
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth < 300 || img.naturalHeight < 300) {
        setAlertMsg("Photo must be at least 300×300 pixels. Please upload a higher resolution image.")
        setTimeout(() => setAlertMsg(""), 5000)
        return
      }
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onload = () => setPhotoPreview(reader.result as string)
      reader.readAsDataURL(file)
      setCrop({ unit: "%", width: 75, height: 100, x: 12.5, y: 0 })
    }
    img.onerror = () => {
      setAlertMsg("Failed to read image. Please try another file.")
      setTimeout(() => setAlertMsg(""), 4000)
    }
    img.src = URL.createObjectURL(file)
  }

  const generateCroppedPhoto = useCallback(async () => {
    if (!imgRef.current || !crop.width || !crop.height) return
    const img = imgRef.current
    const canvas = document.createElement("canvas")
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height
    const pixelCrop = {
      x: (crop.x / 100) * img.width * scaleX,
      y: (crop.y / 100) * img.height * scaleY,
      width: (crop.width / 100) * img.width * scaleX,
      height: (crop.height / 100) * img.height * scaleY,
    }

    const TARGET_W = 300
    const TARGET_H = 400
    canvas.width = TARGET_W
    canvas.height = TARGET_H
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, TARGET_W, TARGET_H)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
    setCroppedPhoto(dataUrl)
    return dataUrl
  }, [crop])

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
      await generateCroppedPhoto()
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
                    formData={{ ...formData, class: config.className }}
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
                    formData={{ ...formData, class: config.className }}
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 20px', background: '#f8fafc' }}>
          {["Details", "Photo", "Review"].map((s, i) => {
            const currentStep = step as string
            const isActive = (currentStep === "form" && i === 0) || (currentStep === "photo" && i === 1) || (currentStep === "review" && i === 2)
            const isDone = (currentStep === "photo" && i === 0) || (currentStep === "review" && i <= 1)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: isActive ? '#3b82f6' : isDone ? '#22c55e' : '#e2e8f0',
                  color: isActive || isDone ? 'white' : '#94a3b8',
                }}>
                  {isDone ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#0f172a' : '#94a3b8' }}>{s}</span>
                {i < 2 && <div style={{ width: 20, height: 1, background: '#e2e8f0' }} />}
              </div>
            )
          })}
        </div>

        <div style={{ padding: 24 }}>
          {/* FORM STEP */}
          {step === "form" && (
            <form onSubmit={handleFormSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                Upload a passport-size photo with a <strong>plain / solid background</strong>.
              </p>

              {/* Photo Guidelines Box */}
              <div style={{ marginBottom: 20, padding: '14px 16px', background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 8 }}>📸 Photo Requirements</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 12, color: '#2563eb', lineHeight: 1.8 }}>
                  <div>✅ Minimum 300 pixels wide</div>
                  <div>✅ Plain/solid background</div>
                  <div>✅ Face clearly visible</div>
                  <div>✅ 3:4 ratio (passport size)</div>
                  <div>❌ No group photos</div>
                  <div>❌ No filters or editing</div>
                </div>
                {/* Sample Photo Reference */}
                <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ 
                    width: 48, height: 64, borderRadius: 6, border: '2px solid #3b82f6', 
                    background: '#dbeafe', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden'
                  }}>
                    <svg viewBox="0 0 40 56" width="36" height="50" fill="none">
                      <rect width="40" height="56" fill="#dbeafe" />
                      <circle cx="20" cy="18" r="8" fill="#93c5fd" />
                      <ellipse cx="20" cy="38" rx="14" ry="10" fill="#93c5fd" />
                    </svg>
                    <div style={{ position: 'absolute', bottom: 2, fontSize: 6, fontWeight: 700, color: '#3b82f6' }}>SAMPLE</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#3b82f6', lineHeight: 1.5 }}>
                    <strong>Standard format:</strong> Head and shoulders, centered,<br/>
                    looking straight at camera, plain background.
                  </div>
                </div>
              </div>

              {!photoPreview ? (
                <PhotoVerifier
                  onPhotoAccepted={(file, previewUrl) => {
                    setPhotoFile(file)
                    setPhotoPreview(previewUrl)
                    setPhotoVerified(true)
                    setCrop({ unit: "%", width: 75, height: 100, x: 12.5, y: 0 })
                  }}
                />
              ) : (
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <div style={{ padding: '8px 12px', background: '#dcfce7', borderRadius: 8, fontSize: 12, color: '#16a34a', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>
                    ✅ Photo verified — Crop to passport size below
                  </div>
                  <ReactCrop crop={crop} onChange={(_, pc) => setCrop(pc)} aspect={3 / 4}>
                    <img ref={imgRef} src={photoPreview} alt="Preview" style={{ maxWidth: '100%' }} />
                  </ReactCrop>
                  <button onClick={() => { setPhotoPreview(""); setPhotoFile(null); setCroppedPhoto(""); setPhotoVerified(false) }} className="btn btn-outline" style={{ width: '100%', marginTop: 12 }}>
                    Choose Different Photo
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep("form")}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={!photoPreview} onClick={async () => { await generateCroppedPhoto(); setStep("review") }}>
                  Review →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
