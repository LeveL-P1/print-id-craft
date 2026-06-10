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
  canOverride: boolean
  checks: CheckResult[]
}

type Props = {
  onPhotoAccepted: (file: File, previewUrl: string, bgQualityGood?: boolean) => void
  currentPhotoUrl?: string
  schoolBgColor?: string
}

type CameraPermissionState = "prompt" | "granted" | "denied" | "unsupported" | "checking"

export default function PhotoVerifier({ onPhotoAccepted, currentPhotoUrl, schoolBgColor }: Props) {
  const [preview, setPreview] = useState<string>(currentPhotoUrl || "")
  const [result, setResult] = useState<PhotoVerificationResult | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastAdjustedFileRef = useRef<File | null>(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState("")
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraPermission, setCameraPermission] = useState<CameraPermissionState>("checking")
  const [permissionRequested, setPermissionRequested] = useState(false)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")

  // ──────────────────────────────────────────────────────
  // Proactive Camera Permission Check & Request
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    checkCameraPermission()
  }, [])

  const checkCameraPermission = async () => {
    // Check if camera API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraPermission("unsupported")
      return
    }

    // Use Permissions API if available to check current state
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permResult = await navigator.permissions.query({ name: "camera" as PermissionName })
        setCameraPermission(permResult.state as CameraPermissionState)

        // Listen for changes
        permResult.addEventListener("change", () => {
          setCameraPermission(permResult.state as CameraPermissionState)
        })

        // If permission state is "prompt", proactively request it
        if (permResult.state === "prompt") {
          requestCameraPermission()
        }
        return
      }
    } catch {
      // Permissions API not available for camera in some browsers
    }

    // Fallback: proactively request camera to trigger browser permission dialog
    requestCameraPermission()
  }

  const requestCameraPermission = async () => {
    if (permissionRequested) return
    setPermissionRequested(true)
    setCameraPermission("checking")

    try {
      // Request camera access — this triggers the browser's permission dialog
      const testStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      })
      // Permission granted — stop the test stream immediately
      testStream.getTracks().forEach(t => t.stop())
      setCameraPermission("granted")
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setCameraPermission("denied")
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setCameraPermission("unsupported")
      } else {
        setCameraPermission("prompt")
      }
    }
  }

  // ──────────────────────────────────────────────────────
  // Camera helpers
  // ──────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
      setStream(null)
    }
    setCameraActive(false)
  }, [stream])

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startCamera = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setCameraError("")

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera API not supported in this browser. Please use a modern browser or upload a file instead.")
      return
    }

    if (cameraPermission === "denied") {
      setCameraError("Camera permission was denied. Please click the camera/lock icon in your browser's address bar → Allow Camera → Reload the page, then try again.")
      return
    }

    try {
      let s: MediaStream
      try {
        // Use current facingMode (user = front, environment = back)
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false
        })
      } catch {
        // Desktop/fallback: any available camera
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }

      setStream(s)
      setCameraActive(true)
      setCameraPermission("granted")
      // Wait for React to render the video element, then attach
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
      }, 100)
    } catch (err: any) {
      console.error("Camera error:", err)
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setCameraPermission("denied")
        setCameraError("Camera permission was denied. To fix this:\n1. Click the 🔒 lock icon (or camera icon) in your browser's address bar\n2. Set Camera to 'Allow'\n3. Reload the page\n\nOr simply upload a photo file instead.")
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setCameraPermission("unsupported")
        setCameraError("No camera found on this device. Please upload a photo file instead.")
      } else {
        setCameraError(`Camera error: ${err?.message || "Unknown error"}. Please upload a photo file instead.`)
      }
    }
  }

  const takePhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement("canvas")
    const w = video.videoWidth || 720
    const h = video.videoHeight || 960
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (ctx) {
      // Mirror horizontally only for front camera (selfie)
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" })
          stopCamera()
          handleFile(file)
        }
      }, "image/jpeg", 0.95)
    }
  }

  const flipCamera = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const newMode = facingMode === "user" ? "environment" : "user"
    setFacingMode(newMode)

    // Stop current stream
    if (stream) {
      stream.getTracks().forEach(t => t.stop())
    }

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode, width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false
      })
      setStream(s)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.play().catch(() => {})
        }
      }, 100)
    } catch {
      // If the requested facing mode isn't available, revert
      setCameraError("This device may not have a second camera. Using the available camera.")
      setFacingMode(facingMode)
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        setStream(s)
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = s
            videoRef.current.play().catch(() => {})
          }
        }, 100)
      } catch { /* ignore */ }
    }
  }

  // ──────────────────────────────────────────────────────
  // Master photo analysis
  // ──────────────────────────────────────────────────────
  const analyzePhoto = useCallback(async (file: File): Promise<PhotoVerificationResult> => {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = async () => {
        const canvas = canvasRef.current
        if (!canvas) { URL.revokeObjectURL(url); resolve(getFailResult()); return }
        const ctx = canvas.getContext("2d")
        if (!ctx) { URL.revokeObjectURL(url); resolve(getFailResult()); return }

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

        // ── 2. File Type Check ──
        const validTypes = ["image/jpeg", "image/png", "image/webp"]
        checks.push({
          passed: validTypes.includes(file.type),
          severity: "critical",
          label: "File Type",
          detail: file.type.split('/')[1]?.toUpperCase() || "Unknown",
          tip: "Upload a JPEG, PNG, or WebP image"
        })

        // ── 3. Min Width (300px) ──
        checks.push({
          passed: img.width >= 300,
          severity: "warning",
          label: "Resolution",
          detail: `${img.width} × ${img.height}px`,
          tip: "Upload a higher resolution photo (at least 300px wide)"
        })

        // ── 4. Aspect Ratio (3:4 passport) ──
        const ratio = img.width / img.height
        const targetRatio = 3 / 4
        const ratioPassed = Math.abs(ratio - targetRatio) <= 0.2
        checks.push({
          passed: ratioPassed,
          severity: "warning",
          label: "Aspect Ratio",
          detail: `${ratio.toFixed(2)} (target: 0.75)`,
          tip: "Use a portrait (vertical) photo — it will be auto-cropped to 3:4"
        })

        // ── 5. Orientation Check (portrait preferred) ──
        checks.push({
          passed: img.height >= img.width,
          severity: "info",
          label: "Orientation",
          detail: img.height >= img.width ? "Portrait ✓" : "Landscape — will be cropped",
          tip: "Hold your phone vertically for best results"
        })

        // ── 6. Brightness Check ──
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

        // ── 7. Contrast Check ──
        checks.push({
          passed: brightness.contrast > 25,
          severity: "warning",
          label: "Contrast",
          detail: brightness.contrast > 25 ? "Good" : "Low",
          tip: "Ensure clear difference between subject and background"
        })

        // ── 8. Blur Detection ──
        // Threshold lowered (15 → 8) because the previous value rejected
        // many in-focus phone-camera shots — phone JPEGs are heavily
        // denoised, which suppresses the high-frequency content the
        // Laplacian variance measures. We still flag genuinely smeared
        // images but no longer reject normal phone selfies.
        const blurScore = detectBlur(ctx, img.width, img.height)
        checks.push({
          passed: blurScore > 8,
          severity: "warning",
          label: "Sharpness",
          detail: blurScore > 20 ? "Sharp" : blurScore > 8 ? "Acceptable" : "Blurry",
          tip: "Hold the camera steady and ensure the subject is in focus"
        })

        // ── 9. Background Uniformity ──
        // We now require BOTH high uniformity AND a colour match against the
        // school's selected template colour before we can safely skip the AI
        // background-replacement step. A "plain but wrong colour" background
        // (e.g. blue wall when the school wants red) still needs AI re-colour.
        // The decision is exposed via a custom property `_bgQualityGood` on
        // the check object so handleFile() can read it without re-running the
        // analysis.
        const bg = analyzeBackgroundUniformity(ctx, img.width, img.height)
        const target = parseColor(schoolBgColor)
        const detectedColorDistance = target ? Math.round(colorDistance(bg.dominantRgb, target)) : null
        // Uniform enough to call "plain": score >= 75 AND dominant bin > 60%.
        const isUniform = bg.score >= 75 && bg.dominantRatio >= 0.6
        // "Matches school colour" within ΔE ≈ 50 (lenient — JPEG colour shift,
        // ambient light, slight camera WB differences are normal).
        const matchesSchool = target !== null && detectedColorDistance !== null && detectedColorDistance < 50
        const bgQualityGood = isUniform && (target === null || matchesSchool)
        const bgDetail =
          !isUniform
            ? `${bg.score}% uniform — mixed background`
            : matchesSchool
              ? `Plain & matches school colour ✓`
              : target
                ? `Plain but wrong colour — AI will recolour to school's choice`
                : `${bg.score}% uniform`
        checks.push({
          passed: isUniform,
          severity: "warning",
          label: "Background",
          detail: bgDetail,
          tip: target
            ? `For fastest results, take the photo against a plain wall in the school's colour. Otherwise our AI will replace it.`
            : `Use a plain, solid-coloured wall as background.`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(({ _bgQualityGood: bgQualityGood } as any)),
        })

        // ── 10. Face Detection (CRITICAL for ID cards) ──
        const faceResult = await detectFace(img)
        checks.push({
          passed: faceResult.detected,
          severity: "critical",
          label: "Face Detected",
          detail: faceResult.detail,
          tip: faceResult.tip || "Upload a clear front-facing photo of your face for the ID card"
        })

        // ── 11. Face Count ──
        if (faceResult.detected) {
          checks.push({
            passed: faceResult.count === 1,
            severity: "critical",
            label: "Single Face",
            detail: faceResult.count === 1 ? "1 face found" : `${faceResult.count} faces found`,
            tip: "Only the student's face should be in the photo — no group photos"
          })
        }

        // ── 12. Face Centering ──
        if (faceResult.detected && faceResult.bounds) {
          const faceCenterX = (faceResult.bounds.x + faceResult.bounds.width / 2) / img.width
          const faceCenterY = (faceResult.bounds.y + faceResult.bounds.height / 2) / img.height
          const offCenterX = Math.abs(faceCenterX - 0.5)
          const offCenterY = Math.abs(faceCenterY - 0.4)

          checks.push({
            passed: offCenterX < 0.2 && offCenterY < 0.25,
            severity: "critical",
            label: "Face Centering",
            detail: offCenterX < 0.15 && offCenterY < 0.2 ? "Centered" : "Face is off-center",
            tip: "Position your face in the center of the frame"
          })

          // ── 13. Face Size Ratio ──
          const faceHeightRatio = faceResult.bounds.height / img.height
          checks.push({
            passed: faceHeightRatio >= 0.20 && faceHeightRatio <= 0.75,
            severity: "critical",
            label: "Face Size",
            detail: faceHeightRatio < 0.20 ? "Too far / no face visible" : faceHeightRatio > 0.75 ? "Too close" : "Good",
            tip: faceHeightRatio < 0.20
              ? "Move closer — your face should fill 30-60% of the frame"
              : "Move further from the camera"
          })
        }

        // ── 14. Front-Facing Heuristic ──
        // Demoted from "critical" to "warning": this is just a luminance-
        // symmetry check between the left/right halves of the face region,
        // which fails on uneven lighting (window on one side), tilted
        // heads, or strong backgrounds — none of which justify rejecting
        // an otherwise good ID photo. The browser FaceDetector + Face
        // Centering already cover the real "is the face in frame" case.
        const frontFacing = analyzeFrontFacing(ctx, img.width, img.height)
        checks.push({
          passed: frontFacing.passed,
          severity: "warning",
          label: "Front-Facing",
          detail: frontFacing.confidence,
          tip: "Look directly at the camera — avoid side angles. ID cards require a front-facing photo."
        })

        // ── 15. Color Cast / White Balance Check ──
        const colorCast = analyzeColorCast(ctx, img.width, img.height)
        checks.push({
          passed: colorCast.passed,
          severity: "info",
          label: "Color Balance",
          detail: colorCast.detail,
          tip: colorCast.tip
        })

        // ── 16. Occlusion Check (eyes/face visible) ──
        if (faceResult.detected && faceResult.bounds) {
          const occlusion = analyzeOcclusion(ctx, img.width, img.height, faceResult.bounds)
          checks.push({
            passed: occlusion.passed,
            severity: "critical",
            label: "Face Visible",
            detail: occlusion.detail,
            tip: occlusion.tip || "Eyes, nose, and mouth must be clearly visible"
          })
        }

        // ── 16b. Eyes Visible (no dark/reflective sunglasses) ──
        if (faceResult.detected && faceResult.bounds) {
          const eyes = analyzeEyesVisible(ctx, img.width, img.height, faceResult.bounds)
          checks.push({
            passed: eyes.passed,
            severity: "critical",
            label: "Eyes Visible",
            detail: eyes.detail,
            tip: eyes.tip || "Remove sunglasses or dark/reflective glasses — eyes must be clearly visible"
          })
        }

        // ── 16c. Proper Attire (no bare shoulders / sleeveless) ──
        if (faceResult.detected && faceResult.bounds) {
          const attire = analyzeAttire(ctx, img.width, img.height, faceResult.bounds)
          checks.push({
            passed: attire.passed,
            severity: "critical",
            label: "Proper Attire",
            detail: attire.detail,
            tip: attire.tip || "Wear a proper shirt or school uniform — sleeveless / bare-shoulder photos are not accepted"
          })
        }

        // ── 17. Content Appropriateness Check ──
        // Demoted from "critical" to "warning". This is a pure skin-pixel
        // heuristic that gives lots of false positives — orange/red/yellow
        // shirts read as skin, dark-skinned subjects fall outside the tuned
        // range, etc. We still surface the suggestion but never hard-block
        // a portrait that has already passed Face Detected + Face Centering
        // + Front-Facing.
        const contentCheck = analyzeContentAppropriateness(ctx, img.width, img.height, faceResult)
        checks.push({
          passed: contentCheck.passed,
          severity: "warning",
          label: "ID Photo Content",
          detail: contentCheck.detail,
          tip: contentCheck.tip
        })

        URL.revokeObjectURL(url)
        const criticalFails = checks.filter(c => !c.passed && c.severity === "critical")
        const warningFails = checks.filter(c => !c.passed && c.severity === "warning")
        const valid = criticalFails.length === 0 && warningFails.length === 0
        const canOverride = criticalFails.length === 0

        resolve({ valid, canOverride, checks })
      }

      img.onerror = () => { URL.revokeObjectURL(url); resolve(getFailResult()) }
      img.src = url
    })
  }, [])

  // ──────────────────────────────────────────────────────
  // Analysis Helpers
  // ──────────────────────────────────────────────────────

  const analyzeBrightness = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const cx = Math.floor(w * 0.2), cy = Math.floor(h * 0.1)
    const cw = Math.floor(w * 0.6), ch = Math.floor(h * 0.7)
    try {
      const data = ctx.getImageData(cx, cy, cw, ch).data
      let totalLum = 0, count = 0
      const lums: number[] = []
      for (let i = 0; i < data.length; i += 16) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        totalLum += lum; lums.push(lum); count++
      }
      const avg = totalLum / count
      const variance = lums.reduce((s, l) => s + (l - avg) ** 2, 0) / count
      return { avg: Math.round(avg), contrast: Math.round(Math.sqrt(variance)) }
    } catch { return { avg: 128, contrast: 50 } }
  }

  const detectBlur = (ctx: CanvasRenderingContext2D, w: number, h: number): number => {
    try {
      const cx = Math.floor(w * 0.25), cy = Math.floor(h * 0.15)
      const cw = Math.floor(w * 0.5), ch = Math.floor(h * 0.5)
      const data = ctx.getImageData(cx, cy, cw, ch).data
      const grayscale: number[] = []
      for (let i = 0; i < data.length; i += 4) {
        grayscale.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      }
      let sum = 0, count = 0
      for (let y = 1; y < ch - 1; y += 2) {
        for (let x = 1; x < cw - 1; x += 2) {
          const idx = y * cw + x
          const laplacian = 4 * grayscale[idx] - grayscale[idx - 1] - grayscale[idx + 1] - grayscale[idx - cw] - grayscale[idx + cw]
          sum += laplacian * laplacian; count++
        }
      }
      return Math.round(Math.sqrt(sum / count))
    } catch { return 50 }
  }

  // Analyses the edge bands of the photo (top, bottom, left strips — we skip
  // the bottom-centre where shoulders sit) and reports three things needed by
  // the caller:
  //   • score        — 0-100 uniformity score; higher means more "plain"
  //   • dominantRgb  — most common edge colour (the apparent background)
  //   • dominantRatio — fraction of edge pixels matching the dominant bin
  //                     (rejects 50/50 white-window/dark-wall splits which
  //                     have low stdDev per channel but obviously aren't plain)
  // The previous implementation used only stdDev and over-rated mixed
  // backgrounds (window-frames, curtains) as "uniform".
  const analyzeBackgroundUniformity = (
    ctx: CanvasRenderingContext2D, w: number, h: number
  ): { score: number; dominantRgb: { r: number; g: number; b: number }; dominantRatio: number } => {
    type RGB = { r: number; g: number; b: number }
    const samples: RGB[] = []
    const collectSamples = (x: number, y: number, width: number, height: number) => {
      try {
        const data = ctx.getImageData(x, y, width, height).data
        for (let i = 0; i < data.length; i += 16) {
          samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
        }
      } catch { /* CORS — ignore this band */ }
    }
    const topBand = Math.max(20, Math.floor(h * 0.12))
    const sideBand = Math.max(20, Math.floor(w * 0.10))
    // Edge strips only: top, top-left, top-right. We deliberately skip the
    // bottom strip because that's where shoulders / clothing sit in a
    // head-and-shoulders portrait and would dilute the background sample.
    collectSamples(0, 0, w, topBand)
    collectSamples(0, topBand, sideBand, Math.floor(h * 0.55))
    collectSamples(w - sideBand, topBand, sideBand, Math.floor(h * 0.55))

    if (samples.length === 0) {
      return { score: 50, dominantRgb: { r: 255, g: 255, b: 255 }, dominantRatio: 0 }
    }

    // Quantised colour histogram (4 bits/channel = 4096 bins) — robust to JPEG
    // noise. Each bin is 16 RGB units wide, which corresponds visually to
    // "the same colour" for background-detection purposes.
    const hist = new Map<number, number>()
    for (const p of samples) {
      const bin = ((p.r >> 4) << 8) | ((p.g >> 4) << 4) | (p.b >> 4)
      hist.set(bin, (hist.get(bin) || 0) + 1)
    }
    let topBin = 0, topCount = 0
    // Use Array.from to keep tsconfig compatibility (no --downlevelIteration).
    Array.from(hist.entries()).forEach(([bin, count]) => {
      if (count > topCount) { topCount = count; topBin = bin }
    })
    const dominantRatio = topCount / samples.length

    // Average inside the dominant bin gives us the representative colour.
    const dR = (topBin >> 8) & 0xf, dG = (topBin >> 4) & 0xf, dB = topBin & 0xf
    const minR = dR * 16, minG = dG * 16, minB = dB * 16
    let sR = 0, sG = 0, sB = 0, n = 0
    for (const p of samples) {
      if (p.r >= minR && p.r < minR + 16 && p.g >= minG && p.g < minG + 16 && p.b >= minB && p.b < minB + 16) {
        sR += p.r; sG += p.g; sB += p.b; n++
      }
    }
    const dominantRgb = n > 0
      ? { r: Math.round(sR / n), g: Math.round(sG / n), b: Math.round(sB / n) }
      : { r: minR + 8, g: minG + 8, b: minB + 8 }

    // Score combines (a) stdDev across samples and (b) how concentrated the
    // dominant bin is. A photo with a single solid wall has very high
    // dominantRatio AND low stdDev; a curtain+window scene has low ratio
    // and high stdDev → low score.
    const avgR = samples.reduce((s, p) => s + p.r, 0) / samples.length
    const avgG = samples.reduce((s, p) => s + p.g, 0) / samples.length
    const avgB = samples.reduce((s, p) => s + p.b, 0) / samples.length
    const variance = samples.reduce(
      (s, p) => s + (p.r - avgR) ** 2 + (p.g - avgG) ** 2 + (p.b - avgB) ** 2, 0
    ) / (samples.length * 3)
    const stdDev = Math.sqrt(variance)

    // stdDev → 0-50 points
    let stdScore = 50
    if (stdDev > 70) stdScore = 0
    else if (stdDev > 55) stdScore = 10
    else if (stdDev > 45) stdScore = 20
    else if (stdDev > 35) stdScore = 30
    else if (stdDev > 25) stdScore = 40
    // dominantRatio → 0-50 points (heavy weight — most reliable signal)
    let domScore = 0
    if (dominantRatio > 0.85) domScore = 50
    else if (dominantRatio > 0.70) domScore = 40
    else if (dominantRatio > 0.55) domScore = 25
    else if (dominantRatio > 0.40) domScore = 10
    return { score: Math.min(100, stdScore + domScore), dominantRgb, dominantRatio }
  }

  // Parse "#RRGGBB" / "rgb(r,g,b)" into an {r,g,b} object — small helper for
  // comparing the detected dominant background colour against the school's
  // selected template colour.
  const parseColor = (input: string | undefined): { r: number; g: number; b: number } | null => {
    if (!input) return null
    const hex = input.trim().replace(/^#/, "")
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      }
    }
    const m = input.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (m) return { r: +m[1], g: +m[2], b: +m[3] }
    return null
  }
  // Euclidean RGB distance — fine for our threshold (~40 units = "same colour").
  const colorDistance = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number =>
    Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)

  const analyzeFrontFacing = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    try {
      const faceX = Math.floor(w * 0.25), faceY = Math.floor(h * 0.1)
      const faceW = Math.floor(w * 0.5), faceH = Math.floor(h * 0.5)
      const halfW = Math.floor(faceW / 2)
      const leftData = ctx.getImageData(faceX, faceY, halfW, faceH).data
      const rightData = ctx.getImageData(faceX + halfW, faceY, halfW, faceH).data
      let leftLum = 0, rightLum = 0, count = 0
      for (let i = 0; i < leftData.length && i < rightData.length; i += 16) {
        leftLum += 0.299 * leftData[i] + 0.587 * leftData[i + 1] + 0.114 * leftData[i + 2]
        rightLum += 0.299 * rightData[i] + 0.587 * rightData[i + 1] + 0.114 * rightData[i + 2]
        count++
      }
      leftLum /= count; rightLum /= count
      const symmetryDiff = Math.abs(leftLum - rightLum)
      const centerData = ctx.getImageData(faceX, faceY, faceW, faceH).data
      let centerLum = 0
      for (let i = 0; i < centerData.length; i += 16) centerLum += 0.299 * centerData[i] + 0.587 * centerData[i + 1] + 0.114 * centerData[i + 2]
      centerLum /= (centerData.length / 16)
      const edgeData = ctx.getImageData(0, 0, Math.floor(w * 0.15), h).data
      let edgeLum = 0
      for (let i = 0; i < edgeData.length; i += 16) edgeLum += 0.299 * edgeData[i] + 0.587 * edgeData[i + 1] + 0.114 * edgeData[i + 2]
      edgeLum /= (edgeData.length / 16)
      const isSymmetric = symmetryDiff < 20
      const hasFace = Math.abs(centerLum - edgeLum) > 8
      return {
        passed: isSymmetric && hasFace,
        confidence: isSymmetric && hasFace ? "Good — frontal" : !hasFace ? "No clear subject detected" : "Possible side angle"
      }
    } catch { return { passed: true, confidence: "Unable to verify" } }
  }

  // ── NEW: Color Cast / White Balance analysis ──
  const analyzeColorCast = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    try {
      // Sample the center region for overall color balance
      const cx = Math.floor(w * 0.2), cy = Math.floor(h * 0.2)
      const cw = Math.floor(w * 0.6), ch = Math.floor(h * 0.6)
      const data = ctx.getImageData(cx, cy, cw, ch).data
      let rSum = 0, gSum = 0, bSum = 0, count = 0
      for (let i = 0; i < data.length; i += 16) {
        rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; count++
      }
      const avgR = rSum / count, avgG = gSum / count, avgB = bSum / count
      const maxDiff = Math.max(
        Math.abs(avgR - avgG),
        Math.abs(avgG - avgB),
        Math.abs(avgR - avgB)
      )
      // If one channel dominates heavily, there's a color cast
      if (maxDiff > 50) {
        const dominant = avgR > avgG && avgR > avgB ? "reddish" : avgG > avgR && avgG > avgB ? "greenish" : "bluish"
        return { passed: false, detail: `${dominant} tint detected`, tip: "Take the photo under neutral (white) lighting — avoid colored lights" }
      }
      return { passed: true, detail: "Neutral", tip: "" }
    } catch { return { passed: true, detail: "OK", tip: "" } }
  }

  // ── NEW: Occlusion check (verify eyes/face region has expected features) ──
  const analyzeOcclusion = (ctx: CanvasRenderingContext2D, w: number, h: number, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      // Check the upper face region (eyes area) for sufficient detail
      const eyeY = bounds.y + bounds.height * 0.2
      const eyeH = bounds.height * 0.3
      const data = ctx.getImageData(
        Math.max(0, Math.floor(bounds.x)),
        Math.max(0, Math.floor(eyeY)),
        Math.min(Math.floor(bounds.width), w - Math.floor(bounds.x)),
        Math.min(Math.floor(eyeH), h - Math.floor(eyeY))
      ).data
      // Check variance — if very uniform, face might be covered
      let lums: number[] = []
      for (let i = 0; i < data.length; i += 8) {
        lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      }
      if (lums.length === 0) return { passed: true, detail: "OK", tip: "" }
      const avg = lums.reduce((a, b) => a + b, 0) / lums.length
      const variance = lums.reduce((s, l) => s + (l - avg) ** 2, 0) / lums.length
      const stdDev = Math.sqrt(variance)
      // Very low variance in eye region suggests face might be covered or photo is extreme close-up of plain surface
      if (stdDev < 8) {
        return { passed: false, detail: "Face may be obscured", tip: "Remove any coverings. Eyes, nose, and mouth should be clearly visible." }
      }
      return { passed: true, detail: "Clear", tip: "" }
    } catch { return { passed: true, detail: "OK", tip: "" } }
  }

  // ── NEW: Eyes Visible — detect dark/reflective sunglasses covering the eyes ──
  // Samples two small windows where the left and right eyes should be relative
  // to the detected face bounds, and compares them to a reference patch on the
  // forehead (which is typically uncovered skin). Photos with sunglasses show
  // up as either very dark eye regions, very low colour variance (uniform tint
  // lenses), or a strongly blue-biased patch (reflective mirrored lenses like
  // the sample photo). Any one of these flags a failure.
  const analyzeEyesVisible = (
    ctx: CanvasRenderingContext2D, w: number, h: number,
    bounds: { x: number; y: number; width: number; height: number }
  ): { passed: boolean; detail: string; tip?: string } => {
    try {
      const sampleRect = (rx: number, ry: number, rw: number, rh: number) => {
        const x = Math.max(0, Math.min(w - 1, Math.floor(rx)))
        const y = Math.max(0, Math.min(h - 1, Math.floor(ry)))
        const ww = Math.max(1, Math.min(w - x, Math.floor(rw)))
        const hh = Math.max(1, Math.min(h - y, Math.floor(rh)))
        const data = ctx.getImageData(x, y, ww, hh).data
        let r = 0, g = 0, b = 0, n = 0
        const lums: number[] = []
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
          lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
        }
        const avgR = r / n, avgG = g / n, avgB = b / n
        const avgL = lums.reduce((a, l) => a + l, 0) / lums.length
        const variance = lums.reduce((s, l) => s + (l - avgL) ** 2, 0) / lums.length
        return { r: avgR, g: avgG, b: avgB, lum: avgL, stdDev: Math.sqrt(variance) }
      }

      // Eye band: roughly 28-48% down the face, split into left/right thirds.
      const eyeY = bounds.y + bounds.height * 0.28
      const eyeH = bounds.height * 0.20
      const eyeW = bounds.width * 0.28
      const leftEye = sampleRect(bounds.x + bounds.width * 0.12, eyeY, eyeW, eyeH)
      const rightEye = sampleRect(bounds.x + bounds.width * 0.60, eyeY, eyeW, eyeH)
      // Forehead reference (uncovered skin).
      const forehead = sampleRect(bounds.x + bounds.width * 0.30, bounds.y + bounds.height * 0.05, bounds.width * 0.40, bounds.height * 0.12)

      const eyeLum = (leftEye.lum + rightEye.lum) / 2
      const eyeStd = (leftEye.stdDev + rightEye.stdDev) / 2

      // (1) Very dark eye region vs forehead → opaque dark sunglasses.
      if (forehead.lum - eyeLum > 55 && eyeLum < 70) {
        return { passed: false, detail: "Dark sunglasses detected" }
      }

      // (2) Very uniform eye region (low stdDev) → tinted lenses hiding eyes.
      if (eyeStd < 10 && eyeLum < 110) {
        return { passed: false, detail: "Eyes not visible" }
      }

      // (3) Strong blue cast on both eyes → reflective/mirrored lenses.
      const blueBias = (eye: { r: number; g: number; b: number }) =>
        eye.b - (eye.r + eye.g) / 2
      if (blueBias(leftEye) > 25 && blueBias(rightEye) > 25) {
        return { passed: false, detail: "Reflective sunglasses detected" }
      }

      return { passed: true, detail: "Eyes visible" }
    } catch {
      return { passed: true, detail: "OK" }
    }
  }

  // ── NEW: Proper Attire — detect bare shoulders / sleeveless / undershirt ──
  // Samples a horizontal band just below the face where the shoulders sit and
  // counts skin-tone pixels. A buttoned shirt / school uniform mostly covers
  // this band, so a high skin-ratio means the subject is either sleeveless,
  // wearing a vest/undershirt, or topless — none of which are acceptable for
  // an ID card.
  const analyzeAttire = (
    ctx: CanvasRenderingContext2D, w: number, h: number,
    bounds: { x: number; y: number; width: number; height: number }
  ): { passed: boolean; detail: string; tip?: string } => {
    try {
      // Shoulder band: starts just below the chin, ~70% the height of the
      // face, spans 2.2× the face width centred on the face.
      const bandTop = Math.floor(bounds.y + bounds.height * 1.05)
      const bandH = Math.floor(bounds.height * 0.70)
      const bandW = Math.floor(bounds.width * 2.2)
      const bandX = Math.floor(bounds.x + bounds.width / 2 - bandW / 2)

      const x = Math.max(0, bandX)
      const y = Math.max(0, bandTop)
      const ww = Math.min(w - x, bandW)
      const hh = Math.min(h - y, bandH)
      // Not enough room below the face (very tight crop) — skip the check
      // rather than false-flag.
      if (ww < 20 || hh < 20) return { passed: true, detail: "OK" }

      // Reference skin tone from a forehead patch — adapts to the subject's
      // actual complexion instead of a fixed RGB range that misfires on dark
      // or very pale skin.
      const fhData = ctx.getImageData(
        Math.max(0, Math.floor(bounds.x + bounds.width * 0.30)),
        Math.max(0, Math.floor(bounds.y + bounds.height * 0.05)),
        Math.max(1, Math.floor(bounds.width * 0.40)),
        Math.max(1, Math.floor(bounds.height * 0.12)),
      ).data
      let fr = 0, fg = 0, fb = 0, fn = 0
      for (let i = 0; i < fhData.length; i += 4) {
        fr += fhData[i]; fg += fhData[i + 1]; fb += fhData[i + 2]; fn++
      }
      const refR = fr / fn, refG = fg / fn, refB = fb / fn
      // Sanity-check the forehead actually looks like skin (R >= G >= B,
      // R reasonably above mid). If not, fall back to the classical YCbCr
      // skin-tone test.
      const refLooksLikeSkin = refR > refG && refG >= refB && refR > 95 && refR < 245

      const isSkinPixel = (r: number, g: number, b: number): boolean => {
        if (refLooksLikeSkin) {
          // Adaptive: pixel is skin if it's close to the forehead tone in
          // chrominance (allow for shading variation in luminance).
          // Compare chroma differences (r-g, r-b) which are stable under
          // shading changes — more robust than raw RGB distance.
          const refRG = refR - refG, refRB = refR - refB
          const pixRG = r - g, pixRB = r - b
          const chromaDist = Math.sqrt((pixRG - refRG) ** 2 + (pixRB - refRB) ** 2)
          // Also require the pixel to be brighter than ~60 (not pure shadow)
          // and that R >= G >= B (excludes blue/green clothing entirely).
          const lum = 0.299 * r + 0.587 * g + 0.114 * b
          return chromaDist < 28 && lum > 55 && r >= g && g >= b - 8
        }
        // Fallback YCbCr skin-tone gate (Kovac et al.) — only used if the
        // forehead sample failed sanity check.
        const Y = 0.299 * r + 0.587 * g + 0.114 * b
        const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
        const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
        return Y > 60 && Cb > 77 && Cb < 127 && Cr > 133 && Cr < 173 && r > g && g > b - 10
      }

      const data = ctx.getImageData(x, y, ww, hh).data
      let skin = 0, total = 0
      // Sample every 4th pixel for speed.
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        if (isSkinPixel(r, g, b)) skin++
        total++
      }
      if (total === 0) return { passed: true, detail: "OK" }
      const skinRatio = skin / total

      // A typical buttoned shirt/uniform leaves only the neck (~5-15% of the
      // band) showing skin. A sleeveless vest / bare shoulders push this past
      // ~32%. We use 0.35 as the threshold for comfortable false-positive
      // margin (long-sleeve white shirts on light skin sit around 15-22%).
      if (skinRatio > 0.35) {
        return {
          passed: false,
          detail: skinRatio > 0.55 ? "Bare shoulders / topless" : "Sleeveless / vest detected",
        }
      }
      return { passed: true, detail: "OK" }
    } catch {
      return { passed: true, detail: "OK" }
    }
  }

  // ── Content Appropriateness: ensures photo is a proper head-and-shoulders portrait ──
  const analyzeContentAppropriateness = (
    ctx: CanvasRenderingContext2D, w: number, h: number,
    faceResult: { detected: boolean; count: number; bounds?: { x: number; y: number; width: number; height: number } }
  ) => {
    try {
      // Check 1: If no face detected at all, this is likely not a person photo
      if (!faceResult.detected) {
        return { passed: false, detail: "No person detected", tip: "Upload a clear photo of your face — ID cards require a front-facing portrait photo" }
      }

      // Check 2: Face should be in the upper half of image (head-and-shoulders portrait)
      if (faceResult.bounds) {
        const faceTopRatio = faceResult.bounds.y / h
        const faceBotRatio = (faceResult.bounds.y + faceResult.bounds.height) / h
        // Face should start in the upper 50% of the image
        if (faceTopRatio > 0.55) {
          return { passed: false, detail: "Face not in expected position", tip: "Your face should be in the upper portion of the photo — take a head-and-shoulders portrait" }
        }
        // Face bottom should not be below 85% (face too low = not portrait)
        if (faceBotRatio > 0.90) {
          return { passed: false, detail: "Improper framing", tip: "Only your head and shoulders should be visible — not full body" }
        }
      }

      // Check 3: Skin distribution analysis
      // A valid ID portrait has skin concentrated in the face region (upper-center)
      // Inappropriate content would have skin spread across the entire image
      const sampleData = ctx.getImageData(0, 0, w, h).data

      // Count skin pixels in 4 quadrants
      let skinUpper = 0, skinLower = 0, upperTotal = 0, lowerTotal = 0
      const midY = Math.floor(h * 0.5)

      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const i = (y * w + x) * 4
          if (i >= sampleData.length - 3) continue
          const r = sampleData[i], g = sampleData[i + 1], b = sampleData[i + 2]
          const isSkin = (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 8 && r - b > 12)
            || (r > 40 && g > 30 && b > 15 && r > b && g > b && r - b > 5 && r < 120 && g < 100)
            || (r > 160 && g > 130 && b > 100 && r < 250 && r > g && Math.abs(r - g) < 40 && r - b > 20)

          if (y < midY) { upperTotal++; if (isSkin) skinUpper++ }
          else { lowerTotal++; if (isSkin) skinLower++ }
        }
      }

      const upperSkinRatio = upperTotal > 0 ? skinUpper / upperTotal : 0
      const lowerSkinRatio = lowerTotal > 0 ? skinLower / lowerTotal : 0
      const totalSkinRatio = (upperTotal + lowerTotal) > 0 ? (skinUpper + skinLower) / (upperTotal + lowerTotal) : 0

      // Thresholds intentionally generous — this heuristic is purely a
      // skin-pixel count and gives many false positives on coloured
      // clothing, dark-skinned subjects, or warm-lit walls. The browser
      // FaceDetector + Face Centering + Face Size checks already catch
      // the real "not a portrait" case; this is only here as a soft hint.
      if (lowerSkinRatio > 0.65 && upperSkinRatio < 0.08) {
        return { passed: false, detail: "Face not visible in upper area", tip: "Upload a head-and-shoulders portrait — your face must be clearly visible in the upper portion" }
      }

      if (totalSkinRatio > 0.75) {
        return { passed: false, detail: "Mostly skin-coloured pixels", tip: "If you're wearing very bright orange/red/yellow this can confuse the checker — try a different photo if you're not in proper attire." }
      }

      if (lowerSkinRatio > 0.55 && totalSkinRatio > 0.60) {
        return { passed: false, detail: "Unusual skin distribution", tip: "ID cards work best with a head-and-shoulders photo. You can still proceed if this is a valid portrait." }
      }

      return { passed: true, detail: "Valid ID portrait", tip: "" }
    } catch {
      // If analysis fails, be conservative and allow (other checks will catch issues)
      return { passed: true, detail: "OK", tip: "" }
    }
  }

  const detectFace = async (img: HTMLImageElement): Promise<{
    detected: boolean; count: number; detail: string; tip: string;
    bounds?: { x: number; y: number; width: number; height: number }
  }> => {
    if (typeof window !== "undefined" && "FaceDetector" in window) {
      try {
        // @ts-ignore
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 })
        const faces = await detector.detect(img)
        if (faces.length === 0) return { detected: false, count: 0, detail: "No face detected", tip: "Ensure your face is clearly visible and well-lit" }
        if (faces.length === 1) {
          const b = faces[0].boundingBox
          return { detected: true, count: 1, detail: "Face detected ✓", tip: "", bounds: { x: b.x, y: b.y, width: b.width, height: b.height } }
        }
        const b = faces[0].boundingBox
        return { detected: true, count: faces.length, detail: `${faces.length} faces found`, tip: "Only the student should be in the photo", bounds: { x: b.x, y: b.y, width: b.width, height: b.height } }
      } catch { /* FaceDetector might fail */ }
    }
    // Canvas-based heuristic fallback with broader skin-tone support
    const canvas = canvasRef.current
    if (!canvas) return { detected: true, count: 1, detail: "Basic check passed", tip: "" }
    const ctx = canvas.getContext("2d")
    if (!ctx) return { detected: true, count: 1, detail: "Basic check passed", tip: "" }
    const cx = Math.floor(img.width * 0.25), cy = Math.floor(img.height * 0.05)
    const cw = Math.floor(img.width * 0.5), ch = Math.floor(img.height * 0.55)
    try {
      const data = ctx.getImageData(cx, cy, cw, ch).data
      let skinPixels = 0, totalSampled = 0
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        // Broader skin-tone detection supporting diverse skin colors
        const isSkin =
          // Light to medium skin tones
          (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 10 && r - b > 15)
          // Medium to olive skin tones
          || (r > 40 && g > 30 && b > 15 && r > b && g > b && r - b > 5)
          // Darker skin tones
          || (r > 30 && g > 20 && b > 10 && r > b && g > b && (r - b) > 3 && r < 120 && g < 100)
          // Very light / fair skin (avoiding pure white bg)
          || (r > 160 && g > 130 && b > 100 && r < 250 && r > g && Math.abs(r - g) < 40 && r - b > 20)
        if (isSkin) skinPixels++
        totalSampled++
      }
      // Require at least 18% skin pixels in the face region for a valid face
      // (up from 8% — the old threshold was accepting random body parts and colored objects)
      if (skinPixels / totalSampled > 0.18) {
        return {
          detected: true, count: 1, detail: "Face likely present", tip: "",
          bounds: { x: Math.floor(img.width * 0.3), y: Math.floor(img.height * 0.08), width: Math.floor(img.width * 0.4), height: Math.floor(img.height * 0.45) }
        }
      }
      return { detected: false, count: 0, detail: "No clear face found", tip: "Ensure face is visible, well-lit, and facing the camera" }
    } catch { return { detected: true, count: 1, detail: "Basic check passed", tip: "" } }
  }

  const getFailResult = (): PhotoVerificationResult => ({
    valid: false, canOverride: false,
    checks: [{ passed: false, severity: "critical", label: "File Error", detail: "Could not read image", tip: "Try a different image file" }]
  })

  // ──────────────────────────────────────────────────────
  // Auto-Adjust: face-center crop to 3:4 + lighting fix
  // ──────────────────────────────────────────────────────
  const performAutoAdjust = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = async () => {
        URL.revokeObjectURL(url)
        const faceResult = await detectFace(img)
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")
        if (!ctx) { resolve(file); return }

        let sx = 0, sy = 0, sw = img.width, sh = img.height
        const targetRatio = 3 / 4

        if (faceResult.detected && faceResult.bounds) {
          const { x, y, width: fw, height: fh } = faceResult.bounds
          const cx = x + fw / 2
          const cy = y + fh / 2
          let targetW = fw * 2.22
          let targetH = targetW / targetRatio
          if (targetW > img.width || targetH > img.height) {
            if (img.width / img.height > targetRatio) {
              targetH = img.height; targetW = targetH * targetRatio
            } else {
              targetW = img.width; targetH = targetW / targetRatio
            }
          }
          let cropX = cx - targetW / 2
          let cropY = cy - targetH * 0.35
          if (cropX < 0) cropX = 0
          if (cropY < 0) cropY = 0
          if (cropX + targetW > img.width) cropX = img.width - targetW
          if (cropY + targetH > img.height) cropY = img.height - targetH
          sx = cropX; sy = cropY; sw = targetW; sh = targetH
        } else {
          if (img.width / img.height > targetRatio) {
            sh = img.height; sw = sh * targetRatio; sx = (img.width - sw) / 2
          } else {
            sw = img.width; sh = sw / targetRatio; sy = (img.height - sh) / 2
          }
        }

        canvas.width = Math.max(600, Math.round(sw))
        canvas.height = Math.round(canvas.width / targetRatio)

        // Auto white-balance + brightness + contrast correction
        const tempCanvas = document.createElement("canvas")
        tempCanvas.width = Math.round(sw)
        tempCanvas.height = Math.round(sh)
        const tempCtx = tempCanvas.getContext("2d")
        if (tempCtx) {
          tempCtx.drawImage(img, sx, sy, sw, sh, 0, 0, tempCanvas.width, tempCanvas.height)
          try {
            const sampleData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data
            let rSum = 0, gSum = 0, bSum = 0, lumSum = 0, cnt = 0
            for (let i = 0; i < sampleData.length; i += 32) {
              rSum += sampleData[i]; gSum += sampleData[i + 1]; bSum += sampleData[i + 2]
              lumSum += 0.299 * sampleData[i] + 0.587 * sampleData[i + 1] + 0.114 * sampleData[i + 2]
              cnt++
            }
            const avgLum = lumSum / cnt
            // Determine brightness and contrast corrections
            let brightnessAdj = 1.0
            let contrastAdj = 1.0
            if (avgLum < 90) brightnessAdj = 1.15
            else if (avgLum < 110) brightnessAdj = 1.08
            else if (avgLum > 200) brightnessAdj = 0.92
            // Slight contrast boost for flat photos
            if (avgLum > 60 && avgLum < 200) contrastAdj = 1.05

            ctx.filter = `contrast(${contrastAdj}) saturate(1.05) brightness(${brightnessAdj})`
          } catch {
            ctx.filter = "contrast(1.05) saturate(1.05) brightness(1.05)"
          }
        } else {
          ctx.filter = "contrast(1.05) saturate(1.05) brightness(1.05)"
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], "adjusted.jpg", { type: "image/jpeg" }) : file)
        }, "image/jpeg", 0.95)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }

  // ──────────────────────────────────────────────────────
  // File handling — produce stable data URL for preview
  // ──────────────────────────────────────────────────────
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(URL.createObjectURL(file))
      reader.readAsDataURL(file)
    })
  }

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (JPEG, PNG)")
      return
    }

    setVerifying(true)
    setCameraError("")
    setResult(null)

    // Auto-adjust before analysis
    const adjustedFile = await performAutoAdjust(file)
    lastAdjustedFileRef.current = adjustedFile

    // Convert to stable data URL (not blob URL) so it survives across steps
    const previewUrl = await fileToDataUrl(adjustedFile)
    setPreview(previewUrl)

    const verificationResult = await analyzePhoto(adjustedFile)
    setResult(verificationResult)
    setVerifying(false)

    // Auto-accept whenever NO critical check fails. The heuristic checks
    // (ID Photo Content, Front-Facing luminance symmetry, blur score) are
    // flagged as "warning" — they're informational and were producing
    // false positives on perfectly valid passport photos (orange shirts,
    // dark backgrounds, denoised phone JPEGs, etc.). Parents still see the
    // warning banner so they know what could be better, but the photo
    // proceeds to the next step. Only true critical failures (no face,
    // multiple faces, face off-centre, file too big, etc.) block.
    const criticalFails = verificationResult.checks.filter(c => !c.passed && c.severity === "critical")
    if (criticalFails.length === 0) {
      const bgCheck = verificationResult.checks.find(c => c.label === "Background")
      // bgGood = "skip AI safely". Requires the photo's edge background to
      // be BOTH plain (high uniformity) AND a colour match for the school's
      // template choice. analyzeBackgroundUniformity attaches the combined
      // flag via _bgQualityGood; fall back to bgCheck.passed for older paths.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bgGood = (bgCheck as any)?._bgQualityGood ?? !!bgCheck?.passed
      onPhotoAccepted(adjustedFile, previewUrl, bgGood)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzePhoto, onPhotoAccepted])

  const handleForceAccept = async () => {
    if (lastAdjustedFileRef.current) {
      const dataUrl = preview || await fileToDataUrl(lastAdjustedFileRef.current)
      onPhotoAccepted(lastAdjustedFileRef.current, dataUrl)
    }
  }

  // ──────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────
  const passedChecks = result?.checks.filter(c => c.passed) || []
  const failedChecks = result?.checks.filter(c => !c.passed) || []
  const criticalFails = failedChecks.filter(c => c.severity === "critical")

  return (
    <div>
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Camera Permission Status Banner */}
      {cameraPermission === "denied" && !cameraActive && !preview && (
        <div style={{
          marginBottom: 16, padding: 14, background: '#fef3cd',
          borderRadius: 12, border: '1px solid #ffc107'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>📷</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#856404', marginBottom: 6 }}>
                Camera Access Blocked
              </div>
              <div style={{ fontSize: 12, color: '#856404', lineHeight: 1.7 }}>
                Your browser has blocked camera access. To enable it:
              </div>
              <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#856404', lineHeight: 2 }}>
                <li>Click the <strong>🔒 lock icon</strong> (or camera icon) in the address bar</li>
                <li>Set <strong>Camera</strong> → <strong>Allow</strong></li>
                <li>Click <strong>Reload</strong> or refresh the page</li>
              </ol>
              <div style={{ marginTop: 8, fontSize: 11, color: '#a67c00', fontStyle: 'italic' }}>
                You can still upload a photo file even without camera access.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Requirements Card */}
      <div style={{
        marginBottom: 16, padding: 14, background: '#fef2f2',
        borderRadius: 12, border: '1px solid #fecaca'
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
            <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>🚨 Strict ID Photo Requirements</div>
            <ul style={{ margin: 0, paddingLeft: 14, color: '#991b1b', lineHeight: 1.8 }}>
              <li><strong>Front-facing only</strong> — look directly at the camera</li>
              <li><strong>Head &amp; shoulders</strong> — passport-style portrait only</li>
              <li><strong>One person</strong> — no group photos</li>
              <li><strong>Face clearly visible</strong> — eyes, nose, mouth</li>
              <li><strong>Not blurry</strong> — good lighting required</li>
              <li><strong>No inappropriate content</strong> — will be auto-rejected</li>
            </ul>
            <div style={{ marginTop: 6, fontSize: 11, color: '#b91c1c', fontWeight: 600, fontStyle: 'italic' }}>
              ⚠️ Photos not meeting these standards will be automatically rejected.
            </div>
          </div>
        </div>
      </div>

      {/* Camera Permission Error Banner */}
      {cameraError && (
        <div style={{
          padding: 14, background: '#fef2f2', borderRadius: 12,
          border: '1px solid #fecaca', marginBottom: 16
        }}>
          <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>
            📷 Camera Issue
          </div>
          <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {cameraError}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setCameraError(""); startCamera(e) }}
              style={{ fontSize: 11, padding: '6px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >Try Again</button>
            <button
              onClick={(e) => { e.stopPropagation(); setCameraError(""); fileInputRef.current?.click() }}
              style={{ fontSize: 11, padding: '6px 14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
            >Upload File Instead</button>
          </div>
        </div>
      )}

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
        onClick={() => {
          if (!cameraActive && !verifying) fileInputRef.current?.click()
        }}
        style={{
          border: `2px dashed ${dragOver ? '#3b82f6' : preview ? (result?.valid ? '#22c55e' : result?.canOverride ? '#f59e0b' : '#ef4444') : '#e2e8f0'}`,
          borderRadius: 14,
          padding: preview || cameraActive ? 16 : 36,
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
            e.target.value = ""
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
              Auto-adjusting & analyzing photo...
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Cropping to face, fixing lighting, running quality checks
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
                        : `⚠️ ${failedChecks.length} Warning${failedChecks.length > 1 ? 's' : ''} — auto-adjusted`
                    }
                  </div>

                  {/* Score Bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: result.valid ? '#22c55e' : result.canOverride ? '#f59e0b' : '#ef4444',
                        width: `${Math.round((passedChecks.length / result.checks.length) * 100)}%`,
                        transition: 'width 0.5s'
                      }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {passedChecks.length}/{result.checks.length} checks passed
                    </div>
                  </div>

                  {/* Failed Checks */}
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
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>💡 {check.tip}</div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Passed Checks */}
                    {passedChecks.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
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

                  {/* Action Buttons for rejected photos */}
                  {!result.valid && (
                    <div style={{ marginTop: 12 }}>
                      {/* Critical rejection banner — list the EXACT failing
                          checks so the parent knows precisely what to fix
                          instead of seeing a generic "rejected" message. */}
                      {criticalFails.length > 0 && (
                        <div style={{
                          padding: '10px 14px', borderRadius: 8,
                          background: '#fef2f2', border: '1px solid #fecaca',
                          marginBottom: 10
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>
                            🚫 Photo Rejected — {criticalFails.length === 1 ? "reason below" : `${criticalFails.length} reasons below`}
                          </div>
                          <ol style={{
                            margin: 0, paddingLeft: 18, fontSize: 11,
                            color: '#991b1b', lineHeight: 1.55,
                          }}>
                            {criticalFails.map((c, i) => (
                              <li key={`crit-${i}`} style={{ marginBottom: 4 }}>
                                <strong>{c.label}:</strong> {c.detail}
                                {c.tip && (
                                  <div style={{ color: '#7f1d1d', fontWeight: 500, marginTop: 1 }}>
                                    → {c.tip}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ol>
                          {/* Also surface any warning-level failures so the
                              parent fixes everything in one re-upload. */}
                          {failedChecks.some(c => c.severity !== "critical") && (
                            <div style={{
                              marginTop: 8, paddingTop: 8,
                              borderTop: '1px dashed #fecaca',
                              fontSize: 11, color: '#92400e',
                            }}>
                              <div style={{ fontWeight: 700, marginBottom: 2 }}>Also improve:</div>
                              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                                {failedChecks.filter(c => c.severity !== "critical").map((c, i) => (
                                  <li key={`warn-${i}`}>
                                    <strong>{c.label}:</strong> {c.detail}
                                    {c.tip && <span style={{ color: '#a16207' }}> — {c.tip}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Warning-only: still needs re-upload since auto-accept is strict now */}
                      {criticalFails.length === 0 && result.canOverride && (
                        <div style={{
                          padding: '8px 12px', borderRadius: 8,
                          background: '#fffbeb', border: '1px solid #fde68a',
                          marginBottom: 10, fontSize: 11, color: '#92400e'
                        }}>
                          ⚠️ Minor issues detected — they may affect ID card quality. Consider re-uploading a better photo.
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPreview(""); setResult(null); lastAdjustedFileRef.current = null }}
                          style={{
                            fontSize: 12, padding: '8px 16px',
                            background: criticalFails.length > 0 ? '#ef4444' : '#f1f5f9',
                            color: criticalFails.length > 0 ? 'white' : '#64748b',
                            border: 'none', borderRadius: 8,
                            cursor: 'pointer', fontWeight: 700, flex: 1
                          }}
                        >
                          📷 {criticalFails.length > 0 ? "Upload a Proper ID Photo" : "Re-upload Photo"}
                        </button>
                        {/* Only allow force-accept if no critical failures */}
                        {result.canOverride && criticalFails.length === 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleForceAccept() }}
                            style={{
                              fontSize: 12, padding: '8px 16px',
                              background: '#f0fdf4', color: '#16a34a',
                              border: '1px solid #bbf7d0', borderRadius: 8,
                              cursor: 'pointer', fontWeight: 600
                            }}
                          >
                            Use Anyway
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Show accepted message for valid photos */}
                  {result.valid && (
                    <div style={{
                      marginTop: 10, padding: '6px 10px', borderRadius: 6,
                      background: '#f0fdf4', border: '1px solid #bbf7d0',
                      fontSize: 11, color: '#16a34a', fontWeight: 600
                    }}>
                      ✓ Photo accepted — meets ID card requirements
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : cameraActive ? (
          /* ─── Live Camera View ─── */
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              position: 'relative', width: '100%', maxWidth: 280,
              borderRadius: 14, overflow: 'hidden', background: '#000',
              marginBottom: 12, aspectRatio: '3/4',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
            }}>
              <video
                ref={videoRef}
                autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              />
              {/* Face guide overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{
                  width: '55%', height: '65%', borderRadius: '50%',
                  border: '2px dashed rgba(255,255,255,0.5)',
                  marginTop: '-10%'
                }} />
              </div>
              {/* Guide text overlays */}
              <div style={{
                position: 'absolute', top: 8, left: 0, right: 0,
                textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.7)',
                textShadow: '0 1px 4px rgba(0,0,0,0.5)'
              }}>Use a plain background</div>
              <div style={{
                position: 'absolute', bottom: 8, left: 0, right: 0,
                textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.8)',
                textShadow: '0 1px 4px rgba(0,0,0,0.5)'
              }}>Position face inside the oval • Look straight</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={(e) => { e.stopPropagation(); stopCamera() }}
                style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >Cancel</button>
              <button
                onClick={flipCamera}
                title={facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
                style={{
                  padding: '10px 14px', borderRadius: 10, border: 'none',
                  background: '#e0e7ff', color: '#4f46e5',
                  fontWeight: 700, cursor: 'pointer', fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 0.3s ease'
                }}
              >🔄</button>
              <button
                onClick={takePhoto}
                style={{
                  padding: '10px 28px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                  boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
                }}
              >📸 Capture</button>
            </div>
          </div>
        ) : (
          /* ─── Empty state: Browse / Camera ─── */
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
              Upload Student Photo
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              Drag & drop, browse files, or take a live photo
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 14, fontStyle: 'italic' }}>
              Photos are auto-cropped to passport size & enhanced automatically
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                style={{
                  padding: '10px 20px', background: '#e0e7ff', color: '#4f46e5',
                  border: 'none', borderRadius: 10, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                📁 Browse File
              </button>
              <button
                onClick={startCamera}
                style={{
                  padding: '10px 20px',
                  background: cameraPermission === "denied"
                    ? '#fef2f2' : 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                  color: cameraPermission === "denied" ? '#dc2626' : '#059669',
                  border: cameraPermission === "denied" ? '1px solid #fecaca' : '1px solid #a7f3d0',
                  borderRadius: 10, cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                {cameraPermission === "denied" ? "🚫 Camera Blocked" :
                 cameraPermission === "checking" ? "⏳ Checking Camera..." :
                 cameraPermission === "unsupported" ? "📷 No Camera" :
                 "📸 Take Photo"}
              </button>
            </div>
            {cameraPermission === "granted" && (
              <div style={{ fontSize: 10, color: '#22c55e', marginTop: 8, fontWeight: 600 }}>
                ✓ Camera access granted
              </div>
            )}
            <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: cameraPermission === "granted" ? 4 : 14 }}>
              Accepted: JPEG, PNG, WebP — max 5 MB
            </div>
          </>
        )}
      </div>
    </div>
  )
}
