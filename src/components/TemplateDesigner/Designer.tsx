"use client"
import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import Sidebar from "./Sidebar"
import CanvasArea from "./CanvasArea"

export type ElementType = "TEXT" | "IMAGE" | "QR" | "SHAPE"

export type TemplateElement = {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  content: string // Static text or variable like {{studentName}}
  fontSize?: number
  fontFamily?: string
  fill?: string
  align?: string
  rotation?: number
}

type TemplateConfig = {
  id?: string
  background: string
  width: number
  height: number
  elements: TemplateElement[]
}

const DEFAULT_CONFIG: TemplateConfig = {
  background: "#ffffff",
  width: 600,
  height: 950,
  elements: []
}

export default function Designer() {
  const params = useParams()
  const schoolId = params.id as string

  const [side, setSide] = useState<"FRONT" | "BACK">("FRONT")
  const [frontConfig, setFrontConfig] = useState<TemplateConfig>(DEFAULT_CONFIG)
  const [backConfig, setBackConfig] = useState<TemplateConfig>(DEFAULT_CONFIG)
  
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [fields, setFields] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch(`/api/schools/${schoolId}/templates`),
      fetch(`/api/schools/${schoolId}/fields`)
    ]).then(async ([resTemp, resFields]) => {
      const tempJson = await resTemp.json()
      const fieldsJson = await resFields.json()
      
      if (fieldsJson.success) setFields(fieldsJson.data)
      
      if (tempJson.success && tempJson.data.length > 0) {
        tempJson.data.forEach((t: any) => {
           const parsedConfig: TemplateConfig = {
             id: t.id,
             background: t.background,
             width: t.width,
             height: t.height,
             elements: t.templateJson as TemplateElement[] || []
           }
           if (t.side === "FRONT") setFrontConfig(parsedConfig)
           if (t.side === "BACK") setBackConfig(parsedConfig)
        })
      }
    }).finally(() => setLoading(false))
  }, [schoolId])

  const activeConfig = side === "FRONT" ? frontConfig : backConfig
  const setActiveConfig = side === "FRONT" ? setFrontConfig : setBackConfig

  const updateElement = (id: string, newProps: Partial<TemplateElement>) => {
    setActiveConfig(prev => ({
      ...prev,
      elements: prev.elements.map(el => (el.id === id ? { ...el, ...newProps } : el))
    }))
  }

  const addElement = (type: ElementType, isVariable: boolean = false, fieldName?: string) => {
    const el: TemplateElement = {
      id: Date.now().toString(),
      type,
      x: activeConfig.width / 2 - 50,
      y: activeConfig.height / 2 - 20,
      width: type === "IMAGE" || type === "QR" ? 120 : 150,
      height: type === "IMAGE" || type === "QR" ? 120 : 30,
      content: isVariable ? `{{${fieldName}}}` : (type === "TEXT" ? "Double click to edit" : ""),
      fontSize: 24,
      fontFamily: "Arial",
      fill: "#0f172a",
      align: "center"
    }
    setActiveConfig(prev => ({ ...prev, elements: [...prev.elements, el] }))
    setSelectedId(el.id)
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setActiveConfig(prev => ({
      ...prev,
      elements: prev.elements.filter(el => el.id !== selectedId)
    }))
    setSelectedId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(`/api/schools/${schoolId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side,
          background: activeConfig.background,
          width: activeConfig.width,
          height: activeConfig.height,
          templateJson: activeConfig.elements
        })
      })
      alert("Template Saved successfully!")
    } catch (e) {
      console.error(e)
      alert("Failed to save template")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'white', padding: 32 }}>Loading Studio...</div>

  return (
    <>
      {/* Left Sidebar Toolbox */}
      <Sidebar 
        side={side} 
        setSide={setSide} 
        config={activeConfig} 
        setConfig={setActiveConfig} 
        selectedId={selectedId}
        updateElement={updateElement}
        addElement={addElement}
        fields={fields}
        handleSave={handleSave}
        saving={saving}
        deleteSelected={deleteSelected}
      />

      {/* Main Center Canvas View */}
      <div style={{ flex: 1, position: 'relative', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }} onClick={(e) => {
        if (e.target === e.currentTarget) setSelectedId(null)
      }}>
        <div style={{ position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', background: activeConfig.background, overflow: 'hidden' }}>
          <CanvasArea 
             config={activeConfig} 
             selectedId={selectedId} 
             setSelectedId={setSelectedId} 
             updateElement={updateElement} 
          />
        </div>
      </div>
    </>
  )
}
