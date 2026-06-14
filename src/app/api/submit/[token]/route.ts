import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildFormFields, checkSubmissionStatus, type FormField } from "@/lib/submit-fields"
import { migrateTemplateToPt } from "@/lib/font-size-units"
import { getFieldRole, inferFieldRole, resolveFieldValue, sortFieldsByRole } from "@/lib/field-resolver"
import { getTemplateForClass } from "@/lib/template-resolver"
import {
  DIVISIONS,
  parseClassOptions,
  sectionUsesClassPicker,
} from "@/lib/section-class"

export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const cls = await prisma.class.findUnique({
      where: { linkToken: params.token },
      include: {
        school: true,
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

    // Optional: check whether this student was already submitted (return visit).
    const { searchParams } = new URL(req.url)
    if (searchParams.get("statusCheck") === "1") {
      let formData: Record<string, string> = {}
      const rawFormData = searchParams.get("formData")
      if (rawFormData) {
        try {
          formData = JSON.parse(rawFormData) as Record<string, string>
        } catch {
          return NextResponse.json({ error: "Invalid formData" }, { status: 400 })
        }
      }
      const name = resolveFieldValue(formData, "name")
      const father = resolveFieldValue(formData, "father")
      if (!name || !father) {
        return NextResponse.json({ success: true, data: { submitted: false } })
      }
      const status = await checkSubmissionStatus(cls.id, formData)
      return NextResponse.json({
        success: true,
        data: status.submitted
          ? {
              submitted: true,
              serialNumber: status.serialNumber,
              submittedAt: status.submittedAt,
              studentName: status.studentName,
            }
          : { submitted: false },
      })
    }

    // One-shot legacy → pt font-size migration. Same logic as the
    // admin template endpoint so the public preview, the admin
    // preview, and the printed batch all share the same fontSize unit.
    let template = await getTemplateForClass(cls.id)
    if (template) {
      const { migrated, data } = migrateTemplateToPt(template as any)
      if (migrated && data) {
        try {
          template = await prisma.template.update({
            where: { id: template.id },
            data: {
              frontLayout: (data as any).frontLayout,
              backLayout: (data as any).backLayout,
              fieldMappings: (data as any).fieldMappings,
              backFieldMappings: (data as any).backFieldMappings,
              printConfig: (data as any).printConfig,
            },
          })
        } catch (e) {
          console.error("Public per-class: font-size migration persist failed (non-fatal):", e)
          template = data as any
        }
      }
    }

    // fieldConfig is auto-synced from Excel on every import — it has the EXACT Excel column
    // names as labels (e.g. "GR NO", "House", "MOBILE") and the correct stored data keys.
    // Use it as the primary form field source so the public form always matches the school's
    // Excel exactly.  Fall back to deriving from fieldMappings only for JPG-template-only
    // schools that have never imported an Excel.
    const rawMappings = (template?.fieldMappings || []) as any[]
    const rawFieldConf = (template?.fieldConfig || []) as any[]

    // Keys/labels that students should not fill in (system-managed or auto-filled)
    const FORM_SKIP_KEYS = new Set(["class", "classSection", "classGrade", "division", "photoUrl", "srNo", "photoId"])
    const FORM_SKIP_LABELS = new Set(["class", "class-section", "photo url", "photourl", "no", "no.", "photo no", "photo no.", "photo id", "photo number"])

    // ─────────────────────────────────────────────────────────────────────
    // Form-field derivation. When the school already has student data,
    // we REBUILD the form's field list directly from the keys present
    // in that data — using each key as both the form key AND label —
    // so the public form's labels match the admin table headers
    // verbatim (e.g. "GR NO", "MOBILE", "Address", "Name", "House").
    // No aliasing, no relabelling, no extra fields. New submissions
    // therefore slot perfectly into the existing columns.
    //
    // Auto-managed keys (`NO`, `PHOTO NO.`, `class`, `photoUrl`, …) are
    // filtered out by buildFormFields() so the parent never sees them.
    //
    // For brand-new schools with no submissions yet we fall back to the
    // template's fieldConfig / fieldMappings.
    // ─────────────────────────────────────────────────────────────────────
    const templateFallback: FormField[] = []
    if (rawFieldConf.length > 0) {
      for (const f of rawFieldConf) {
        if (FORM_SKIP_KEYS.has(f.key)) continue
        if (FORM_SKIP_LABELS.has((f.label || "").toLowerCase().trim())) continue
        const k = (f.key || "").toLowerCase()
        const l = (f.label || "").toLowerCase()
        let formType: string = f.type || "text"
        if (k === "phone" || k.includes("mob") || l.includes("mobile") || l.includes("phone")) formType = "tel"
        const role = f.role || inferFieldRole(f.key, f.label)
        templateFallback.push({ key: f.key, label: f.label, type: formType, required: true, role })
      }
    } else if (rawMappings.length > 0) {
      for (const m of rawMappings) {
        if (m.type === "photo") continue
        const k = (m.fieldKey || "").toLowerCase()
        let formType = "text"
        if (k.includes("phone") || k.includes("mob") || k === "mob_father" || k === "mother_phone") formType = "tel"
        const role = inferFieldRole(m.fieldKey, m.label)
        templateFallback.push({ key: m.fieldKey, label: m.label, type: formType, required: true, role })
      }
    }

    let resolvedFieldConfig: FormField[] = []
    try {
      resolvedFieldConfig = await buildFormFields(cls.school.id, templateFallback)
    } catch (e) {
      console.error("buildFormFields failed (non-fatal):", e)
      resolvedFieldConfig = templateFallback
    }

    // Merge semantic roles from template onto data-derived keys, then sort
    // fields into a parent-friendly order (name → parents → address → mobile…).
    const roleByKey = Object.fromEntries(
      templateFallback.map(f => [f.key, f.role || inferFieldRole(f.key, f.label)])
    )
    resolvedFieldConfig = sortFieldsByRole(
      resolvedFieldConfig.map(f => ({
        ...f,
        role: roleByKey[f.key] || getFieldRole(f.key, f.label),
      }))
    )

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

    const classOptions = parseClassOptions(cls.classOptions)
    const usesClassPicker = sectionUsesClassPicker(classOptions)

    return NextResponse.json({
      success: true,
      data: {
        schoolName: cls.school.name,
        schoolLogo: cls.school.logoUrl,
        className: cls.name,
        sectionName: cls.name,
        schoolId: cls.school.id,
        classId: cls.id,
        usesClassPicker,
        classOptions,
        divisions: usesClassPicker ? [...DIVISIONS] : [],
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
        // Fixed branch option
        fixedBranch: (template?.printConfig as any)?.fixedBranch || "",
      },
    })
  } catch (error) {
    console.error("GET /api/submit/[token] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
