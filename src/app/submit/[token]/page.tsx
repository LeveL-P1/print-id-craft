"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import PhotoVerifier from "@/components/PhotoVerifier"
import JpgCardPreview from "@/components/JpgCardPreview"
import PhotoCropper from "@/components/PhotoCropper"
import PhotoBgProcessor from "@/components/PhotoBgProcessor"
import {
  getFieldRole,
  resolveFieldValue,
  type FieldRole,
} from "@/lib/field-resolver"
import { formatClassSection } from "@/lib/section-class"
import { applyFixedBranchToFormData } from "@/lib/submit-fields"
import { uploadStudentPhotoResilient } from "@/lib/client-photo-upload"
import { preloadBgRemovalModel } from "@/lib/photo-background"
import { PHOTO_BG_STATUS, type PhotoBgStatus } from "@/lib/photo-bg-status"

const SUPPORT_PHONE_DISPLAY = "+91 98818 77607"
const SUPPORT_PHONE_E164 = "+919881877607"
const SUPPORT_PHONE_WA = "919881877607"

function buildWhatsAppUrl(message: string) {
  return `https://wa.me/${SUPPORT_PHONE_WA}?text=${encodeURIComponent(message)}`
}

const safeFilePart = (value: string) =>
  (value || "student")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "student"

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildSupportWhatsAppMessage(parts: {
  schoolName?: string
  className?: string
  studentName?: string
  serialNumber?: string
  reason?: "already_submitted" | "duplicate_blocked"
}) {
  const school = parts.schoolName || "the school"
  const classPart = parts.className ? ` (${parts.className})` : ""
  const namePart = parts.studentName ? ` for ${parts.studentName}` : ""
  if (parts.reason === "already_submitted") {
    return (
      `Hello, I need help with the ID card form for ${school}${classPart}${namePart}.` +
      (parts.serialNumber ? ` Registration ID: ${parts.serialNumber}.` : " ") +
      " Please help."
    )
  }
  return (
    `Hello, I am trying to submit the ID card form for ${school}${classPart},` +
    ` but I'm getting a "details already registered" message.` +
    (parts.studentName ? ` My name is ${parts.studentName}.` : "") +
    " Please help."
  )
}

type FieldConfig = { key: string; label: string; type: string; required: boolean; role?: string }
type TemplateElement = { 
  id: string; type: string; x: number; y: number; width: number; height: number; 
  content: string; fontSize?: number; fill?: string; align?: string; bold?: boolean 
}

type FormConfig = {
  schoolName: string
  schoolLogo: string | null
  className: string
  sectionName?: string
  schoolId: string
  classId: string
  usesClassPicker?: boolean
  classOptions?: string[]
  divisions?: string[]
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
  // Available house/flag colours (from other students in this school) — used to
  // render the House Flag input as a dropdown so parents don't misspell.
  flagColors?: string[]
  fixedBranch?: string
}

const fieldRole = (field: FieldConfig): FieldRole =>
  getFieldRole(field.key, field.label, field.role)

const getDisplayClass = (cfg: FormConfig | null, fd: Record<string, string>) =>
  cfg?.usesClassPicker ? (fd.class || "—") : (cfg?.className || "")

const formatSubmittedDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

// Title-case each word: "darshan choudhari" -> "Darshan Choudhari".
// Capitalises the first character of every whitespace-delimited word while
// leaving the rest of the word as the user typed it, so corrections like
// "McDonald" survive editing.
const titleCaseWords = (s: string): string =>
  s.replace(/(^|\s)([a-zA-Z])/g, (_m, sp, ch) => sp + ch.toUpperCase())

const getCleanLabel = (label: string): string => {
  const l = (label || "").toLowerCase().trim()
  if (l === "mother (no.)" || l === "mother no." || l === "mother no" || l === "motherphone" || l === "mother phone") {
    return "Mother's Mobile No."
  }
  if (l === "mob.- father" || l === "father (no.)" || l === "father no." || l === "father no" || l === "fatherphone" || l === "father phone") {
    return "Father's Mobile No."
  }
  return label
}

// Strip the +91 prefix (with optional spaces / 0 / hyphens) so we can show
// only the local 10-digit portion in the input while storing the full
// E.164-ish string in formData. Used ONLY for the initial seed value (e.g.
// when a draft is restored from localStorage) — live typing uses the
// separate mobileLocals state instead, so the prefix never round-trips
// through this function during a keystroke.
const stripIndianPrefix = (raw: string): string => {
  if (!raw) return ""
  // Recognize a stored value that was clearly written by our own input
  // ("+91 XXXXXXXXXX" / "+91XXXXXXXXXX") — strip the prefix verbatim.
  const explicit = raw.match(/^\+?\s*91[\s-]*(\d{0,10})\s*$/)
  if (explicit) return explicit[1]
  const digits = raw.replace(/\D/g, "")
  // 12-digit string starting with 91 → country code + 10 local digits
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2)
  // Otherwise assume the string is already local. Truncate to 10 digits.
  return digits.slice(0, 10)
}

// Count whitespace-delimited words in a string (used for address minimum check).
const wordCount = (s: string): number =>
  (s || "").trim().split(/\s+/).filter(Boolean).length

const ADDRESS_MIN_WORDS = 5

const DOB_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))
const DOB_DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"))
const DOB_YEARS = Array.from({ length: 90 }, (_, i) => String(new Date().getFullYear() - i))

function parseDobParts(value: string) {
  const trimmed = (value || "").trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return { month: iso[2], day: iso[3], year: iso[1] }

  const slash = trimmed.match(/^(\d{1,2}|DD)\/(\d{1,2}|MM)\/(\d{2,4}|YY|YYYY)$/)
  if (slash) {
    return {
      day: slash[1] === "DD" ? "" : slash[1].padStart(2, "0"),
      month: slash[2] === "MM" ? "" : slash[2].padStart(2, "0"),
      year: slash[3] === "YY" || slash[3] === "YYYY" ? "" : slash[3].length === 2 ? `20${slash[3]}` : slash[3],
    }
  }

  return { month: "", day: "", year: "" }
}

function buildDobValue(month: string, day: string, year: string) {
  if (!month && !day && !year) return ""
  return `${day || "DD"}/${month || "MM"}/${year || "YYYY"}`
}

function DobSelectInput({
  value,
  required,
  onChange,
}: {
  value: string
  required: boolean
  onChange: (value: string) => void
}) {
  const parts = parseDobParts(value)
  const update = (next: Partial<typeof parts>) => {
    const merged = { ...parts, ...next }
    onChange(buildDobValue(merged.month, merged.day, merged.year))
  }

  const selectStyle: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    padding: "12px 10px",
    fontSize: 14,
    border: "1.5px solid #cbd5e1",
    borderRadius: 10,
    background: "white",
  }

  const partStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  }

  const partLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    marginBottom: 5,
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={partStyle}>
          <label style={partLabelStyle}>Date</label>
          <select required={required} aria-label="Date" value={parts.day} onChange={(e) => update({ day: e.target.value })} style={selectStyle}>
            <option value="">DD</option>
            {DOB_DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
          </select>
        </div>
        <div style={partStyle}>
          <label style={partLabelStyle}>Month</label>
          <select required={required} aria-label="Month" value={parts.month} onChange={(e) => update({ month: e.target.value })} style={selectStyle}>
            <option value="">MM</option>
            {DOB_MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
          </select>
        </div>
        <div style={partStyle}>
          <label style={partLabelStyle}>Year</label>
          <select required={required} aria-label="Year" value={parts.year} onChange={(e) => update({ year: e.target.value })} style={selectStyle}>
            <option value="">YYYY</option>
            {DOB_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>
      <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "block" }}>
        Format: DD/MM/YYYY
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SampleReferencePhoto — shows a clear illustration of "what a good ID photo
// looks like". If an admin places a real image at /public/sample-id-photo.jpg
// it is rendered with its upper-face region blurred for privacy. Otherwise a
// neutral SVG silhouette is shown — never both at once, so the card never
// looks like garbage with a silhouette pasted on top of a real photo.
// ─────────────────────────────────────────────────────────────────────────────
const SampleReferencePhoto = () => {
  const [hasRealPhoto, setHasRealPhoto] = useState<boolean | null>(null) // null = loading

  useEffect(() => {
    let cancelled = false
    fetch("/sample-id-photo.jpg", { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setHasRealPhoto(res.ok)
      })
      .catch(() => {
        if (!cancelled) setHasRealPhoto(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ flex: '0 0 110px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: 110, aspectRatio: '3 / 4', borderRadius: 8, overflow: 'hidden',
        border: '2px solid #22c55e',
        background: hasRealPhoto ? '#000' : '#fee2e2',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        position: 'relative',
      }}>
        {/* Probe image — hidden if it fails to load. We rely on onLoad/onError
            to decide whether to render the silhouette fallback. */}
        {hasRealPhoto === true && (
          <img
            src="/sample-id-photo.jpg"
            alt="Sample ID photo"
            onError={() => setHasRealPhoto(false)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              display: 'block',
            }}
          />
        )}

        {/* Silhouette fallback — drawn only when there is no real photo. */}
        {hasRealPhoto === false && (
          <svg viewBox="0 0 60 80" width="100%" height="100%" aria-hidden style={{ position: 'absolute', inset: 0 }}>
            {/* Subtle gradient backdrop */}
            <defs>
              <linearGradient id="refBg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#fecaca" />
                <stop offset="1" stopColor="#fca5a5" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="60" height="80" fill="url(#refBg)" />
            {/* Head */}
            <circle cx="30" cy="30" r="10" fill="#fde68a" stroke="#92400e" strokeWidth="0.6" />
            {/* Hair cap */}
            <path d="M20 28 Q30 14 40 28 L40 26 Q30 18 20 26 Z" fill="#451a03" />
            {/* Shoulders/uniform (blazer) */}
            <path d="M10 80 L14 52 Q30 44 46 52 L50 80 Z" fill="#1e3a5f" />
            {/* Shirt collar */}
            <path d="M26 48 L30 56 L34 48 L34 52 L30 60 L26 52 Z" fill="#f8fafc" />
            {/* Tie */}
            <path d="M29 56 L31 56 L32 70 L28 70 Z" fill="#7f1d1d" />
          </svg>
        )}

        {/* Privacy blur over the upper-face region — only useful when a real
            photo is shown. CSS backdrop-filter; modern browsers only. */}
        {hasRealPhoto && (
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
        )}

        <div style={{
          position: 'absolute', top: 4, left: 4,
          background: '#22c55e', color: 'white',
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
        }}>SAMPLE</div>
      </div>
      <div style={{ fontSize: 10, color: '#0369a1', marginTop: 6, textAlign: 'center', fontWeight: 600 }}>
        Reference photo
        {hasRealPhoto && (
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>(face blurred for privacy)</div>
        )}
      </div>
    </div>
  )
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
    resolved = resolved.replace(/{{class}}/g, formData.class || config?.className || "")
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
            <img src={croppedPhoto || "https://via.placeholder.com/150?text=Photo"} alt="Student" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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

  const [step, setStep] = useState<"loading" | "error" | "form" | "photo" | "crop" | "bg" | "review" | "success">("loading")
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
  const [missingFieldKey, setMissingFieldKey] = useState("")
  const [previewDownloadStatus, setPreviewDownloadStatus] = useState<"" | "downloaded" | "unavailable">("")
  const successPreviewRef = useRef<HTMLDivElement>(null)
  const previewDownloadAttemptedRef = useRef(false)
  const [duplicateBlocked, setDuplicateBlocked] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<{
    studentName: string
    serialNumber?: string
    submittedAt?: string
    isRoll?: boolean
  } | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState<{
    studentName: string
    serialNumber: string
    submittedAt: string
  } | null>(null)
  const [photoVerified, setPhotoVerified] = useState(false)
  const [photoUploadWarning, setPhotoUploadWarning] = useState("")
  const [photoBgStatus, setPhotoBgStatus] = useState<PhotoBgStatus>("")

  // Visible 10-digit text for each mobile-intent field, kept separate from
  // formData so we never round-trip the "+91 " prefix through the input value
  // (doing so caused digits like "9" to be displayed as "919" because the
  // stored "+91 9" was re-parsed as "919" → all digits → slice(-10) = "919").
  const [mobileLocals, setMobileLocals] = useState<Record<string, string>>({})

  // ───────────────────────────────────────────────────────────────────────────
  // Auto-save / restore form draft per token. Parents on slow networks
  // accidentally hit Back, refresh, or close the tab — without persistence
  // they have to fill the form from scratch. We keep everything in
  // localStorage keyed by the class's linkToken so different classes never
  // collide. The draft is cleared on successful submit.
  //
  // We persist text/state only. Large base64 photo strings can exceed mobile
  // storage quotas and block the main thread while the parent is filling data.
  // ───────────────────────────────────────────────────────────────────────────
  const DRAFT_KEY = `submit-draft:${token}`
  const SUBMITTED_KEY = `submit-done:${token}`
  const [draftRestored, setDraftRestored] = useState(false)
  const [draftBanner, setDraftBanner] = useState(false)

  const checkSubmissionStatus = useCallback(async (fd: Record<string, string>) => {
    const name = resolveFieldValue(fd, "name")
    if (!name || name.trim().length < 3) return
    try {
      const res = await fetch(
        `/api/submit/${token}?statusCheck=1&formData=${encodeURIComponent(JSON.stringify(fd))}`
      )
      const data = await res.json()
      if (data.success && data.data?.submitted) {
        setAlreadySubmitted({
          studentName: data.data.studentName || name,
          serialNumber: data.data.serialNumber,
          submittedAt: data.data.submittedAt,
        })
      }
    } catch {
      // Non-fatal — parent can still fill the form
    }
  }, [token])

  // Restore once on mount (before the config fetch overwrites class field).
  useEffect(() => {
    if (typeof window === "undefined" || !token) return
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) { setDraftRestored(true); return }
      const draft = JSON.parse(raw) as {
        formData?: Record<string, string>
        photoVerified?: boolean
        step?: typeof step
        savedAt?: number
      }
      // Discard drafts older than 7 days to avoid stale data hanging around.
      const TTL_MS = 7 * 24 * 60 * 60 * 1000
      if (draft.savedAt && Date.now() - draft.savedAt > TTL_MS) {
        window.localStorage.removeItem(DRAFT_KEY)
        setDraftRestored(true)
        return
      }
      if (draft.formData) setFormData(draft.formData)
      if (draft.photoVerified) setPhotoVerified(true)
      const hasAnyData =
        !!(draft.formData && Object.keys(draft.formData).some(k => k !== "class" && (draft.formData?.[k] || "").trim() !== ""))
      if (hasAnyData) setDraftBanner(true)
      if (draft.formData) {
        checkSubmissionStatus(draft.formData)
      }
    } catch {
      // Corrupt draft — ignore and start fresh.
    } finally {
      setDraftRestored(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Save whenever the user changes any of the persisted fields. We wait for
  // the initial restore to complete so we never overwrite an existing draft
  // with the empty initial state. If localStorage is full (quota exceeded —
  // e.g. a very large photo data URL on iOS), we drop the photo from the
  // draft rather than failing entirely.
  useEffect(() => {
    if (typeof window === "undefined" || !token || !draftRestored) return
    if (step === "loading" || step === "error" || step === "success") return
    const draft = {
      formData,
      photoVerified,
      step,
      savedAt: Date.now(),
    }
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, photoPreview: "", croppedPhoto: "" }))
      } catch { /* give up silently — draft just won't survive this session */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, photoVerified, step, draftRestored])

  // Preload the ISNet background-removal model while the parent is on photo/crop
  // so AI processing after crop feels faster on first use.
  useEffect(() => {
    if (step === "photo" || step === "crop") {
      preloadBgRemovalModel().catch(() => {})
    }
  }, [step])

  const goToBgProcessing = useCallback(() => {
    setPhotoBgStatus("")
    setStep("bg")
  }, [])

  const clearDraft = () => {
    if (typeof window === "undefined") return
    try { window.localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
  }

  useEffect(() => {
    fetch(`/api/submit/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setConfig(data.data)
          // Legacy fixed-class links auto-fill class; section links use dropdowns.
          if (data.data.className && !data.data.usesClassPicker) {
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

  // Always merge the template's fixed branch after config loads or a draft
  // is restored. Laptop browsers often have a saved draft (localStorage) from
  // an earlier visit that omits branch — phones usually start with a clean slate.
  useEffect(() => {
    if (!config?.fixedBranch || !draftRestored) return
    setFormData(prev =>
      applyFixedBranchToFormData(prev, config.fixedBranch, config.fieldConfig)
    )
  }, [config, draftRestored])

  useEffect(() => {
    if (!config || step === "loading" || step === "error" || step === "success") return
    const name = resolveFieldValue(formData, "name")
    if (!name || name.trim().length < 3) return
    const timer = window.setTimeout(() => checkSubmissionStatus(formData), 450)
    return () => window.clearTimeout(timer)
  }, [config, formData, step, checkSubmissionStatus])

  const getMissingFieldStyle = (key: string): React.CSSProperties =>
    missingFieldKey === key
      ? {
          outline: "2px solid #ef4444",
          outlineOffset: 4,
          borderRadius: 12,
          background: "#fff7f7",
        }
      : {}

  const scrollToField = (key: string) => {
    if (typeof window === "undefined") return
    window.setTimeout(() => {
      document
        .querySelector(`[data-field-key="${key.replace(/"/g, '\\"')}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 50)
  }

  const showMissingField = (key: string, message: string) => {
    setMissingFieldKey(key)
    setAlertMsg(message)
    scrollToField(key)
  }

  const handleFieldChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    if (missingFieldKey === key) setMissingFieldKey("")
  }

  const getPreviewFileName = useCallback(() => {
    const studentName = resolveFieldValue(formData, "name")
    const serial = result?.serialNumber || "preview"
    return `${safeFilePart(`${studentName || "student"}-${serial}`)}-id-preview.jpg`
  }, [formData, result?.serialNumber])

  const downloadRenderedPreview = useCallback(async () => {
    const canvas = successPreviewRef.current?.querySelector("canvas")
    if (!canvas) throw new Error("Preview image is not ready yet")

    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      } catch {
        resolve(null)
      }
    })
    if (!blob) throw new Error("Preview image could not be prepared")

    downloadBlob(blob, getPreviewFileName())
    setPreviewDownloadStatus("downloaded")
  }, [getPreviewFileName])

  useEffect(() => {
    if (step !== "success" || !result || previewDownloadAttemptedRef.current) return
    if (!config?.templateImageUrl || !config.fieldMappings?.length) {
      setPreviewDownloadStatus("unavailable")
      return
    }

    previewDownloadAttemptedRef.current = true
    const timer = window.setTimeout(() => {
      downloadRenderedPreview().catch((downloadErr) => {
        console.warn("Could not auto-download rendered ID preview:", downloadErr)
        setPreviewDownloadStatus("unavailable")
      })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [step, result, config?.templateImageUrl, config?.fieldMappings, downloadRenderedPreview])

  // Note: PhotoVerifier now returns stable data URLs directly

  const getPreviewBlockReason = () => {
    if (!config) return "Form is not ready yet. Please try again."
    if (config.usesClassPicker) {
      if (!formData.classGrade?.trim()) return "Please select a class."
      if (!formData.division?.trim()) return "Please select a division."
    }
    for (const f of config.fieldConfig) {
      if (f.key === "class") continue
      if (config.fixedBranch && fieldRole(f) === "branch") continue
      const value = (formData[f.key] || "").trim()
      const role = fieldRole(f)
      if (f.required && !value) return `Please fill in ${getCleanLabel(f.label)}.`
      if (role === "address" && f.required && wordCount(value) < ADDRESS_MIN_WORDS) {
        return `Please write the full address - at least ${ADDRESS_MIN_WORDS} words (house no, street, area, city, pincode).`
      }
      if (role === "mobile" && f.required && stripIndianPrefix(value).length !== 10) {
        return "Mobile number must be exactly 10 digits (after +91)."
      }
      if (role === "dob" && f.required && !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        return "Please select date of birth in DD/MM/YYYY format."
      }
      if (role === "branch" && f.required && value.length < 2) return "Please enter the branch name."
    }
    if (!photoFile || !photoPreview || !photoVerified) {
      return "Please upload a clear student photo before preview."
    }
    return ""
  }

  const handleFormSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault()

    // Per-field validation for the parent-friendly intents. We show the first
    // missing detail, highlight that input, and scroll it into view.
    if (config) {
      if (config.usesClassPicker) {
        if (!formData.classGrade?.trim()) {
          showMissingField("classGrade", "Please select a class.")
          return
        }
        if (!formData.division?.trim()) {
          showMissingField("division", "Please select a division.")
          return
        }
      }
      for (const f of config.fieldConfig) {
        if (f.key === "class") continue
        if (config.fixedBranch && fieldRole(f) === "branch") continue
        const value = (formData[f.key] || "").trim()
        const role = fieldRole(f)
        if (f.required && !value) {
          showMissingField(f.key, `Please fill in ${getCleanLabel(f.label)}.`)
          return
        }
        if (role === "address" && f.required) {
          if (wordCount(value) < ADDRESS_MIN_WORDS) {
            showMissingField(f.key, `Please write the full address - at least ${ADDRESS_MIN_WORDS} words (house no, street, area, city, pincode).`)
            return
          }
        }
        if (role === "mobile" && f.required) {
          const local = stripIndianPrefix(value)
          if (local.length !== 10) {
            showMissingField(f.key, "Mobile number must be exactly 10 digits (after +91).")
            return
          }
        }
        if (role === "dob" && f.required && !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
          showMissingField(f.key, "Please select the full date of birth: Date, Month, and Year.")
          return
        }
        if (role === "branch" && f.required && value.length < 2) {
          showMissingField(f.key, "Please enter the branch name.")
          return
        }
      }
    }
    setAlertMsg("")
    setMissingFieldKey("")

    if (!photoFile || !photoPreview || !photoVerified) {
      setStep("photo")
      return
    }
    handleReview()
  }

  const handleReview = async () => {
    const blockReason = getPreviewBlockReason()
    if (blockReason) {
      setAlertMsg(blockReason)
      setMissingFieldKey("")
      setStep(blockReason.includes("photo") ? "photo" : "form")
      return
    }
    if (photoPreview && !croppedPhoto) {
      setCroppedPhoto(photoPreview)
    }
    setAlertMsg("")
    setMissingFieldKey("")
    goToBgProcessing()
  }

  const handleSubmit = async () => {
    if (!config) return
    const blockReason = getPreviewBlockReason()
    if (blockReason || !croppedPhoto) {
      setAlertMsg(blockReason || "Please upload a student photo before submitting.")
      setStep(blockReason?.includes("photo") || !croppedPhoto ? "photo" : "form")
      return
    }
    if (
      config.photoBgColor &&
      photoBgStatus !== PHOTO_BG_STATUS.PROCESSED &&
      photoBgStatus !== PHOTO_BG_STATUS.PLAIN
    ) {
      setAlertMsg("Please wait while we prepare your photo background, then try again.")
      goToBgProcessing()
      return
    }
    setSubmitting(true)
    setUploadProgress(0)
    setPhotoUploadWarning("")
    setAlertMsg("")

    try {
      const photoResult = await uploadStudentPhotoResilient({
        croppedPhoto,
        schoolId: config.schoolId,
        submitToken: token,
        onProgress: setUploadProgress,
      })

      if (photoResult.uploadFailed) {
        setPhotoUploadWarning(
          photoResult.lastError ||
            "Photo upload had a problem — your registration will still be saved."
        )
      }

      setUploadProgress(85)
      const submitFormData = applyFixedBranchToFormData(
        formData,
        config.fixedBranch,
        config.fieldConfig
      )
      let res: Response
      try {
        res = await fetch(`/api/submit/${token}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formData: submitFormData,
            photoUrl: photoResult.photoUrl,
            photoPath: photoResult.photoPath,
            photoDataUrl: photoResult.photoDataUrl,
            photoBgStatus: photoBgStatus || "",
          }),
        })
      } catch (networkErr) {
        console.error("Submit network error:", networkErr)
        setAlertMsg("Could not reach the server. Please check your internet and try again.")
        setSubmitting(false)
        return
      }

      setUploadProgress(95)
      let data: any
      try {
        data = await res.json()
      } catch {
        setAlertMsg("Unexpected server response. Please try again.")
        setSubmitting(false)
        return
      }

      if (data.success) {
        setUploadProgress(100)
        setResult(data.data)
        clearDraft()
        setPreviewDownloadStatus("")
        previewDownloadAttemptedRef.current = false
        try {
          const studentName = resolveFieldValue(formData, "name")
          window.localStorage.setItem(SUBMITTED_KEY, JSON.stringify({
            studentName,
            serialNumber: data.data.serialNumber,
            submittedAt: new Date().toISOString(),
          }))
        } catch { /* ignore */ }
        setStep("success")
        setSubmitting(false)
      } else if (data.error === "DUPLICATE_NAME" || data.error === "DUPLICATE_ROLL") {
        setDuplicateInfo({
          studentName: data.existing?.studentName || resolveFieldValue(formData, "name"),
          serialNumber: data.existing?.serialNumber,
          submittedAt: data.existing?.submittedAt,
          isRoll: data.error === "DUPLICATE_ROLL",
        })
        setDuplicateBlocked(true)
        setSubmitting(false)
      } else {
        setAlertMsg(data.message || data.error || "Submission failed. Please try again.")
        setSubmitting(false)
      }
    } catch (err) {
      console.error("Submit error:", err)
      setAlertMsg("Something went wrong. Please try again — your details are still on this page.")
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
                <div ref={successPreviewRef} style={{ display: 'flex', justifyContent: 'center' }}>
                  <JpgCardPreview
                    templateImageUrl={config.templateImageUrl}
                    fieldMappings={config.fieldMappings}
                    formData={formData}
                    studentPhoto={croppedPhoto}
                    scale={1}
                    watermark="Wise Melon"
                    cardWidthMm={(config as any).cardWidthMm}
                    cardHeightMm={(config as any).cardHeightMm}
                  />
                </div>
              ) : (
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: '#94a3b8' }}>Your ID card is being prepared.</p>
                </div>
              )}
            </div>
          )}

          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Please save this serial number for your records.</p>
          {previewDownloadStatus === "downloaded" && (
            <p style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginBottom: 8 }}>
              ID preview image downloaded to your device.
            </p>
          )}
          {previewDownloadStatus === "unavailable" && (
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              Automatic preview download was blocked. Your registration is still saved.
            </p>
          )}
          {config?.templateImageUrl && config.fieldMappings?.length > 0 && (
            <button
              type="button"
              onClick={() => {
                previewDownloadAttemptedRef.current = true
                downloadRenderedPreview().catch((downloadErr) => {
                  console.warn("Manual preview download failed:", downloadErr)
                  setPreviewDownloadStatus("unavailable")
                })
              }}
              style={{
                width: '100%',
                maxWidth: 320,
                margin: '0 auto 12px',
                padding: '12px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
                color: 'white',
                fontSize: 14,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Download ID Preview
            </button>
          )}
          <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.55, maxWidth: 420, margin: '0 auto' }}>
            Your photo background has been prepared automatically for the ID card preview.
          </p>
        </div>
      </div>
    </div>
  )

  if (alreadySubmitted) {
    const waUrl = buildWhatsAppUrl(buildSupportWhatsAppMessage({
      schoolName: config?.schoolName,
      className: getDisplayClass(config, formData),
      studentName: alreadySubmitted.studentName,
      serialNumber: alreadySubmitted.serialNumber,
      reason: "already_submitted",
    }))
    return (
      <div className="submit-page">
        <div className="submit-container" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#dcfce7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: 36,
            }}>✓</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              Already Registered
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 8, lineHeight: 1.6 }}>
              {alreadySubmitted.studentName ? (
                <>This student is already registered: <strong style={{ color: '#0f172a' }}>{alreadySubmitted.studentName}</strong></>
              ) : (
                <>This form has already been submitted</>
              )}
              {alreadySubmitted.submittedAt ? (
                <> on <strong>{formatSubmittedDate(alreadySubmitted.submittedAt)}</strong></>
              ) : null}
              {getDisplayClass(config, formData) ? <> in <strong>{getDisplayClass(config, formData)}</strong></> : null}.
            </p>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Registration ID</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                {alreadySubmitted.serialNumber}
              </p>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
              Do not submit again. Contact support if you need changes.
            </p>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 10, width: '100%', maxWidth: 320,
                padding: '14px 20px', borderRadius: 12,
                background: '#25D366', color: 'white',
                fontSize: 15, fontWeight: 700,
                textDecoration: 'none',
                marginBottom: 12,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Contact Support on WhatsApp
            </a>
            <a
              href={`tel:${SUPPORT_PHONE_E164}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, width: '100%', maxWidth: 320,
                padding: '12px 20px', borderRadius: 12,
                background: '#f8fafc', color: '#334155',
                fontSize: 14, fontWeight: 600,
                textDecoration: 'none', border: '1px solid #e2e8f0',
              }}
            >
              Call {SUPPORT_PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (duplicateBlocked) {
    const studentName = duplicateInfo?.studentName || resolveFieldValue(formData, "name")
    const waUrl = buildWhatsAppUrl(buildSupportWhatsAppMessage({
      schoolName: config?.schoolName,
      className: getDisplayClass(config, formData),
      studentName,
      reason: "duplicate_blocked",
    }))
    return (
      <div className="submit-page">
        <div className="submit-container" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#fef3c7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: 36,
            }}>⚠️</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              Already Registered
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 8, lineHeight: 1.6 }}>
              {duplicateInfo?.isRoll
                ? "This roll number is already registered"
                : "This student is already registered"}
              {studentName ? <> for <strong style={{ color: '#0f172a' }}>{studentName}</strong></> : null}
              {getDisplayClass(config, formData) ? <> in <strong>{getDisplayClass(config, formData)}</strong></> : null}.
              {duplicateInfo?.submittedAt ? (
                <> Submitted on <strong>{formatSubmittedDate(duplicateInfo.submittedAt)}</strong>.</>
              ) : null}
            </p>
            {duplicateInfo?.serialNumber && (
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Registration ID</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                  {duplicateInfo.serialNumber}
                </p>
              </div>
            )}
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
              You cannot submit again. Contact support on WhatsApp if you need changes.
            </p>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 10, width: '100%', maxWidth: 320,
                padding: '14px 20px', borderRadius: 12,
                background: '#25D366', color: 'white',
                fontSize: 15, fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)',
                marginBottom: 12,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              Chat with Support on WhatsApp
            </a>

            <a
              href={`tel:${SUPPORT_PHONE_E164}`}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, width: '100%', maxWidth: 320,
                padding: '12px 20px', borderRadius: 12,
                background: '#f8fafc', color: '#334155',
                fontSize: 14, fontWeight: 600,
                textDecoration: 'none', border: '1px solid #e2e8f0',
              }}
            >
              Call {SUPPORT_PHONE_DISPLAY}
            </a>

            <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
              Support: <strong style={{ color: '#475569' }}>{SUPPORT_PHONE_DISPLAY}</strong>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
                    cardWidthMm={(config as any).cardWidthMm}
                    cardHeightMm={(config as any).cardHeightMm}
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
              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#cbd5e1' }}>Powered by WiseMelon</div>
              <div style={{
                marginTop: 12, padding: '12px 14px', borderRadius: 10,
                background: '#fffbeb', border: '1px solid #fde68a',
                fontSize: 12, color: '#92400e', lineHeight: 1.55,
              }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>Preview only — for reference</strong>
                {photoBgStatus === PHOTO_BG_STATUS.PROCESSED || photoBgStatus === PHOTO_BG_STATUS.PLAIN ? (
                  <>Your photo background has been prepared{config?.photoBgColor ? <> ({config.photoBgColor})</> : null} for the ID card preview below.</>
                ) : (
                  <>
                    This shows how your ID card may look.
                    {config?.photoBgColor ? (
                      <> The background will be made plain ({config.photoBgColor}) for printing.</>
                    ) : (
                      <> The background will be made plain for printing.</>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Details Check Panel */}
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Details Check</div>
              <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                {/* Student Photo Thumbnail */}
                {croppedPhoto && (
                  <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img src={croppedPhoto} alt="Photo" style={{ width: 48, height: 60, borderRadius: 6, objectFit: 'contain', border: '2px solid #e2e8f0', background: '#f8fafc' }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{resolveFieldValue(formData, "name") || '—'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{getDisplayClass(config, formData)}</div>
                    </div>
                  </div>
                )}
                
                {/* Field Details */}
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {config?.fieldConfig.filter(f => f.key !== "class").map((field, idx) => {
                      if (fieldRole(field) === "branch" && config.fixedBranch) return null
                      return formData[field.key] && (
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
                          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>{getCleanLabel(field.label)}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', textAlign: 'right', marginLeft: 12, wordBreak: 'break-word' }}>{formData[field.key]}</span>
                        </div>
                      )
                    })}
                    {/* Class (auto-filled) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0' }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Class</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{getDisplayClass(config, formData)}</span>
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

          {photoUploadWarning && (
            <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, color: '#92400e', fontSize: 13, marginBottom: 16 }}>
              ℹ️ {photoUploadWarning}
            </div>
          )}

          {/* Alert message */}
          {alertMsg && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
              <strong>{missingFieldKey ? "Add missing details" : "Please check this"}</strong>
              <div style={{ marginTop: 3 }}>{alertMsg}</div>
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
          <p style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>
            ID Registration — {config?.usesClassPicker ? (config.sectionName || config.className) : config?.className}
          </p>
        </div>

        {/* Step Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '16px 20px', background: '#f8fafc', flexWrap: 'wrap' }}>
          {["Details", "Photo", "Review"].map((s, i) => {
            const currentStep = step as string
            const visualIdx =
              currentStep === "form" ? 0
              : currentStep === "photo" || currentStep === "crop" || currentStep === "bg" ? 1
              : currentStep === "review" ? 2
              : 0
            const currentIdx = visualIdx
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
                {i < 2 && <div style={{ width: 16, height: 1, background: '#e2e8f0' }} />}
              </div>
            )
          })}
        </div>

        <div style={{ padding: 24 }}>
          {/* FORM STEP */}
          {step === "form" && (
            <form onSubmit={handleFormSubmit} noValidate>
              {/* Draft-restored banner — shown when we successfully restored
                  the parent's previous progress after an accidental back /
                  refresh / tab close. They can opt out by clicking "Start fresh". */}
              {draftBanner && (
                <div style={{
                  padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0',
                  borderRadius: 10, fontSize: 13, color: '#065f46', marginBottom: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                  <div>
                    <strong>✅ We restored your previous answers.</strong>
                    <div style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>
                      No need to fill the form again — just continue where you left off.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm("Discard the saved draft and start over?")) return
                      clearDraft()
                      const freshBase: Record<string, string> = config?.className
                        ? { class: config.className }
                        : {}
                      setFormData(
                        config?.fixedBranch
                          ? applyFixedBranchToFormData(freshBase, config.fixedBranch, config.fieldConfig)
                          : freshBase
                      )
                      setPhotoFile(null)
                      setPhotoPreview("")
                      setCroppedPhoto("")
                      setPhotoVerified(false)
                      setPhotoBgStatus("")
                      setDraftBanner(false)
                    }}
                    style={{
                      fontSize: 11, padding: '6px 10px',
                      background: 'transparent', color: '#047857',
                      border: '1px solid #6ee7b7', borderRadius: 6,
                      cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                    }}
                  >
                    Start fresh
                  </button>
                </div>
              )}
              {alertMsg && (
                <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>
                  <strong>{missingFieldKey ? "Add missing details" : "Please check this"}</strong>
                  <div style={{ marginTop: 3 }}>{alertMsg}</div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {config?.usesClassPicker ? (
                  <>
                    <div className="form-group">
                      <label>Section</label>
                      <input
                        type="text"
                        value={config.sectionName || config.className}
                        readOnly
                        disabled
                        style={{ background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'not-allowed', border: '1px solid #e2e8f0' }}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                        Assigned from your registration link
                      </span>
                    </div>
                    <div className="form-group" data-field-key="classGrade" style={getMissingFieldStyle("classGrade")}>
                      <label>
                        Class <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        required
                        value={formData.classGrade || ""}
                        onChange={(e) => {
                          const classGrade = e.target.value
                          if (missingFieldKey === "classGrade") setMissingFieldKey("")
                          setFormData((prev) => ({
                            ...prev,
                            classGrade,
                            class: formatClassSection(classGrade, prev.division || ""),
                          }))
                        }}
                        style={{
                          width: '100%',
                          padding: '11px 12px',
                          fontSize: 14,
                          border: '1.5px solid #cbd5e1',
                          borderRadius: 10,
                          background: 'white',
                        }}
                      >
                        <option value="">— Choose class —</option>
                        {(config.classOptions || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" data-field-key="division" style={getMissingFieldStyle("division")}>
                      <label>
                        Division <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        required
                        value={formData.division || ""}
                        onChange={(e) => {
                          const division = e.target.value
                          if (missingFieldKey === "division") setMissingFieldKey("")
                          setFormData((prev) => ({
                            ...prev,
                            division,
                            class: formatClassSection(prev.classGrade || "", division),
                          }))
                        }}
                        style={{
                          width: '100%',
                          padding: '11px 12px',
                          fontSize: 14,
                          border: '1.5px solid #cbd5e1',
                          borderRadius: 10,
                          background: 'white',
                        }}
                      >
                        <option value="">— Choose division —</option>
                        {(config.divisions || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      {formData.class && (
                        <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                          Will appear on ID card as: <strong>{formData.class}</strong>
                        </span>
                      )}
                    </div>
                  </>
                ) : config?.className ? (
                  /* Legacy fixed-class link — read only */
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
                ) : null}
                {config?.fieldConfig.filter(f => f.key !== "class").map(field => {
                  const role = fieldRole(field)
                  const value = formData[field.key] || ""

                  // ── Mobile: locked "+91" prefix + 10-digit numeric input ──
                  if (role === "mobile") {
                    // Prefer the explicit local-state value (what the user
                    // last typed). Fall back to stripping the stored "+91 …"
                    // form once on initial mount / draft restore.
                    const local = mobileLocals[field.key] !== undefined
                      ? mobileLocals[field.key]
                      : stripIndianPrefix(value)
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <div style={{
                          display: 'flex', alignItems: 'stretch',
                          border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden',
                          background: '#fff',
                        }}>
                          <span style={{
                            padding: '12px 12px', background: '#f1f5f9',
                            color: '#475569', fontWeight: 700, fontSize: 14,
                            display: 'flex', alignItems: 'center',
                            borderRight: '1px solid #e2e8f0',
                          }} aria-hidden>🇮🇳 +91</span>
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            maxLength={10}
                            required={field.required}
                            value={local}
                            onChange={e => {
                              const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 10)
                              setMobileLocals(prev => ({ ...prev, [field.key]: onlyDigits }))
                              handleFieldChange(field.key, onlyDigits ? `+91 ${onlyDigits}` : "")
                            }}
                            placeholder="9876543210"
                            style={{ flex: 1, border: 'none', outline: 'none', padding: '12px 14px', fontSize: 14 }}
                          />
                        </div>
                        <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                          Type only the 10-digit number — country code is added automatically.
                        </span>
                      </div>
                    )
                  }

                  // ── Address: textarea + minimum-word counter ──
                  if (role === "address") {
                    const wc = wordCount(value)
                    const ok = wc >= ADDRESS_MIN_WORDS
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <textarea
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                          rows={3}
                          style={{ resize: 'vertical', minHeight: 70 }}
                          placeholder="e.g. House No 12, MG Road, Kothrud, Pune, 411038"
                        />
                        <span style={{
                          fontSize: 11, marginTop: 4, display: 'block',
                          color: ok ? '#16a34a' : '#dc2626', fontWeight: 600,
                        }}>
                          {ok
                            ? `✓ ${wc} words — looks complete`
                            : `Write the full address — at least ${ADDRESS_MIN_WORDS} words (${wc}/${ADDRESS_MIN_WORDS})`}
                        </span>
                      </div>
                    )
                  }

                  // ── House Flag: dropdown of existing colours, else free text ──
                  if (role === "flag") {
                    const opts = config?.flagColors || []
                    if (opts.length > 0) {
                      return (
                        <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                          <label>
                            {getCleanLabel(field.label)}
                            {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                          </label>
                          <select
                            required={field.required}
                            value={value}
                            onChange={e => handleFieldChange(field.key, e.target.value)}
                          >
                            <option value="">Select your house...</option>
                            {opts.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                            Pick the house assigned by your school.
                          </span>
                        </div>
                      )
                    }
                    // Fallback: free text (e.g. first student in the school)
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <input
                          type="text"
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, titleCaseWords(e.target.value))}
                          placeholder="e.g. Blue"
                        />
                      </div>
                    )
                  }

                  // ── Date of birth ──
                  if (role === "dob") {
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <DobSelectInput
                          required={field.required}
                          value={value}
                          onChange={(nextValue) => handleFieldChange(field.key, nextValue)}
                        />
                      </div>
                    )
                  }

                  // ── Branch ──
                  if (role === "branch") {
                    if (config?.fixedBranch) return null
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <input
                          type="text"
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, titleCaseWords(e.target.value))}
                          placeholder="e.g. Bibevewadi Branch"
                        />
                      </div>
                    )
                  }

                  // ── Blood group ──
                  if (role === "bloodgroup") {
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <select
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                        >
                          <option value="">Select...</option>
                          {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bg => (
                            <option key={bg} value={bg}>{bg}</option>
                          ))}
                        </select>
                      </div>
                    )
                  }

                  // ── Roll / GR / Admission number: numeric, with example placeholder ──
                  if (role === "rollno") {
                    const lbl = field.label.toLowerCase()
                    // Choose an example that matches the label so a school using
                    // "GR No." doesn't see a single-digit roll-number style hint.
                    const example = /gr/.test(lbl) || /admission/.test(lbl) ? "2851" : "7"
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, e.target.value.replace(/\D/g, ""))}
                          placeholder={`e.g. ${example}`}
                        />
                      </div>
                    )
                  }

                  // ── Name-like field: auto title-case + first/middle/last guidance ──
                  if (role === "name" || role === "father" || role === "mother") {
                    const lbl = field.label.toLowerCase()
                    const example = role === "father" || lbl.includes("father")
                      ? "Ramesh Kumar Choudhari"
                      : role === "mother" || lbl.includes("mother")
                        ? "Sunita Kumar Choudhari"
                        : lbl.includes("guardian")
                          ? "Ramesh Kumar Choudhari"
                          : lbl.includes("surname")
                            ? "Choudhari"
                            : "Darshan Sunil Choudhari"
                    const showOrderHint = role === "name" && !lbl.includes("surname")
                    return (
                      <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                        <label>
                          {getCleanLabel(field.label)}
                          {showOrderHint && (
                            <span style={{
                              marginLeft: 8, fontSize: 11, fontWeight: 500,
                              color: '#64748b',
                            }}>
                              (First name • Middle name • Last name)
                            </span>
                          )}
                          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                        </label>
                        <input
                          type="text"
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, titleCaseWords(e.target.value))}
                          placeholder={`e.g. ${example}`}
                          title={showOrderHint
                            ? "Type your full name in this order: First name, then Middle name, then Last name (Surname)."
                            : "Type the surname only."}
                        />
                        {showOrderHint && (
                          <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                            Write your full name in order: <strong>First name → Middle name → Last name</strong>. Skip middle name if you don't have one.
                          </span>
                        )}
                      </div>
                    )
                  }

                  // ── Generic fallback: previous behaviour ──
                  return (
                    <div key={field.key} className="form-group" data-field-key={field.key} style={getMissingFieldStyle(field.key)}>
                      <label>
                        {getCleanLabel(field.label)}
                        {field.required && <span style={{ color: '#ef4444' }}> *</span>}
                      </label>
                      {field.type === "select" && field.key === "bloodGroup" ? (
                        <select
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                        >
                          <option value="">Select...</option>
                          {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                        </select>
                      ) : field.type === "textarea" ? (
                        <textarea
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                          rows={3}
                          style={{ resize: 'vertical', minHeight: 60 }}
                        />
                      ) : (
                        <input
                          type={field.type === "tel" ? "tel" : field.type === "date" ? "date" : "text"}
                          required={field.required}
                          value={value}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                          placeholder={`Enter ${getCleanLabel(field.label).toLowerCase()}`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleFormSubmit}
                style={{ width: '100%', marginTop: 24, padding: '14px', fontSize: 15 }}
              >
                Next: Upload Photo →
              </button>
            </form>
          )}

          {/* PHOTO STEP */}
          {step === "photo" && (
            <div>
              <p style={{ fontSize: 15, color: '#0f172a', marginBottom: 8, fontWeight: 600, textAlign: 'center' }}>
                Take one photo — we handle the rest
              </p>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, textAlign: 'center', lineHeight: 1.6 }}>
                Tap the camera button below. Stand straight against a plain wall in school uniform.
              </p>

              {/* Reference Sample + Instructions card */}
              {!photoPreview && (
                <div style={{
                  display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap',
                  padding: 14, background: '#f0f9ff', border: '1px solid #bae6fd',
                  borderRadius: 12, marginBottom: 16,
                }}>
                  {/* Sample reference photo */}
                  <SampleReferencePhoto />

                  {/* Instructions */}
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0c4a6e', marginBottom: 8 }}>
                      3 simple steps
                    </div>
                    <ol style={{
                      margin: 0, paddingLeft: 20, fontSize: 13,
                      color: '#0369a1', lineHeight: 2,
                    }}>
                      <li><strong>Stand straight</strong> — face the camera</li>
                      <li><strong>Plain wall behind you</strong> — any single colour is fine</li>
                      <li><strong>Tap Take Photo</strong> — we check it meets ID card rules</li>
                    </ol>
                    {config?.photoBgColor && (
                      <div style={{
                        marginTop: 10, padding: '8px 12px', background: '#fff',
                        borderRadius: 8, fontSize: 12, color: '#0c4a6e',
                        display: 'flex', alignItems: 'center', gap: 8,
                        border: '1px solid #bae6fd',
                      }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: config.photoBgColor,
                          border: '1px solid rgba(0,0,0,0.12)',
                        }} />
                        <span>We automatically remove the background and apply this colour to your ID photo.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!photoPreview ? (
                <PhotoVerifier
                  onPhotoAccepted={(file, previewUrl) => {
                    setPhotoFile(file)
                    setPhotoPreview(previewUrl)
                    setCroppedPhoto("")
                    setPhotoVerified(true)
                    setPhotoBgStatus("")
                    setAlertMsg("")
                    setStep("crop")
                  }}
                  schoolBgColor={config?.photoBgColor}
                />
              ) : (
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <div style={{
                    padding: '10px 14px',
                    background: '#dcfce7',
                    borderRadius: 10, fontSize: 13,
                    color: '#16a34a',
                    fontWeight: 600, marginBottom: 12, textAlign: 'center',
                  }}>
                    Photo passed all checks - tap Continue to crop
                  </div>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid #22c55e', maxWidth: 200, margin: '0 auto' }}>
                    <img src={photoPreview} alt="Preview" style={{ width: '100%', display: 'block' }} />
                  </div>
                  <button onClick={() => { setPhotoPreview(""); setPhotoFile(null); setCroppedPhoto(""); setPhotoVerified(false); setPhotoBgStatus("") }} className="btn btn-outline" style={{ width: '100%', marginTop: 12, fontSize: 12 }}>
                    Choose Different Photo
                  </button>
                </div>
              )}

              {photoPreview && (
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-fluid"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setStep("form")}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-fluid"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => {
                      setStep("crop")
                    }}
                  >
                    Continue to Crop
                  </button>
                </div>
              )}
              {!photoPreview && (
                <div style={{ marginTop: 24 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-fluid"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setStep("form")}
                  >
                    ← Back
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CROP STEP */}
          {step === "crop" && photoPreview && (
            <div>
              <PhotoCropper
                photoUrl={photoPreview}
                aspectRatio={3 / 4}
                onCropped={(croppedDataUrl) => {
                  setCroppedPhoto(croppedDataUrl)
                  const blockReason = getPreviewBlockReason()
                  if (blockReason) {
                    setAlertMsg(blockReason)
                    setStep(blockReason.includes("photo") ? "photo" : "form")
                    return
                  }
                  setAlertMsg("")
                  goToBgProcessing()
                }}
                onCancel={() => {
                  setCroppedPhoto(photoPreview)
                  handleReview()
                }}
              />

              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-outline btn-fluid"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    setPhotoPreview("")
                    setPhotoFile(null)
                    setCroppedPhoto("")
                    setPhotoVerified(false)
                    setPhotoBgStatus("")
                    setStep("photo")
                  }}
                >
                  Choose a different photo
                </button>
              </div>
            </div>
          )}

          {/* BACKGROUND REMOVAL STEP — runs ISNet locally, same model as manufacturer */}
          {step === "bg" && croppedPhoto && (
            <div>
              <PhotoBgProcessor
                photoUrl={croppedPhoto}
                defaultBgColor={config?.photoBgColor || "#FFFFFF"}
                autoConfirm
                autoSkipAfterMs={0}
                onProcessed={(processedDataUrl, status) => {
                  setCroppedPhoto(processedDataUrl)
                  setPhotoBgStatus(status)
                  setStep("review")
                }}
                onSkip={(status) => {
                  setPhotoBgStatus(status)
                  setStep("review")
                }}
                onStatus={setPhotoBgStatus}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
