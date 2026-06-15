"use client"
import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { processPhotoBackgroundLocal } from "@/lib/photo-bg-composite-client"
import { PHOTO_BG_STATUS, type PhotoBgStatus } from "@/lib/photo-bg-status"

type Props = {
  photoUrl: string
  defaultBgColor: string
  onProcessed: (processedDataUrl: string, status: PhotoBgStatus) => void
  onSkip: (status: PhotoBgStatus) => void
  autoConfirm?: boolean
  /** Milliseconds before auto-skip when autoConfirm is true; 0 disables auto-skip. */
  autoSkipAfterMs?: number
  onStatus?: (status: PhotoBgStatus) => void
}

const BG_JPEG_QUALITY = 0.88
const BG_WORK_MAX_DIM = 768

const LIVE_STEPS = [
  { id: "prepare", label: "Preparing photo", match: /prepar/i },
  { id: "model", label: "Loading AI", match: /model|download|google|gemini/i },
  { id: "clean", label: "Removing background", match: /remov|clean|inference|processing/i },
  { id: "color", label: "Applying colour", match: /colour|color|apply|background updated|done|complete/i },
] as const

function getActiveStepIndex(message: string, progress: number): number {
  const msg = message.toLowerCase()
  const byMessage = LIVE_STEPS.findIndex((step) => step.match.test(msg))
  if (byMessage >= 0) return byMessage
  if (progress >= 85) return 3
  if (progress >= 25) return 2
  if (progress >= 10) return 1
  return 0
}

export default function PhotoBgProcessor({
  photoUrl,
  defaultBgColor,
  onProcessed,
  onSkip,
  autoConfirm = false,
  autoSkipAfterMs = 8000,
  onStatus,
}: Props) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState("")
  const [elapsedSec, setElapsedSec] = useState(0)
  const schoolBgColor = defaultBgColor || "#FFFFFF"
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("")
  const autoConfirmedRef = useRef(false)
  const autoSkippedRef = useRef(false)
  const removalStartedRef = useRef(false)
  const lastBgStatusRef = useRef<PhotoBgStatus>("")
  const processingStartedAtRef = useRef<number | null>(null)

  const activeStepIndex = useMemo(
    () => getActiveStepIndex(progressMsg, progress),
    [progressMsg, progress]
  )

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
    img.onerror = () => {
      setError("Could not load the photo. Please go back and re-upload.")
    }
    img.src = photoUrl
  }, [photoUrl])

  useEffect(() => {
    if (!processing) {
      processingStartedAtRef.current = null
      setElapsedSec(0)
      return
    }
    processingStartedAtRef.current = Date.now()
    const timer = window.setInterval(() => {
      if (processingStartedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - processingStartedAtRef.current) / 1000))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [processing])

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
        },
        "gemini"
      )
      setBgStatus(usedAi ? PHOTO_BG_STATUS.PROCESSED : PHOTO_BG_STATUS.PLAIN)
      setProcessedUrl(dataUrl)
    } catch (err: unknown) {
      removalStartedRef.current = false
      if (autoConfirm) {
        setBgStatus(PHOTO_BG_STATUS.SKIPPED)
        onSkip(PHOTO_BG_STATUS.SKIPPED)
        return
      }
      setError("Could not clean the background. You can still continue with your photo.")
      console.error("Background removal failed:", err)
    } finally {
      setProcessing(false)
    }
  }, [photoUrl, photoDataUrl, schoolBgColor, setBgStatus, autoConfirm, onSkip])

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
    if (!autoConfirm || !processing || autoSkippedRef.current || autoSkipAfterMs <= 0) return
    const timer = window.setTimeout(() => {
      if (autoSkippedRef.current || autoConfirmedRef.current) return
      autoSkippedRef.current = true
      setProcessing(false)
      setBgStatus(PHOTO_BG_STATUS.SKIPPED)
      onSkip(PHOTO_BG_STATUS.SKIPPED)
    }, autoSkipAfterMs)
    return () => window.clearTimeout(timer)
  }, [autoConfirm, autoSkipAfterMs, processing, onSkip, setBgStatus])

  const displayUrl = photoDataUrl || photoUrl
  const isWorking = processing || (!processedUrl && photoLoaded && !error)

  return (
    <div style={{ padding: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white' }}>🎨</span>
        Preparing Your Photo
      </div>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
        Removing background and applying colour
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

      {isWorking && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{ background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)', borderRadius: 16, padding: 20, border: '1px solid #bfdbfe', marginBottom: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            <span className="bg-live-dot" aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', letterSpacing: '0.04em' }}>LIVE</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>— AI is preparing your photo</span>
          </div>

          {displayUrl && (
            <div className="bg-live-photo-wrap" aria-hidden="true">
              <img src={displayUrl} alt="" />
              <div className="bg-live-scan" />
              <div className="bg-live-shimmer" />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18, maxWidth: 300, margin: '0 auto 18px' }}>
            {LIVE_STEPS.map((step, index) => {
              const isDone = index < activeStepIndex
              const isActive = index === activeStepIndex
              return (
                <div
                  key={step.id}
                  className={`bg-live-step${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`}
                >
                  <span className="bg-live-step-dot">{isDone ? "✓" : index + 1}</span>
                  <span>{step.label}{isActive ? "…" : ""}</span>
                </div>
              )
            })}
          </div>

          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
              {progressMsg || "Starting…"}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb', lineHeight: 1, marginBottom: 4 }}>
              {Math.max(0, Math.min(100, progress))}%
            </div>
            {elapsedSec > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                Running for {elapsedSec}s — please keep this page open
              </div>
            )}
          </div>

          <div style={{ height: 8, borderRadius: 4, background: '#dbeafe', overflow: 'hidden', maxWidth: 320, margin: '0 auto' }}>
            <div className="bg-live-progress-fill" style={{ width: `${Math.max(4, progress)}%` }} />
          </div>

          <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
            AI is working on the photo right now. First time may take up to a minute.
          </p>
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
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>✓</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>Photo ready!</span>
          </div>
          <div style={{ maxWidth: 120, margin: '0 auto 12px', borderRadius: 10, overflow: 'hidden', border: '2px solid #22c55e', aspectRatio: '3/4' }}>
            <img src={processedUrl} alt="Prepared photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div className="login-spinner" style={{ width: 28, height: 28, borderColor: 'rgba(34,197,94,0.2)', borderTopColor: '#22c55e', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>Continuing to review…</div>
        </div>
      )}
    </div>
  )
}
