"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { processPhotoBackgroundLocal, type BgModelChoice } from "@/lib/photo-bg-composite-client"
import { prepareStudentPhotoForUpload } from "@/lib/client-photo-upload"
import { preloadBgRemovalModel } from "@/lib/photo-background"
import { cacheBustPhotoUrl } from "@/lib/student-photo-url"

export type BatchStudent = {
  id: string
  serialNumber: string
  photoUrl: string
  name?: string
}

type Props = {
  schoolId: string
  students: BatchStudent[]
  bgColor: string
  onBgColorChange: (color: string) => void
  onBgColorCommit?: (color: string) => Promise<void>
  onPhotoSaved?: (studentId: string, photoUrl: string, photoPath?: string, updatedAt?: string) => void
  onComplete: (stats: { processed: number; failed: number }) => void
  onClose: () => void
}

const MODEL_OPTIONS: { value: BgModelChoice; label: string; desc: string }[] = [
  {
    value: "gemini",
    label: "☁️ Google AI",
    desc: "Best quality — handles hair perfectly",
  },
  {
    value: "isnet",
    label: "💻 Local ISNet",
    desc: "Runs on this PC, works offline",
  },
]

export default function ManufacturerBgBatchProcessor({
  schoolId,
  students,
  bgColor,
  onBgColorChange,
  onBgColorCommit,
  onPhotoSaved,
  onComplete,
  onClose,
}: Props) {
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [progressMsg, setProgressMsg] = useState("")
  const [itemProgress, setItemProgress] = useState(0)
  const [processed, setProcessed] = useState(0)
  const [failed, setFailed] = useState(0)
  const [errors, setErrors] = useState<Array<{ serialNumber: string; error: string }>>([])
  const [modelReady, setModelReady] = useState(false)
  const [selectedModel, setSelectedModel] = useState<BgModelChoice>("gemini")
  const abortRef = useRef(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    preloadBgRemovalModel()
      .then(() => setModelReady(true))
      .catch(() => setModelReady(false))
  }, [])

  const processOne = useCallback(async (student: BatchStudent): Promise<boolean> => {
    try {
      const { dataUrl } = await processPhotoBackgroundLocal(
        cacheBustPhotoUrl(student.photoUrl),
        bgColor,
        (msg, pct) => {
          setProgressMsg(msg)
          setItemProgress(pct)
        },
        selectedModel
      )
      const file = await prepareStudentPhotoForUpload(dataUrl, {
        fileName: `${student.id}.jpg`,
      })
      const fd = new FormData()
      fd.append("photo", file)
      fd.append("studentId", student.id)
      fd.append("photoBgStatus", "REPROCESSED")
      const res = await fetch(`/api/schools/${schoolId}/students/assign-photo`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Upload failed")
      }
      onPhotoSaved?.(student.id, data.data.photoUrl, data.data.photoPath, data.data.updatedAt)
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed"
      setErrors((prev) => [...prev.slice(-49), { serialNumber: student.serialNumber, error: message }])
      return false
    }
  }, [schoolId, bgColor, onPhotoSaved, selectedModel])

  const runBatch = useCallback(async () => {
    if (students.length === 0) return
    setRunning(true)
    abortRef.current = false
    pausedRef.current = false
    setPaused(false)
    setProgressMsg("Saving background colour...")
    setItemProgress(0)

    try {
      await onBgColorCommit?.(bgColor)
    } catch (err: unknown) {
      setRunning(false)
      setProgressMsg("")
      const message = err instanceof Error ? err.message : "Failed to save background colour"
      setErrors((prev) => [...prev.slice(-49), { serialNumber: "Settings", error: message }])
      return
    }

    let ok = processed
    let fail = failed
    let idx = currentIdx

    while (idx < students.length) {
      if (abortRef.current) break
      while (pausedRef.current && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 200))
      }
      if (abortRef.current) break

      setCurrentIdx(idx)
      setProgressMsg(`Processing and saving ${students[idx].serialNumber}...`)
      setItemProgress(0)

      const success = await processOne(students[idx])
      if (success) {
        ok++
        setProcessed(ok)
      } else {
        fail++
        setFailed(fail)
      }
      idx++
    }

    setRunning(false)
    if (!abortRef.current) {
      onComplete({ processed: ok, failed: fail })
    }
  }, [students, processOne, processed, failed, currentIdx, onComplete, onBgColorCommit, bgColor])

  const total = students.length
  const overallPct = total > 0 ? Math.round(((currentIdx + (itemProgress / 100)) / total) * 100) : 0

  return (
    <div style={{ padding: "8px 0" }}>
      {/* ─── Model selector ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {MODEL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSelectedModel(opt.value)}
            disabled={running}
            style={{
              flex: 1,
              padding: "8px 10px",
              border: `2px solid ${selectedModel === opt.value ? "#8b5cf6" : "#e2e8f0"}`,
              borderRadius: 10,
              background: selectedModel === opt.value ? "#f5f3ff" : "#fafafa",
              cursor: running ? "not-allowed" : "pointer",
              textAlign: "left",
              transition: "all 0.2s",
            }}
          >
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: selectedModel === opt.value ? "#7c3aed" : "#475569",
            }}>
              {opt.label}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>
              {opt.desc}
            </div>
          </button>
        ))}
      </div>

      <div style={{
        padding: 14,
        background: selectedModel === "gemini" ? "#eff6ff" : (modelReady ? "#f0fdf4" : "#fffbeb"),
        borderRadius: 10,
        border: `1px solid ${selectedModel === "gemini" ? "#bfdbfe" : (modelReady ? "#bbf7d0" : "#fde68a")}`,
        fontSize: 12,
        color: selectedModel === "gemini" ? "#1e40af" : (modelReady ? "#166534" : "#92400e"),
        marginBottom: 16, lineHeight: 1.5,
      }}>
        {selectedModel === "gemini"
          ? "Using Google AI for best quality. Photos are sent to Google's server for processing."
          : modelReady
            ? "Local AI model ready on this PC. Processing runs entirely in your browser."
            : "Downloading AI model on first use (~170MB, best quality). Cached for future runs."}
        {" "}Each processed photo is saved automatically.
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center",
        padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 16,
      }}>
        <input
          type="color"
          value={bgColor}
          onChange={(e) => onBgColorChange(e.target.value.toUpperCase())}
          disabled={running}
          style={{ width: 44, height: 36, border: "1px solid #cbd5e1", borderRadius: 8, padding: 2 }}
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>Background colour after removal</div>
          <input
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value.toUpperCase())}
            maxLength={7}
            disabled={running}
            style={{
              marginTop: 6, width: 110, padding: "7px 9px", border: "1px solid #cbd5e1",
              borderRadius: 8, fontSize: 12, fontWeight: 600,
            }}
          />
        </div>
      </div>

      {running && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
            {progressMsg} ({currentIdx + 1} / {total})
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${overallPct}%`, background: "linear-gradient(90deg, #8b5cf6, #6366f1)",
              transition: "width 0.3s",
            }} />
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            {processed} saved · {failed} failed
          </div>
        </div>
      )}

      {!running && total > 0 && processed + failed >= total && (
        <div style={{
          padding: 12, background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0",
          fontSize: 13, color: "#166534", marginBottom: 16,
        }}>
          Complete: {processed} processed, {failed} failed.
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ maxHeight: 100, overflow: "auto", marginBottom: 16, fontSize: 11, color: "#dc2626" }}>
          {errors.slice(-5).map((e, i) => (
            <div key={i}>{e.serialNumber}: {e.error}</div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {running ? (
          <>
            <button
              className="btn btn-outline"
              onClick={() => { pausedRef.current = !pausedRef.current; setPaused(!paused) }}
              style={{ fontSize: 13 }}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => { abortRef.current = true; setRunning(false) }}
              style={{ fontSize: 13, borderColor: "#ef4444", color: "#dc2626" }}
            >
              Stop
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-outline" onClick={onClose} style={{ fontSize: 13 }}>Close</button>
            <button
              className="btn btn-primary"
              onClick={runBatch}
              disabled={total === 0}
              style={{ fontSize: 13, background: "#8b5cf6" }}
            >
              {processed + failed > 0 ? "Continue Auto-Save" : `Process & Auto-Save ${total} Photos`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
