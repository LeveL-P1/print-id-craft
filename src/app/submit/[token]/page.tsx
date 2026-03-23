"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import ReactCrop, { type Crop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import SharedIDCardPreview from "@/components/IDCardPreview"

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
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
    setCrop({ unit: "%", width: 75, height: 100, x: 12.5, y: 0 })
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

    const TARGET_W = 600
    const TARGET_H = 800
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
          const { createClient } = await import("@supabase/supabase-js")
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || "",
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
          )
          setUploadProgress(30)
          const fileName = `students/${config.schoolId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from("student-photos")
            .upload(fileName, blob, { contentType: "image/jpeg", upsert: true })
          setUploadProgress(70)
          if (uploadErr) {
            console.error("Photo upload error:", uploadErr)
          }
          if (!uploadErr && uploadData) {
            const { data: urlData } = supabase.storage.from("student-photos").getPublicUrl(fileName)
            photoUrl = urlData.publicUrl
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
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
                <button onClick={() => setCardSide("front")} style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', background: cardSide === "front" ? 'white' : 'transparent', color: cardSide === "front" ? '#3b82f6' : '#64748b', boxShadow: cardSide === "front" ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Front</button>
                <button onClick={() => setCardSide("back")} style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', background: cardSide === "back" ? 'white' : 'transparent', color: cardSide === "back" ? '#3b82f6' : '#64748b', boxShadow: cardSide === "back" ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Back</button>
              </div>
              <SharedIDCardPreview
                layout={cardSide === 'front' ? config.frontLayout || [] : config.backLayout || []}
                widthMm={config.cardWidthMm || 85.6}
                heightMm={config.cardHeightMm || 54}
                formData={{ ...formData, class: config.className }}
                studentPhoto={croppedPhoto}
                schoolLogo={config.schoolLogo || undefined}
                serialNumber={result?.serialNumber}
                scale={3.5}
              />
            </div>
          )}

          <p style={{ fontSize: 13, color: '#94a3b8' }}>Please save this serial number for your records.</p>
        </div>
      </div>
    </div>
  )

  if (step === "review") return (
    <div className="submit-page">
      <div className="submit-container">
        <div style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Review Card</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>This is how your identity card will look.</p>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
              <button onClick={() => setCardSide("front")} style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', background: cardSide === "front" ? 'white' : 'transparent', color: cardSide === "front" ? '#3b82f6' : '#64748b', boxShadow: cardSide === "front" ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Front View</button>
              <button onClick={() => setCardSide("back")} style={{ flex: 1, padding: '8px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', background: cardSide === "back" ? 'white' : 'transparent', color: cardSide === "back" ? '#3b82f6' : '#64748b', boxShadow: cardSide === "back" ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Back View</button>
            </div>

            <IDCardPreview 
              layout={cardSide === 'front' ? config?.frontLayout || [] : config?.backLayout || []} 
              widthMm={config?.cardWidthMm || 85.6}
              heightMm={config?.cardHeightMm || 54}
              formData={formData}
              config={config}
              croppedPhoto={croppedPhoto}
            />
          </div>

          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Details Check</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {config?.fieldConfig.filter(f => f.key !== "class").map(field => (
                formData[field.key] && (
                  <div key={field.key}>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{field.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{formData[field.key]}</p>
                  </div>
                )
              ))}
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
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16, animation: 'fadeIn 0.2s' }}>
              ⚠️ {alertMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setStep("photo")}>← Back</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Submitting..." : "Submit Registration"}
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
                Upload a passport-size photo. It will be cropped to 3:4 ratio.
              </p>

              {!photoPreview ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed #e2e8f0', borderRadius: 16, padding: 40, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s' }}
                >
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
                  <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Click to upload photo</p>
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>JPG, PNG up to 5MB</p>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                </div>
              ) : (
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <ReactCrop crop={crop} onChange={(_, pc) => setCrop(pc)} aspect={3 / 4}>
                    <img ref={imgRef} src={photoPreview} alt="Preview" style={{ maxWidth: '100%' }} />
                  </ReactCrop>
                  <button onClick={() => { setPhotoPreview(""); setPhotoFile(null); setCroppedPhoto("") }} className="btn btn-outline" style={{ width: '100%', marginTop: 12 }}>
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
