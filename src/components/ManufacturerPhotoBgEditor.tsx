"use client"

import { useCallback, useEffect, useState } from "react"
import { processPhotoBackgroundLocal, type BgModelChoice } from "@/lib/photo-bg-composite-client"
import { prepareStudentPhotoForUpload } from "@/lib/client-photo-upload"
import { preloadBgRemovalModel } from "@/lib/photo-background"
import { cacheBustPhotoUrl } from "@/lib/student-photo-url"

type Props = {
  schoolId: string
  studentId: string
  studentName: string
  photoUrl: string
  defaultBgColor: string
  onBgColorCommit?: (color: string) => Promise<void>
  onSaved: (photoUrl: string, photoPath?: string, bgColor?: string, updatedAt?: string) => void
  onClose: () => void
}

const MODEL_OPTIONS: { value: BgModelChoice; label: string; desc: string }[] = [
  {
    value: "birefnet",
    label: "☁️ Cloud AI (BiRefNet)",
    desc: "Best quality — handles hair perfectly. Requires internet.",
  },
  {
    value: "isnet",
    label: "💻 Local ISNet",
    desc: "Runs on this PC. First use downloads ~170MB. Works offline.",
  },
]

export default function ManufacturerPhotoBgEditor({
  schoolId,
  studentId,
  studentName,
  photoUrl,
  defaultBgColor,
  onBgColorCommit,
  onSaved,
  onClose,
}: Props) {
  const [bgColor, setBgColor] = useState(defaultBgColor || "#FFFFFF")
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState("")
  const [originalUrl, setOriginalUrl] = useState("")
  const [processedUrl, setProcessedUrl] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [modelReady, setModelReady] = useState(false)
  const [colorSaved, setColorSaved] = useState(true)
  const [selectedModel, setSelectedModel] = useState<BgModelChoice>("birefnet")

  useEffect(() => {
    preloadBgRemovalModel()
      .then(() => setModelReady(true))
      .catch(() => setModelReady(false))
  }, [])

  useEffect(() => {
    if (!photoUrl) return
    setOriginalUrl(photoUrl)
  }, [photoUrl])

  const saveProcessedPhoto = useCallback(async (dataUrl: string) => {
    setSaving(true)
    setError("")
    try {
      await onBgColorCommit?.(bgColor)
      const file = await prepareStudentPhotoForUpload(dataUrl, {
        fileName: `${studentId}.jpg`,
      })
      const fd = new FormData()
      fd.append("photo", file)
      fd.append("studentId", studentId)
      fd.append("photoBgStatus", "REPROCESSED")
      const res = await fetch(`/api/schools/${schoolId}/students/assign-photo`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Save failed")
      }
      onSaved(data.data.photoUrl, data.data.photoPath, bgColor, data.data.updatedAt)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }, [bgColor, onBgColorCommit, onSaved, schoolId, studentId])

  const runProcessing = useCallback(async (autoSave: boolean) => {
    if (!photoUrl) return
    setProcessing(true)
    setError("")
    setProcessedUrl(null)
    setProgress(0)

    try {
      const { dataUrl } = await processPhotoBackgroundLocal(
        cacheBustPhotoUrl(photoUrl),
        bgColor,
        (msg, pct) => {
          setProgressMsg(msg)
          setProgress(pct)
        },
        selectedModel,
        true // forceAi
      )
      setProcessedUrl(dataUrl)
      if (autoSave) {
        await saveProcessedPhoto(dataUrl)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Background removal failed"
      setError(message)
    } finally {
      setProcessing(false)
    }
  }, [photoUrl, bgColor, saveProcessedPhoto, selectedModel])

  const handleColorChange = (color: string) => {
    setBgColor(color.toUpperCase())
    setColorSaved(false)
    setProcessedUrl(null)
  }

  const handleSaveColor = async (): Promise<boolean> => {
    setSaving(true)
    setError("")
    try {
      await onBgColorCommit?.(bgColor)
      setColorSaved(true)
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save background colour")
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleRunAi = async () => {
    if (!colorSaved) {
      const saved = await handleSaveColor()
      if (!saved) return
    }
    await runProcessing(true)
  }

  const handleSave = async () => {
    if (!processedUrl) return
    await saveProcessedPhoto(processedUrl)
  }

  const modelInfo = MODEL_OPTIONS.find((m) => m.value === selectedModel)

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1100, padding: 24,
      }}
      onClick={() => { if (!processing && !saving) onClose() }}
    >
      <div
        style={{
          background: "white", borderRadius: 20, maxWidth: 640, width: "100%",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)", maxHeight: "90vh", overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
            AI Background - {studentName}
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
            {modelInfo?.desc || "Select a model below."}
            {selectedModel === "isnet" && (modelReady ? " Model ready." : " Preparing model...")}
            {" "}Processed photos are saved automatically.
          </p>
        </div>

        <div style={{ padding: 24 }}>
          {/* ─── Model selector ─────────────────────────────────────────── */}
          <div style={{
            display: "flex", gap: 8, marginBottom: 16,
          }}>
            {MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSelectedModel(opt.value); setProcessedUrl(null); setError("") }}
                disabled={processing || saving}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: `2px solid ${selectedModel === opt.value ? "#8b5cf6" : "#e2e8f0"}`,
                  borderRadius: 12,
                  background: selectedModel === opt.value ? "#f5f3ff" : "#fafafa",
                  cursor: processing || saving ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: selectedModel === opt.value ? "#7c3aed" : "#475569",
                }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>

          {/* ─── Background colour picker ─────────────────────────────── */}
          <div style={{
            display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center",
            padding: 12, background: "#faf5ff", borderRadius: 10, border: "1px solid #e9d5ff", marginBottom: 20,
          }}>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => handleColorChange(e.target.value)}
              disabled={processing || saving}
              style={{ width: 48, height: 40, border: "1px solid #cbd5e1", borderRadius: 8, padding: 2 }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Background colour</div>
              <input
                value={bgColor}
                onChange={(e) => handleColorChange(e.target.value)}
                maxLength={7}
                disabled={processing || saving}
                style={{
                  marginTop: 6, width: 110, padding: "7px 9px", border: "1px solid #cbd5e1",
                  borderRadius: 8, fontSize: 12, fontWeight: 600,
                }}
              />
              <div style={{ marginTop: 6, fontSize: 11, color: colorSaved ? "#16a34a" : "#b45309", fontWeight: 600 }}>
                {colorSaved ? "Colour saved. Ready to run AI." : "Save colour before processing."}
              </div>
            </div>
          </div>

          {/* ─── Photo comparison ─────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ textAlign: "center", flex: "1 1 140px", maxWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>UPLOADED</div>
              <div style={{
                borderRadius: 12, overflow: "hidden", border: "2px solid #e2e8f0",
                aspectRatio: "3/4", background: "#f8fafc",
              }}>
                {originalUrl ? (
                  <img src={originalUrl} alt="Original" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
                    Loading...
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "#94a3b8" }}>{"→"}</div>

            <div style={{ textAlign: "center", flex: "1 1 140px", maxWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", marginBottom: 8 }}>PROCESSED</div>
              <div style={{
                borderRadius: 12, overflow: "hidden",
                border: `2px solid ${processedUrl ? "#8b5cf6" : "#e2e8f0"}`,
                aspectRatio: "3/4", background: bgColor,
              }}>
                {processing || saving ? (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}>
                    <div className="login-spinner" style={{
                      width: 32, height: 32, borderColor: "rgba(139,92,246,0.2)", borderTopColor: "#8b5cf6", marginBottom: 10,
                    }} />
                    <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>
                      {saving ? "Saving processed photo…" : progressMsg}
                    </div>
                    {!saving && (
                      <div style={{ width: "80%", height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 8 }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: "#8b5cf6", borderRadius: 2, transition: "width 0.3s" }} />
                      </div>
                    )}
                  </div>
                ) : processedUrl ? (
                  <img src={processedUrl} alt="Processed" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
                    -
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div style={{
              padding: 12, background: "#fef2f2", border: "1px solid #fecaca",
              borderRadius: 10, fontSize: 13, color: "#dc2626", marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button className="btn btn-outline" onClick={onClose} disabled={processing || saving} style={{ fontSize: 13 }}>
              Cancel
            </button>
            <button
              className="btn btn-outline"
              onClick={() => { void handleSaveColor() }}
              disabled={processing || saving}
              style={{ fontSize: 13, borderColor: "#0ea5e9", color: "#0284c7" }}
            >
              {saving && !processedUrl ? "Saving..." : "Save Colour"}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleRunAi}
              disabled={processing || saving}
              style={{ fontSize: 13, background: "#8b5cf6", padding: "8px 20px" }}
            >
              {processing || saving ? "Processing…" : processedUrl ? "Re-run & Save" : "Run AI & Save"}
            </button>
            {processedUrl && !processing && !saving && (
              <button
                className="btn btn-outline"
                onClick={handleSave}
                style={{ fontSize: 13, borderColor: "#8b5cf6", color: "#7c3aed" }}
              >
                Save Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
