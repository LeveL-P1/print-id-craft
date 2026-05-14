import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const cls = await prisma.class.findUnique({
      where: { linkToken: params.token },
      include: {
        school: {
          include: {
            template: true,
          },
        },
      },
    })

    if (!cls) {
      return NextResponse.json({ error: "Invalid link", code: "INVALID" }, { status: 404 })
    }

    if (!cls.isActive) {
      return NextResponse.json({ error: "This link is closed", code: "CLOSED" }, { status: 410 })
    }

    if (cls.expiresAt && new Date() > cls.expiresAt) {
      return NextResponse.json({ error: "This link has expired", code: "EXPIRED" }, { status: 410 })
    }

    const template = cls.school.template

    // fieldConfig is auto-synced from Excel on every import — it has the EXACT Excel column
    // names as labels (e.g. "GR NO", "House", "MOBILE") and the correct stored data keys.
    // Use it as the primary form field source so the public form always matches the school's
    // Excel exactly.  Fall back to deriving from fieldMappings only for JPG-template-only
    // schools that have never imported an Excel.
    const rawMappings = (template?.fieldMappings || []) as any[]
    const rawFieldConf = (template?.fieldConfig || []) as any[]

    // Keys/labels that students should not fill in (system-managed or auto-filled)
    const FORM_SKIP_KEYS = new Set(["class", "classSection", "photoUrl"])
    const FORM_SKIP_LABELS = new Set(["class", "class-section", "photo url", "photourl"])

    let resolvedFieldConfig: any[]
    if (rawFieldConf.length > 0) {
      resolvedFieldConfig = rawFieldConf
        .filter((f: any) =>
          !FORM_SKIP_KEYS.has(f.key) &&
          !FORM_SKIP_LABELS.has((f.label || "").toLowerCase().trim())
        )
        .map((f: any) => {
          const k = (f.key || "").toLowerCase()
          const l = (f.label || "").toLowerCase()
          let formType = f.type || "text"
          if (k === "phone" || k.includes("mob") || l.includes("mobile") || l.includes("phone")) formType = "tel"
          return { key: f.key, label: f.label, type: formType, required: true }
        })
    } else if (rawMappings.length > 0) {
      resolvedFieldConfig = rawMappings
        .filter((m: any) => m.type !== "photo")
        .map((m: any) => {
          const k = (m.fieldKey || "").toLowerCase()
          let formType = "text"
          if (k.includes("phone") || k.includes("mob") || k === "mob_father" || k === "mother_phone") formType = "tel"
          return { key: m.fieldKey, label: m.label, type: formType, required: true }
        })
    } else {
      resolvedFieldConfig = []
    }

    // Detect flag/house field from EITHER fieldMappings (type=flag) OR fieldConfig key/label.
    const FLAG_FIELD_KEYS = ["flagColor", "houseFlag", "house_flag", "houseColor", "house_color"]
    const FLAG_LABEL_WORDS = ["house", "flag", "colour", "color"]
    const hasFlagMapping =
      rawMappings.some((m: any) => m.type === "flag") ||
      rawFieldConf.some((f: any) =>
        FLAG_FIELD_KEYS.includes(f.key) ||
        FLAG_LABEL_WORDS.some(w => (f.label || "").toLowerCase().includes(w))
      )
    const FLAG_KEYS = ["flagColor", "Flag Color", "flag_color", "House", "house", "Colour", "colour", "houseFlag", "house_flag", "houseColor", "house_color"]
    const flagColorSet = new Set<string>()
    if (hasFlagMapping) {
      try {
        const otherStudents = await prisma.student.findMany({
          where: { schoolId: cls.school.id },
          select: { formData: true },
        })
        for (const s of otherStudents) {
          const fd = (s.formData as Record<string, string> | null) || {}
          for (const k of FLAG_KEYS) {
            const v = (fd[k] || "").trim()
            if (v) flagColorSet.add(v)
          }
        }
      } catch {
        // Non-fatal — dropdown will simply be empty and form falls back to text input
      }
    }
    const flagColors = Array.from(flagColorSet).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({
      success: true,
      data: {
        schoolName: cls.school.name,
        schoolLogo: cls.school.logoUrl,
        className: cls.name,
        schoolId: cls.school.id,
        classId: cls.id,
        fieldConfig: resolvedFieldConfig,
        frontLayout: template?.frontLayout || [],
        backLayout: template?.backLayout || [],
        cardWidthMm: template?.cardWidthMm || 85.6,
        cardHeightMm: template?.cardHeightMm || 54.0,
        orientation: template?.orientation || "LANDSCAPE",
        // JPG template data for card preview
        templateImageUrl: template?.templateImageUrl || null,
        fieldMappings: rawMappings,
        // Photo background color for auto-replacement
        photoBgColor: template?.photoBgColor || "#FFFFFF",
        // Available house/flag colours for dropdown in public form
        flagColors,
      },
    })
  } catch (error) {
    console.error("GET /api/submit/[token] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
