"use client"
import { useState, useRef, useCallback, useEffect } from "react"

type CheckResult = {
  passed: boolean
  severity: "critical" | "warning" | "info"
  label: string
  detail: string
  tip?: string
}

type PhotoVerificationResult = {
  valid: boolean
  canOverride: boolean // true if only warnings, false if critical failures
  checks: CheckResult[]
}

type Props = {
  onPhotoAccepted: (file: File, previewUrl: string) => void
  currentPhotoUrl?: string
  schoolBgColor?: string
}

export default function PhotoVerifier({ onPhotoAccepted, currentPhotoUrl, schoolBgColor }: Props) {
  const [preview, setPreview] = useState<string>(currentPhotoUrl || "")
  const [result, setResult] = useState<PhotoVerificationResult | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [preview])

  // ──────────────────────────────────────────────────────
  // Master analysis function
  // ──────────────────────────────────────────────────────
  const analyzePhoto = useCallback(async (file: File): Promise<PhotoVerificationResult> => {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = async () => {
        const canvas = canvasRef.current
        if (!canvas) { resolve(getFailResult()); return }
        const ctx = canvas.getContext("2d")
        if (!ctx) { resolve(getFailResult()); return }

        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)

        const checks: CheckResult[] = []

        // ── 1. File Size (max 5MB) ──
        const fileSizeMB = file.size / (1024 * 1024)
        checks.push({
          passed: fileSizeMB <= 5,
          severity: "critical",
          label: "File Size",
          detail: `${fileSizeMB.toFixed(1)} MB`,
          tip: "Compress your photo or take a lower resolution picture"
        })

        // ── 2. Min Width (300px) ──
        checks.push({
          passed: img.width >= 300,
          severity: "warning",
          label: "Resolution",
          detail: `${img.width} × ${img.height}px`,
          tip: "Upload a higher resolution photo (at least 300px wide)"
        })

        // ── 3. Aspect Ratio (3:4 passport) ──
        const ratio = img.width / img.height
        const targetRatio = 3 / 4
        const ratioPassed = Math.abs(ratio - targetRatio) <= 0.2
        checks.push({
          passed: ratioPassed,
          severity: "warning",
          label: "Aspect Ratio",
          detail: `${ratio.toFixed(2)} (target: 0.75)`,
          tip: "Use a portrait (vertical) photo for best results"
        })

        // ── 4. Brightness Check ──
        const brightness = analyzeBrightness(ctx, img.width, img.height)
        const tooDark = brightness.avg < 50
        const tooBright = brightness.avg > 210
        checks.push({
          passed: !tooDark && !tooBright,
          severity: "warning",
          label: "Brightness",
          detail: tooDark ? "Too dark" : tooBright ? "Overexposed" : "Good",
          tip: tooDark ? "Take the photo in better lighting" : "Avoid direct flash or bright light"
        })

        // ── 5. Contrast Check ──
        checks.push({
          passed: brightness.contrast > 25,
          severity: "warning",
          label: "Contrast",
          detail: brightness.contrast > 25 ? "Good" : "Low",
          tip: "Ensure clear difference between subject and background"
        })

        // ── 6. Blur Detection ──
        const blurScore = detectBlur(ctx, img.width, img.height)
        checks.push({
          passed: blurScore > 15,
          severity: "warning",
          label: "Sharpness",
          detail: blurScore > 25 ? "Sharp" : blurScore > 15 ? "Acceptable" : "Blurry",
          tip: "Hold the camera steady and ensure the subject is in focus"
        })

        // ── 7. Background Uniformity ──
        const bgScore = analyzeBackgroundUniformity(ctx, img.width, img.height)
        checks.push({
          passed: bgScore >= 55,
          severity: "warning",
          label: "Background",
          detail: `${bgScore}% uniform`,
          tip: "Use a plain, solid-colored wall as background"
        })

        // ── 8. Face Detection ──
        const faceResult = await detectFace(img)
        checks.push({
          passed: faceResult.detected,
          severity: "warning",
          label: "Face Detected",
          detail: faceResult.detail,
          tip: faceResult.tip
        })

        // ── 9. Face Count ──
        if (faceResult.detected) {
          checks.push({
            passed: faceResult.count === 1,
            severity: "warning",
            label: "Single Face",
            detail: faceResult.count === 1 ? "1 face found" : `${faceResult.count} faces found`,
            tip: "Only the student's face should be in the photo — no group photos"
          })
        }

        // ── 10. Face Centering ──
        if (faceResult.detected && faceResult.bounds) {
          const faceCenterX = (faceResult.bounds.x + faceResult.bounds.width / 2) / img.width
          const faceCenterY = (faceResult.bounds.y + faceResult.bounds.height / 2) / img.height
          const offCenterX = Math.abs(faceCenterX - 0.5)
          const offCenterY = Math.abs(faceCenterY - 0.4) // Face usually in upper half

          checks.push({
            passed: offCenterX < 0.2 && offCenterY < 0.25,
            severity: "warning",
            label: "Face Centering",
            detail: offCenterX < 0.15 && offCenterY < 0.2 ? "Centered" : "Slightly off-center",
            tip: "Position your face in the center of the frame"
          })

          // ── 11. Face Size Ratio ──
          const faceHeightRatio = faceResult.bounds.height / img.height
          checks.push({
            passed: faceHeightRatio >= 0.25 && faceHeightRatio <= 0.75,
            severity: "warning",
            label: "Face Size",
            detail: faceHeightRatio < 0.25 ? "Too far away" : faceHeightRatio > 0.75 ? "Too close" : "Good",
            tip: faceHeightRatio < 0.25
              ? "Move closer to the camera — face should fill most of the frame"
              : "Move further from the camera"
          })
        }

        // ── 12. Front-Facing Heuristic ──
        const frontFacing = analyzeFrontFacing(ctx, img.width, img.height)
        checks.push({
          passed: frontFacing.passed,
          severity: "warning",
          label: "Front-Facing",
          detail: frontFacing.confidence,
          tip: "Look directly at the camera — avoid side angles"
        })

        // Determine result
        const criticalFails = checks.filter(c => !c.passed && c.severity === "critical")
        const warningFails = checks.filter(c => !c.passed && c.severity === "warning")
        const valid = criticalFails.length === 0 && warningFails.length === 0
        const canOverride = criticalFails.length === 0 // Only allow override if no critical fails

        resolve({ valid, canOverride, checks })
      }

      img.onerror = () => resolve(getFailResult())
      img.src = url
    })
  }, [])

  // ──────────────────────────────────────────────────────
  // Analysis Helpers
  // ──────────────────────────────────────────────────────

  const analyzeBrightness = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    // Sample center region (where face should be)
    const cx = Math.floor(w * 0.2)
    const cy = Math.floor(h * 0.1)
    const cw = Math.floor(w * 0.6)
    const ch = Math.floor(h * 0.7)

    try {
      const data = ctx.getImageData(cx, cy, cw, ch).data
      let totalLum = 0
      let count = 0
      const lums: number[] = []

      for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        totalLum += lum
        lums.push(lum)
        count++
      }

      const avg = totalLum / count
      // Standard deviation for contrast
      const variance = lums.reduce((s, l) => s + (l - avg) ** 2, 0) / count
      const contrast = Math.sqrt(variance)

      return { avg: Math.round(avg), contrast: Math.round(contrast) }
    } catch {
      return { avg: 128, contrast: 50 }
    }
  }

  const detectBlur = (ctx: CanvasRenderingContext2D, w: number, h: number): number => {
    // Laplacian-based blur detection on center region
    try {
      const cx = Math.floor(w * 0.25)
      const cy = Math.floor(h * 0.15)
      const cw = Math.floor(w * 0.5)
      const ch = Math.floor(h * 0.5)

      const data = ctx.getImageData(cx, cy, cw, ch).data
      const grayscale: number[] = []

      for (let i = 0; i < data.length; i += 4) {
        grayscale.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      }

      // Apply Laplacian kernel [0,-1,0 / -1,4,-1 / 0,-1,0]
      let sum = 0
      let count = 0
      for (let y = 1; y < ch - 1; y += 2) {
        for (let x = 1; x < cw - 1; x += 2) {
          const idx = y * cw + x
          const laplacian =
            4 * grayscale[idx] -
            grayscale[idx - 1] - grayscale[idx + 1] -
            grayscale[idx - cw] - grayscale[idx + cw]
          sum += laplacian * laplacian
          count++
        }
      }

      // Variance of Laplacian — higher = sharper
      const variance = sum / count
      return Math.round(Math.sqrt(variance))
    } catch {
      return 50 // Default to passing
    }
  }

  const analyzeBackgroundUniformity = (ctx: CanvasRenderingContext2D, w: number, h: number): number => {
    const sampleSize = Math.min(20, Math.floor(w * 0.1))
    const samples: { r: number; g: number; b: number }[] = []

    const collectSamples = (x: number, y: number, width: number, height: number) => {
      try {
        const data = ctx.getImageData(x, y, width, height).data
        for (let i = 0; i < data.length; i += 16) {
          samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
        }
      } catch { /* CORS */ }
    }

    collectSamples(0, 0, w, sampleSize)
    collectSamples(0, h - sampleSize, w, sampleSize)
    collectSamples(0, 0, sampleSize, h)
    collectSamples(w - sampleSize, 0, sampleSize, h)

    if (samples.length === 0) return 50

    const avgR = samples.reduce((s, p) => s + p.r, 0) / samples.length
    const avgG = samples.reduce((s, p) => s + p.g, 0) / samples.length
    const avgB = samples.reduce((s, p) => s + p.b, 0) / samples.length

    const variance = samples.reduce((s, p) =>
      s + (p.r - avgR) ** 2 + (p.g - avgG) ** 2 + (p.b - avgB) ** 2, 0
    ) / (samples.length * 3)

    const stdDev = Math.sqrt(variance)

    if (stdDev < 15) return 95
    if (stdDev < 25) return 85
    if (stdDev < 35) return 75
    if (stdDev < 45) return 65
    if (stdDev < 55) return 55
    if (stdDev < 70) return 45
    return 30
  }

  const analyzeFrontFacing = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    try {
      // Compare left and right halves of face region for symmetry
      const faceX = Math.floor(w * 0.25)
      const faceY = Math.floor(h * 0.1)
      const faceW = Math.floor(w * 0.5)
      const faceH = Math.floor(h * 0.5)

      const halfW = Math.floor(faceW / 2)

      const leftData = ctx.getImageData(faceX, faceY, halfW, faceH).data
      const rightData = ctx.getImageData(faceX + halfW, faceY, halfW, faceH).data

      let leftLum = 0, rightLum = 0, count = 0
      for (let i = 0; i < leftData.length && i < rightData.length; i += 16) {
        leftLum += 0.299 * leftData[i] + 0.587 * leftData[i + 1] + 0.114 * leftData[i + 2]
        rightLum += 0.299 * rightData[i] + 0.587 * rightData[i + 1] + 0.114 * rightData[i + 2]
        count++
      }

      leftLum /= count
      rightLum /= count

      const symmetryDiff = Math.abs(leftLum - rightLum)

      // Also check center vs edge luminance diff (person vs background)
      const centerData = ctx.getImageData(faceX, faceY, faceW, faceH).data
      let centerLum = 0
      for (let i = 0; i < centerData.length; i += 16) {
        centerLum += 0.299 * centerData[i] + 0.587 * centerData[i + 1] + 0.114 * centerData[i + 2]
      }
      centerLum /= (centerData.length / 16)

      const edgeData = ctx.getImageData(0, 0, Math.floor(w * 0.15), h).data
      let edgeLum = 0
      for (let i = 0; i < edgeData.length; i += 16) {
        edgeLum += 0.299 * edgeData[i] + 0.587 * edgeData[i + 1] + 0.114 * edgeData[i + 2]
      }
      edgeLum /= (edgeData.length / 16)

      const lumDiff = Math.abs(centerLum - edgeLum)
      const isSymmetric = symmetryDiff < 20
      const hasFace = lumDiff > 8

      return {
        passed: isSymmetric && hasFace,
        confidence: isSymmetric && hasFace ? "Good — frontal"
          : !hasFace ? "No clear subject detected"
          : "Possible side angle"
      }
    } catch {
      return { passed: true, confidence: "Unable to verify" }
    }
  }

  const detectFace = async (img: HTMLImageElement): Promise<{
    detected: boolean; count: number; detail: string; tip: string;
    bounds?: { x: number; y: number; width: number; height: number }
  }> => {
    // Try native FaceDetector API (Chrome/Edge)
    if (typeof window !== "undefined" && "FaceDetector" in window) {
      try {
        // @ts-ignore - FaceDetector is not in standard TypeScript types
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 })
        const faces = await detector.detect(img)

        if (faces.length === 0) {
          return { detected: false, count: 0, detail: "No face detected", tip: "Ensure your face is clearly visible and well-lit" }
        }
        if (faces.length === 1) {
          const bounds = faces[0].boundingBox
          return {
            detected: true, count: 1, detail: "Face detected ✓",
            tip: "", bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
          }
        }
        return {
          detected: true, count: faces.length,
          detail: `${faces.length} faces found`,
          tip: "Only the student should be in the photo",
          bounds: { x: faces[0].boundingBox.x, y: faces[0].boundingBox.y, width: faces[0].boundingBox.width, height: faces[0].boundingBox.height }
        }
      } catch {
        // FaceDetector might fail — fall back
      }
    }

    // Canvas-based heuristic fallback
    const canvas = canvasRef.current
    if (!canvas) return { detected: true, count: 1, detail: "Basic check passed", tip: "" }
    const ctx = canvas.getContext("2d")
    if (!ctx) return { detected: true, count: 1, detail: "Basic check passed", tip: "" }

    // Heuristic: check skin-tone pixels in center
    const cx = Math.floor(img.width * 0.25)
    const cy = Math.floor(img.height * 0.05)
    const cw = Math.floor(img.width * 0.5)
    const ch = Math.floor(img.height * 0.55)

    try {
      const data = ctx.getImageData(cx, cy, cw, ch).data
      let skinPixels = 0
      let totalSampled = 0

      for (let i = 0; i < data.length; i += 16) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        // Simple skin-tone detection (works for various skin tones)
        const isSkin = (
          r > 60 && g > 40 && b > 20 &&
          r > g && r > b &&
          Math.abs(r - g) > 10 &&
          r - b > 15
        ) || (
          // Darker skin tones
          r > 40 && g > 30 && b > 15 &&
          r > b && g > b &&
          r - b > 5
        )
        if (isSkin) skinPixels++
        totalSampled++
      }

      const skinRatio = skinPixels / totalSampled
      if (skinRatio > 0.08) {
        // Estimate face bounds from skin region center
        return {
          detected: true, count: 1,
          detail: "Face likely present",
          tip: "",
          bounds: {
            x: Math.floor(img.width * 0.3),
            y: Math.floor(img.height * 0.08),
            width: Math.floor(img.width * 0.4),
            height: Math.floor(img.height * 0.45)
          }
        }
      } else {
        return {
          detected: false, count: 0,
          detail: "No clear face found",
          tip: "Ensure face is visible, well-lit, and facing the camera"
        }
      }
    } catch {
      return { detected: true, count: 1, detail: "Basic check passed", tip: "" }
    }
  }

  const getFailResult = (): PhotoVerificationResult => ({
    valid: false,
    canOverride: false,
    checks: [{
      passed: false, severity: "critical",
      label: "File Error", detail: "Could not read image",
      tip: "Try a different image file"
    }]
  })

  // ──────────────────────────────────────────────────────
  // Auto-Adjust / Auto-Crop (3:4)
  // ──────────────────────────────────────────────────────
  const performAutoAdjust = async (url: string): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = async () => {
        const faceResult = await detectFace(img)
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        
        if (!ctx) {
           return fetch(url).then(r => r.blob()).then(b => resolve(new File([b], "photo.jpg", {type: "image/jpeg"})))
        }

        let sx = 0, sy = 0, sw = img.width, sh = img.height
        const targetRatio = 3 / 4 // Passport aspect ratio

        if (faceResult.detected && faceResult.bounds) {
          const { x, y, width: fw, height: fh } = faceResult.bounds
          const cx = x + fw / 2
          const cy = y + fh / 2

          // Target width: face should be ~45% of the image width
          let targetW = fw * 2.22
          let targetH = targetW / targetRatio

          // Clamp max size to original image dimensions safely
          if (targetW > img.width || targetH > img.height) {
            if (img.width / img.height > targetRatio) {
              targetH = img.height
              targetW = targetH * targetRatio
            } else {
              targetW = img.width
              targetH = targetW / targetRatio
            }
          }

          let cropX = cx - targetW / 2
          let cropY = cy - targetH * 0.35 // Face positioned slightly above center

          // Boundary safe-checks
          if (cropX < 0) cropX = 0
          if (cropY < 0) cropY = 0
          if (cropX + targetW > img.width) cropX = img.width - targetW
          if (cropY + targetH > img.height) cropY = img.height - targetH

          sx = cropX; sy = cropY; sw = targetW; sh = targetH
        } else {
           // Center crop to 3:4 if no face detected
           if (img.width / img.height > targetRatio) {
              sh = img.height
              sw = sh * targetRatio
              sx = (img.width - sw) / 2
           } else {
              sw = img.width
              sh = sw / targetRatio
              sy = (img.height - sh) / 2
           }
        }

        // Output size normalized
        canvas.width = Math.max(600, sw)
        canvas.height = canvas.width / targetRatio

        // Apply slight enhancement filters (fixes dark photos)
        ctx.filter = 'contrast(1.05) saturate(1.05) brightness(1.05)'
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], "auto-adjusted.jpg", { type: "image/jpeg" }))
          } else {
            fetch(url).then(r => r.blob()).then(b => resolve(new File([b], "photo.jpg", {type: "image/jpeg"})))
          }
        }, "image/jpeg", 0.95)
      }
      img.onerror = () => fetch(url).then(r => r.blob()).then(b => resolve(new File([b], "photo.jpg", {type: "image/jpeg"})))
      img.src = url
    })
  }

  // ──────────────────────────────────────────────────────
  // File handling
  // ──────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (JPEG, PNG)")
      return
    }

    setVerifying(true)
    const originalUrl = URL.createObjectURL(file)
    
    // Auto-adjust (crop to face + fix lighting) BEFORE analysis
    const adjustedFile = await performAutoAdjust(originalUrl)
    const newPreviewUrl = URL.createObjectURL(adjustedFile)
    
    setPreview(newPreviewUrl)
    const verificationResult = await analyzePhoto(adjustedFile)
    
    setResult(verificationResult)
    setVerifying(false)

    if (verificationResult.valid) {
      onPhotoAccepted(adjustedFile, newPreviewUrl)
    }
  }, [analyzePhoto, onPhotoAccepted])

  const handleForceAccept = () => {
    if (preview && fileInputRef.current?.files?.[0]) {
      onPhotoAccepted(fileInputRef.current.files[0], preview)
    }
  }

  // ──────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────
  const passedChecks = result?.checks.filter(c => c.passed) || []
  const failedChecks = result?.checks.filter(c => !c.passed) || []
  const criticalFails = failedChecks.filter(c => c.severity === "critical")
  const warningFails = failedChecks.filter(c => c.severity === "warning")

  return (
    <div>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Photo Requirements Card */}
      <div style={{
        marginBottom: 16, padding: 14, background: '#f0fdf4',
        borderRadius: 12, border: '1px solid #bbf7d0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 52, height: 68, borderRadius: 6,
            background: schoolBgColor || '#e0e7ff',
            border: '2px solid #c7d2fe',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div style={{ flex: 1, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 4 }}>📸 Photo Requirements</div>
            <ul style={{ margin: 0, paddingLeft: 14, color: '#16a34a', lineHeight: 1.8 }}>
              <li>Minimum <strong>300px</strong> width</li>
              <li>Passport size (<strong>3:4 ratio</strong>)</li>
              <li><strong>Plain/solid</strong> background</li>
              <li><strong>Front-facing</strong>, eyes visible</li>
              <li><strong>Not blurry</strong>, good lighting</li>
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
          border: `2px dashed ${dragOver ? '#3b82f6' : preview ? (result?.valid ? '#22c55e' : result?.canOverride ? '#f59e0b' : '#ef4444') : '#e2e8f0'}`,
          borderRadius: 14,
          padding: preview ? 16 : 36,
          textAlign: 'center',
          cursor: verifying ? 'wait' : 'pointer',
          background: dragOver ? '#eff6ff' : '#fafafa',
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
            <div className="login-spinner" style={{
              width: 28, height: 28,
              borderColor: 'rgba(59,130,246,0.2)', borderTopColor: '#3b82f6',
              margin: '0 auto 8px'
            }} />
            <div style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>
              Analyzing photo (12 checks)...
            </div>
          </div>
        ) : preview ? (
          <div style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            flexWrap: 'wrap', justifyContent: 'center'
          }}>
            {/* Photo Preview */}
            <div style={{
              width: 90, height: 120, borderRadius: 8, overflow: 'hidden',
              border: `2px solid ${result?.valid ? '#22c55e' : result?.canOverride ? '#f59e0b' : '#ef4444'}`,
              flexShrink: 0
            }}>
              <img src={preview} alt="Photo preview" style={{
                width: '100%', height: '100%', objectFit: 'cover'
              }} />
            </div>

            {/* Results Panel */}
            <div style={{ flex: 1, minWidth: 180, textAlign: 'left' }}>
              {result && (
                <div>
                  {/* Header */}
                  <div style={{
                    fontSize: 14, fontWeight: 700, marginBottom: 8,
                    color: result.valid ? '#16a34a' : criticalFails.length > 0 ? '#dc2626' : '#d97706'
                  }}>
                    {result.valid
                      ? '✅ All Checks Passed!'
                      : criticalFails.length > 0
                        ? `❌ ${criticalFails.length} Critical Issue${criticalFails.length > 1 ? 's' : ''}`
                        : `⚠️ ${warningFails.length} Warning${warningFails.length > 1 ? 's' : ''}`
                    }
                  </div>

                  {/* Score Bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{
                      height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: result.valid
                          ? '#22c55e'
                          : result.canOverride ? '#f59e0b' : '#ef4444',
                        width: `${Math.round((passedChecks.length / result.checks.length) * 100)}%`,
                        transition: 'width 0.5s'
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {passedChecks.length}/{result.checks.length} checks passed
                    </div>
                  </div>

                  {/* Failed Checks First */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {failedChecks.map((check, i) => (
                      <div key={`fail-${i}`} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12,
                        padding: '4px 8px', borderRadius: 6,
                        background: check.severity === 'critical' ? '#fef2f2' : '#fffbeb'
                      }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                          background: check.severity === 'critical' ? '#fecaca' : '#fde68a',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, marginTop: 1
                        }}>✕</span>
                        <div>
                          <span style={{
                            color: check.severity === 'critical' ? '#dc2626' : '#d97706',
                            fontWeight: 600
                          }}>
                            {check.label}: {check.detail}
                          </span>
                          {check.tip && (
                            <div style={{
                              fontSize: 10, color: '#94a3b8', marginTop: 1
                            }}>💡 {check.tip}</div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Passed Checks (collapsed) */}
                    {passedChecks.length > 0 && (
                      <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4
                      }}>
                        {passedChecks.map((check, i) => (
                          <span key={`pass-${i}`} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: '#dcfce7', color: '#16a34a', fontWeight: 500
                          }}>
                            ✓ {check.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {!result.valid && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      {result.canOverride && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleForceAccept() }}
                          style={{
                            fontSize: 11, padding: '6px 12px', background: '#f59e0b',
                            color: 'white', border: 'none', borderRadius: 6,
                            cursor: 'pointer', fontWeight: 600
                          }}
                        >
                          Use Anyway
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreview(""); setResult(null) }}
                        style={{
                          fontSize: 11, padding: '6px 12px', background: '#f1f5f9',
                          color: '#64748b', border: 'none', borderRadius: 6,
                          cursor: 'pointer', fontWeight: 600
                        }}
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
            <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Upload Student Photo
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Drag & drop or click to browse</div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
              JPEG, PNG — Passport size, plain background
            </div>
          </>
        )}
      </div>
    </div>
  )
}
