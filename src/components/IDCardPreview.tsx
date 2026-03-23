"use client"

type TemplateElement = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  content: string
  fontSize?: number
  fill?: string
  align?: string
  bold?: boolean
  italic?: boolean
}

type IDCardPreviewProps = {
  layout: TemplateElement[]
  widthMm: number
  heightMm: number
  formData: Record<string, string>
  studentPhoto?: string
  schoolLogo?: string
  serialNumber?: string
  qrCodeUrl?: string
  scale?: number
}

export default function IDCardPreview({
  layout,
  widthMm,
  heightMm,
  formData,
  studentPhoto,
  schoolLogo,
  serialNumber,
  qrCodeUrl,
  scale = 3.8,
}: IDCardPreviewProps) {
  const w = widthMm * scale
  const h = heightMm * scale

  const resolveTemplateText = (text: string) => {
    let resolved = text
    Object.entries(formData).forEach(([key, value]) => {
      resolved = resolved.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "")
    })
    // Also try to replace common aliases
    if (serialNumber) {
      resolved = resolved.replace(/\{\{serialNumber\}\}/g, serialNumber)
    }
    return resolved
  }

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
        margin: "0 auto",
      }}
    >
      {layout.map((el) => (
        <div
          key={el.id}
          style={{
            position: "absolute",
            left: el.x,
            top: el.y,
            width: el.width,
            height: el.height,
            display: "flex",
            alignItems: "center",
            justifyContent:
              el.align === "left"
                ? "flex-start"
                : el.align === "right"
                ? "flex-end"
                : "center",
            padding: 2,
            fontSize: el.fontSize || 14,
            color: el.fill || "#000",
            fontWeight: el.bold ? "bold" : "normal",
            fontStyle: el.italic ? "italic" : "normal",
            background:
              el.type === "photo"
                ? "#f1f5f9"
                : el.type === "logo"
                ? "#eff6ff"
                : "transparent",
            userSelect: "none",
            overflow: "hidden",
          }}
        >
          {el.type === "photo" ? (
            studentPhoto ? (
              <img
                src={studentPhoto}
                alt="Student"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 4,
                }}
              >
                <span style={{ fontSize: 10, color: "#94a3b8" }}>Photo</span>
              </div>
            )
          ) : el.type === "logo" ? (
            schoolLogo ? (
              <img
                src={schoolLogo}
                alt="Logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#eff6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px dashed #bfdbfe",
                  borderRadius: 4,
                }}
              >
                <span style={{ fontSize: 10, color: "#3b82f6" }}>Logo</span>
              </div>
            )
          ) : el.type === "qr" ? (
            qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="QR"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #e2e8f0",
                }}
              >
                <span style={{ fontSize: 10, color: "#94a3b8" }}>QR</span>
              </div>
            )
          ) : (
            resolveTemplateText(el.content)
          )}
        </div>
      ))}
      {layout.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontSize: 12,
          }}
        >
          No template configured
        </div>
      )}
    </div>
  )
}
