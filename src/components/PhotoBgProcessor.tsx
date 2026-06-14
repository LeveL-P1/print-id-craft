"use client"
import { useState, useRef, useCallback, useEffect } from "react"
import { processPhotoBackgroundLocal } from "@/lib/photo-bg-composite-client"
import { PHOTO_BG_STATUS, type PhotoBgStatus } from "@/lib/photo-bg-status"

type Props = {
  photoUrl: string
  defaultBgColor: string
  onProcessed: (processedDataUrl: string, status: PhotoBgStatus) => void
  onSkip: (status: PhotoBgStatus) => void
  autoConfirm?: boolean
  onStatus?: (status: PhotoBgStatus) => void
}

const BG_JPEG_QUALITY = 0.88
const BG_WORK_MAX_DIM = 768

export default function PhotoBgProcessor({
  photoUrl,
  defaultBgColor,
  onProcessed,
  onSkip,
  autoConfirm = false,
  onStatus,
}: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState("")
  const schoolBgColor = defaultBgColor || "#FFFFFF"
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("")
  const autoConfirmedRef = useRef(false)
  const autoSkippedRef = useRef(false)
  const removalStartedRef = useRef(false)
  const lastBgStatusRef = useRef<PhotoBgStatus>("")

  const setBgStatus = useCallback((status: PhotoBgStatus) => {
    lastBgStatusRef.current = status
    onStatus?.(status)
  }, [onStatus])

  useEffect(() => {
    if (!photoUrl) {
      setError("No photo provided. Please go back and upload a photo.")
      return
    }

    const img = new Image()
    img.onload = () => {
      setPhotoLoaded(true)
      if (photoUrl.startsWith("data:")) {
        setPhotoDataUrl(photoUrl)
      } else {
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, BG_WORK_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          setPhotoDataUrl(canvas.toDataURL("image/jpeg", BG_JPEG_QUALITY))
        } else {
          setPhotoDataUrl(photoUrl)
        }
      }
    }
    img.onerror = () => {
      setError("Could not load the photo. Please go back and re-upload.")
    }
    img.src = photoUrl
  }, [photoUrl])

  const removeBackground = useCallback(async () => {
    const sourceUrl = photoDataUrl || photoUrl
    if (!sourceUrl || removalStartedRef.current) return
    removalStartedRef.current = true

    setProcessing(true)
    setProgress(5)
    setProgressMsg("Preparing your photo…")
    setError("")

    try {
      const { dataUrl, usedAi } = await processPhotoBackgroundLocal(
        sourceUrl,
        schoolBgColor,
        (msg, pct) => {
          setProgressMsg(msg)
          setProgress(pct)
        }
      )
      setBgStatus(usedAi ? PHOTO_BG_STATUS.PROCESSED : PHOTO_BG_STATUS.PLAIN)
      setProcessedUrl(dataUrl)
    } catch (err: unknown) {
      removalStartedRef.current = false
      setError("Could not clean the background. You can still continue with your photo.")
      console.error("Background removal failed:", err)
    } finally {
      setProcessing(false)
    }
  }, [photoUrl, photoDataUrl, schoolBgColor, setBgStatus])

  useEffect(() => {
    if (photoLoaded && photoDataUrl) removeBackground()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoLoaded, photoDataUrl])

  const handleConfirm = () => {
    if (processedUrl) {
      onProcessed(processedUrl, lastBgStatusRef.current || PHOTO_BG_STATUS.PROCESSED)
    }
  }

  useEffect(() => {
    if (autoConfirm && processedUrl && !processing && !autoConfirmedRef.current) {
      autoConfirmedRef.current = true
      onProcessed(processedUrl, lastBgStatusRef.current || PHOTO_BG_STATUS.PROCESSED)
    }
  }, [autoConfirm, processedUrl, processing, onProcessed])

  useEffect(() => {
    if (!autoConfirm || !processing || autoSkippedRef.current) return
    const timer = window.setTimeout(() => {
      if (autoSkippedRef.current || autoConfirmedRef.current) return
      autoSkippedRef.current = true
      setProcessing(false)
      setBgStatus(PHOTO_BG_STATUS.SKIPPED)
      onSkip(PHOTO_BG_STATUS.SKIPPED)
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [autoConfirm, processing, onSkip, setBgStatus])

  const displayUrl = photoDataUrl || photoUrl

  return (
    <div style={{ padding: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white' }}>🎨</span>
        Preparing Your Photo
      </div>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
        Removing background locally and applying colour
        {schoolBgColor && (
          <>
            {" "}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: schoolBgColor, border: '1px solid rgba(0,0,0,0.12)' }} />
              <code style={{ fontSize: 11 }}>{schoolBgColor.toUpperCase()}</code>
            </span>
          </>
        )}
      </p>

      {!processing && !processedUrl && photoLoaded && !error && (
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Your Uploaded Photo</div>
          <div style={{ maxWidth: 160, margin: '0 auto', borderRadius: 10, overflow: 'hidden', border: '2px solid #e2e8f0', aspectRatio: '3/4' }}>
            <img src={displayUrl} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>
      )}

      {processing && (
        <div style={{ background: '#f0f9ff', borderRadius: 14, padding: 24, border: '1px solid #bae6fd', textAlign: 'center' }}>
          <div className="login-spinner" style={{ width: 36, height: 36, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', marginBottom: 8 }}>{progressMsg}</div>
          <div style={{ height: 6, borderRadius: 3, background: '#e0f2fe', overflow: 'hidden', maxWidth: 280, margin: '0 auto' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #3b82f6, #6366f1)', width: `${progress}%`, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 12, padding: 16, border: '1px solid #fecaca', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>{error}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { removalStartedRef.current = false; removeBackground() }} style={{ fontSize: 12, padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Retry</button>
            <button onClick={() => { setBgStatus(PHOTO_BG_STATUS.SKIPPED); onSkip(PHOTO_BG_STATUS.SKIPPED) }} style={{ fontSize: 12, padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Skip & Use Original</button>
          </div>
        </div>
      )}

      {!processing && processedUrl && !autoConfirm && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ flex: '1 1 120px', maxWidth: 160, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Before</div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid #e2e8f0', aspectRatio: '3/4' }}>
                <img src={displayUrl} alt="Original" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 20, color: '#94a3b8' }}>→</div>
            <div style={{ flex: '1 1 120px', maxWidth: 160, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', marginBottom: 6 }}>After</div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid #22c55e', aspectRatio: '3/4' }}>
                <img src={processedUrl} alt="Processed" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setBgStatus(PHOTO_BG_STATUS.SKIPPED); onSkip(PHOTO_BG_STATUS.SKIPPED) }} className="btn btn-outline" style={{ flex: '1 1 140px', justifyContent: 'center' }}>Use Original Instead</button>
            <button type="button" onClick={handleConfirm} className="btn btn-primary" style={{ flex: '2 1 180px', justifyContent: 'center', background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>Use Processed Photo</button>
          </div>
        </>
      )}

      {!processing && processedUrl && autoConfirm && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div className="login-spinner" style={{ width: 28, height: 28, borderColor: 'rgba(34,197,94,0.2)', borderTopColor: '#22c55e', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>Photo ready — continuing…</div>
        </div>
      )}
    </div>
  )
}
