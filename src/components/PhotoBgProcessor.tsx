"use client"
import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import {
  processSubmitPhotoBackground,
  SUBMIT_BG_JPEG_QUALITY,
  SUBMIT_BG_WORK_MAX_DIM,
} from "@/lib/submit-photo-bg"
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

const LIVE_STEPS = [
  { id: "prepare", label: "Preparing photo", match: /prepar/i },
  { id: "service", label: "Connecting to server", match: /send|service|remove\.bg|connect/i },
  { id: "clean", label: "Removing background", match: /remov|clean|background/i },
  { id: "color", label: "Applying colour", match: /colour|color|apply|background updated|done|complete|finish|preview/i },
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

function formatProcessingError(err: unknown) {
  const detail = err instanceof Error ? err.message.trim() : ""
  if (detail.includes("manual review") || detail.includes("quality")) {
    return "We couldn't prepare your photo to the required quality. You can continue with your original upload or retry."
  }
  if (detail.includes("detect") && detail.includes("student")) {
    return "We couldn't detect you clearly in the photo. You can continue with your original upload or try a clearer photo."
  }
  if (detail.includes("not configured")) {
    return "Remove.bg is unavailable right now. You can continue with your original photo or try again later."
  }
  return "Photo preparation didn't work this time. You can continue with your original upload or retry."
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
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [photoLoaded, setPhotoLoaded] = useState(false)
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("")
  const autoConfirmedRef = useRef(false)
  const autoSkippedRef = useRef(false)
  const cancelledRef = useRef(false)
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
      const scale = Math.min(1, SUBMIT_BG_WORK_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight))
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setPhotoDataUrl(canvas.toDataURL("image/jpeg", SUBMIT_BG_JPEG_QUALITY))
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

    cancelledRef.current = false
    setLivePreviewUrl(null)
    setProcessing(true)
    setProgress(5)
    setProgressMsg("Preparing your photo…")
    setError("")

    try {
      const { dataUrl, usedAi } = await processSubmitPhotoBackground(
        sourceUrl,
        schoolBgColor,
        (msg, pct, previewDataUrl) => {
          if (cancelledRef.current) return
          setProgressMsg(msg)
          setProgress(pct)
          if (previewDataUrl) setLivePreviewUrl(previewDataUrl)
        },
      )
      if (cancelledRef.current) return
      setBgStatus(usedAi ? PHOTO_BG_STATUS.PROCESSED : PHOTO_BG_STATUS.PLAIN)
      setProcessedUrl(dataUrl)
      setLivePreviewUrl(dataUrl)
    } catch (err: unknown) {
      if (cancelledRef.current) return
      removalStartedRef.current = false
      if (autoConfirm) {
        setBgStatus(PHOTO_BG_STATUS.SKIPPED)
        onSkip(PHOTO_BG_STATUS.SKIPPED)
        return
      }
      setError(formatProcessingError(err))
      console.error("Background removal failed:", err)
    } finally {
      if (!cancelledRef.current) setProcessing(false)
    }
  }, [photoUrl, photoDataUrl, schoolBgColor, setBgStatus, autoConfirm, onSkip])

  const handleUseOriginal = useCallback(() => {
    cancelledRef.current = true
    setProcessing(false)
    setLivePreviewUrl(null)
    setProcessedUrl(null)
    setError("")
    setBgStatus(PHOTO_BG_STATUS.SKIPPED)
    onSkip(PHOTO_BG_STATUS.SKIPPED)
  }, [onSkip, setBgStatus])

  const handleRetry = useCallback(() => {
    cancelledRef.current = false
    removalStartedRef.current = false
    setProcessedUrl(null)
    setLivePreviewUrl(null)
    setError("")
    setProgress(0)
    setProgressMsg("")
    void removeBackground()
  }, [removeBackground])

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
            <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>— preparing your photo</span>
          </div>

          {displayUrl && (
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div style={{ flex: "1 1 120px", maxWidth: 160, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Your Original</div>
                <div
                  className="bg-live-photo-wrap"
                  style={{ margin: 0, borderColor: livePreviewUrl ? "#e2e8f0" : undefined }}
                  aria-hidden="true"
                >
                  <img src={displayUrl} alt="" />
                  {!livePreviewUrl && <div className="bg-live-scan" />}
                  {!livePreviewUrl && <div className="bg-live-shimmer" />}
                </div>
              </div>
              {livePreviewUrl ? (
                <>
                  <div style={{ fontSize: 18, color: "#94a3b8" }} aria-hidden="true">→</div>
                  <div style={{ flex: "1 1 120px", maxWidth: 160, textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 6 }}>Live Preview</div>
                    <div className="bg-live-photo-wrap bg-live-photo-wrap--ai" style={{ margin: 0 }} aria-hidden="true">
                      <img src={livePreviewUrl} alt="" />
                      <div className="bg-live-ai-badge">ID</div>
                    </div>
                  </div>
                </>
              ) : null}
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

          <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 14, marginBottom: livePreviewUrl ? 12 : 0, lineHeight: 1.5 }}>
            {livePreviewUrl
              ? "Preview is ready — you can keep your original photo or wait for the final version."
              : "Remove.bg is preparing your photo. This usually takes a few seconds."}
          </p>
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              onClick={handleUseOriginal}
              style={{
                fontSize: 12,
                padding: "8px 16px",
                background: "white",
                color: "#475569",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Keep My Original Photo
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 12, padding: 16, border: '1px solid #fecaca', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700, marginBottom: 6 }}>Photo preparation failed</div>
          <div style={{ fontSize: 13, color: '#b91c1c', marginBottom: 12, lineHeight: 1.5 }}>{error}</div>
          {displayUrl && (
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Your original upload</div>
              <div style={{ maxWidth: 140, margin: '0 auto', borderRadius: 10, overflow: 'hidden', border: '2px solid #e2e8f0', aspectRatio: '3/4' }}>
                <img src={displayUrl} alt="Original upload" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleRetry} style={{ flex: '1 1 140px', fontSize: 12, padding: '10px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Retry</button>
            <button type="button" onClick={handleUseOriginal} style={{ flex: '1 1 180px', fontSize: 12, padding: '10px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Continue with Original Photo</button>
          </div>
        </div>
      )}

      {!processing && processedUrl && !autoConfirm && (
        <>
          <p style={{ fontSize: 13, color: "#475569", marginBottom: 16, lineHeight: 1.55, textAlign: "center" }}>
            Compare your original upload with the prepared photo and choose which one to use on your ID card.
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ flex: '1 1 120px', maxWidth: 160, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Your Original</div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid #e2e8f0', aspectRatio: '3/4' }}>
                <img src={displayUrl} alt="Original upload" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 20, color: '#94a3b8' }} aria-hidden="true">→</div>
            <div style={{ flex: '1 1 120px', maxWidth: 160, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', marginBottom: 6 }}>Prepared</div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '2px solid #22c55e', aspectRatio: '3/4' }}>
                <img src={processedUrl} alt="Prepared photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleUseOriginal} className="btn btn-outline" style={{ flex: '1 1 140px', justifyContent: 'center' }}>Keep Original Photo</button>
            <button type="button" onClick={handleConfirm} className="btn btn-primary" style={{ flex: '2 1 180px', justifyContent: 'center', background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>Keep Prepared Photo</button>
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
