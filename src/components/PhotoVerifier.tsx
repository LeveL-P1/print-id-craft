"use client"
import { useState, useRef, useCallback, useEffect } from "react"

type PhotoVerificationResult = {
  valid: boolean
  checks: {
    minWidth: { passed: boolean; value: number; required: number }
    aspectRatio: { passed: boolean; value: string; required: string }
    plainBackground: { passed: boolean; score: number; threshold: number }
    frontFacing: { passed: boolean; confidence: string }
    fileSize: { passed: boolean; value: string; max: string }
  }
}

type Props = {
  onPhotoAccepted: (file: File, previewUrl: string) => void
  currentPhotoUrl?: string
  schoolBgColor?: string // School-specific background color requirement
}

export default function PhotoVerifier({ onPhotoAccepted, currentPhotoUrl, schoolBgColor }: Props) {
  const [preview, setPreview] = useState<string>(currentPhotoUrl || "")
  const [result, setResult] = useState<PhotoVerificationResult | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [preview])

  const analyzePhoto = useCallback(async (file: File): Promise<PhotoVerificationResult> => {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) {
          resolve(getFailResult())
          return
        }
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(getFailResult())
          return
        }

        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        // 1. Min width check (300px)
        const minWidth = { passed: img.width >= 300, value: img.width, required: 300 }

        // 2. Aspect ratio check (3:4 passport, allow 10% tolerance)
        const ratio = img.width / img.height
        const targetRatio = 3 / 4 // 0.75
        const ratioDiff = Math.abs(ratio - targetRatio)
        const aspectRatio = {
          passed: ratioDiff <= 0.15,
          value: `${img.width}:${img.height} (${ratio.toFixed(2)})`,
          required: "3:4 (0.75)"
        }

        // 3. Plain background detection
        // Sample edges of the image and check color uniformity
        const bgScore = analyzeBackgroundUniformity(ctx, img.width, img.height)
        const plainBackground = {
          passed: bgScore >= 60,
          score: bgScore,
          threshold: 60
        }

        // 4. Front-facing check (basic: check if face-like region exists in center)
        const frontFacing = analyzeFrontFacing(ctx, img.width, img.height)

        // 5. File size check (max 5MB)
        const fileSizeMB = file.size / (1024 * 1024)
        const fileSize = {
          passed: fileSizeMB <= 5,
          value: `${fileSizeMB.toFixed(1)} MB`,
          max: "5 MB"
        }

        const checks = { minWidth, aspectRatio, plainBackground, frontFacing, fileSize }
        const valid = Object.values(checks).every(c => c.passed)

        resolve({ valid, checks })
      }

      img.onerror = () => resolve(getFailResult())
      img.src = url
    })
  }, [])

  const analyzeBackgroundUniformity = (ctx: CanvasRenderingContext2D, w: number, h: number): number => {
    // Sample pixels from the four edges (top, bottom, left, right strips)
    const sampleSize = Math.min(20, Math.floor(w * 0.1))
    const samples: { r: number; g: number; b: number }[] = []

    // Optimized: sample fewer points using imageData
    const collectSamples = (x: number, y: number, width: number, height: number) => {
      try {
        const data = ctx.getImageData(x, y, width, height).data
        for (let i = 0; i < data.length; i += 16) { // Every 4th pixel
          samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
        }
      } catch { /* CORS or other error */ }
    }

    // Top edge
    collectSamples(0, 0, w, sampleSize)
    // Bottom edge
    collectSamples(0, h - sampleSize, w, sampleSize)
    // Left edge
    collectSamples(0, 0, sampleSize, h)
    // Right edge
    collectSamples(w - sampleSize, 0, sampleSize, h)

    if (samples.length === 0) return 50 // Default to moderate if can't read

    // Calculate color variance
    const avgR = samples.reduce((sum, s) => sum + s.r, 0) / samples.length
    const avgG = samples.reduce((sum, s) => sum + s.g, 0) / samples.length
    const avgB = samples.reduce((sum, s) => sum + s.b, 0) / samples.length

    // Calculate standard deviation of colors
    const variance = samples.reduce((sum, s) => {
      return sum + Math.pow(s.r - avgR, 2) + Math.pow(s.g - avgG, 2) + Math.pow(s.b - avgB, 2)
    }, 0) / (samples.length * 3)

    const stdDev = Math.sqrt(variance)

    // Lower stdDev = more uniform background
    // Score: 100 for perfectly uniform, decreasing for higher variance
    if (stdDev < 15) return 95
    if (stdDev < 25) return 85
    if (stdDev < 35) return 75
    if (stdDev < 45) return 65
    if (stdDev < 55) return 55
    if (stdDev < 70) return 45
    return 30
  }

  const analyzeFrontFacing = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Basic heuristic: check if center region has different luminance than edges (face vs background)
    try {
      const centerX = Math.floor(w * 0.3)
      const centerY = Math.floor(h * 0.15)
      const centerW = Math.floor(w * 0.4)
      const centerH = Math.floor(h * 0.5)

      const centerData = ctx.getImageData(centerX, centerY, centerW, centerH).data
      let centerLum = 0
      for (let i = 0; i < centerData.length; i += 4) {
        centerLum += 0.299 * centerData[i] + 0.587 * centerData[i + 1] + 0.114 * centerData[i + 2]
      }
      centerLum /= (centerData.length / 4)

      const edgeData = ctx.getImageData(0, 0, Math.floor(w * 0.15), h).data
      let edgeLum = 0
      for (let i = 0; i < edgeData.length; i += 4) {
        edgeLum += 0.299 * edgeData[i] + 0.587 * edgeData[i + 1] + 0.114 * edgeData[i + 2]
      }
      edgeLum /= (edgeData.length / 4)

      const lumDiff = Math.abs(centerLum - edgeLum)
      // If there's a meaningful luminance difference, likely a person against background
      return {
        passed: lumDiff > 10,
        confidence: lumDiff > 30 ? "High" : lumDiff > 15 ? "Medium" : "Low"
      }
    } catch {
      return { passed: true, confidence: "Unable to verify" }
    }
  }

  const getFailResult = (): PhotoVerificationResult => ({
    valid: false,
    checks: {
      minWidth: { passed: false, value: 0, required: 300 },
      aspectRatio: { passed: false, value: "Unknown", required: "3:4 (0.75)" },
      plainBackground: { passed: false, score: 0, threshold: 60 },
      frontFacing: { passed: false, confidence: "Failed" },
      fileSize: { passed: false, value: "Unknown", max: "5 MB" },
    }
  })

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (JPEG, PNG)")
      return
    }

    setVerifying(true)
    const url = URL.createObjectURL(file)
    setPreview(url)

    const verificationResult = await analyzePhoto(file)
    setResult(verificationResult)
    setVerifying(false)

    // Auto-accept if all checks pass
    if (verificationResult.valid) {
      onPhotoAccepted(file, url)
    }
  }, [analyzePhoto, onPhotoAccepted])

  const handleForceAccept = () => {
    if (preview && fileInputRef.current?.files?.[0]) {
      onPhotoAccepted(fileInputRef.current.files[0], preview)
    }
  }

  return (
    <div>
      {/* Hidden canvas for image analysis */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Sample Photo Reference */}
      <div style={{ marginBottom: 16, padding: 14, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 52, height: 68, borderRadius: 6, background: schoolBgColor || '#e0e7ff', border: '2px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div style={{ flex: 1, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 4 }}>📸 Photo Requirements</div>
            <ul style={{ margin: 0, paddingLeft: 14, color: '#16a34a', lineHeight: 1.8 }}>
              <li>Minimum <strong>300px</strong> width</li>
              <li>Passport size (<strong>3:4 ratio</strong>)</li>
              <li><strong>Plain/solid</strong> background</li>
              <li><strong>Front-facing</strong>, eyes visible</li>
              <li>Max file size: <strong>5 MB</strong></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#3b82f6' : preview ? (result?.valid ? '#22c55e' : '#f59e0b') : '#e2e8f0'}`,
          borderRadius: 14,
          padding: preview ? 16 : 36,
          textAlign: 'center',
          cursor: verifying ? 'wait' : 'pointer',
          background: dragOver ? '#eff6ff' : preview ? '#fafafa' : '#fafafa',
          transition: 'all 0.2s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />

        {verifying ? (
          <div>
            <div className="login-spinner" style={{ width: 28, height: 28, borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>Verifying photo...</div>
          </div>
        ) : preview ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ width: 90, height: 120, borderRadius: 8, overflow: 'hidden', border: `2px solid ${result?.valid ? '#22c55e' : '#f59e0b'}`, flexShrink: 0 }}>
              <img src={preview} alt="Photo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 180, textAlign: 'left' }}>
              {result && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: result.valid ? '#16a34a' : '#d97706', marginBottom: 8 }}>
                    {result.valid ? '✅ Photo Accepted' : '⚠️ Issues Detected'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {Object.entries(result.checks).map(([key, check]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ width: 14, height: 14, borderRadius: '50%', background: check.passed ? '#dcfce7' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>
                          {check.passed ? '✓' : '✕'}
                        </span>
                        <span style={{ color: check.passed ? '#16a34a' : '#ef4444', fontWeight: 500 }}>
                          {key === 'minWidth' && `Width: ${(check as any).value}px (min ${(check as any).required}px)`}
                          {key === 'aspectRatio' && `Ratio: ${(check as any).value}`}
                          {key === 'plainBackground' && `Background: ${(check as any).score}% uniform`}
                          {key === 'frontFacing' && `Face: ${(check as any).confidence}`}
                          {key === 'fileSize' && `Size: ${(check as any).value}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  {!result.valid && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleForceAccept() }}
                        style={{ fontSize: 11, padding: '6px 12px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Use Anyway
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreview(""); setResult(null) }}
                        style={{ fontSize: 11, padding: '6px 12px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Re-upload
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>Upload Student Photo</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Drag & drop or click to browse</div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>JPEG, PNG — Passport size, plain background</div>
          </>
        )}
      </div>
    </div>
  )
}
