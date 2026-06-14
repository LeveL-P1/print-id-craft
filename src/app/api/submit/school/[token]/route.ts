import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildFormFields, type FormField } from "@/lib/submit-fields"
import { migrateTemplateToPt } from "@/lib/font-size-units"
import { getDefaultTemplate } from "@/lib/template-resolver"
import { parseClassOptions, sectionUsesClassPicker } from "@/lib/section-class"

/**
 * Public GET — resolves a school-wide registration token to the school
 * info, its active classes (so the parent can pick from a dropdown),
 * and the same field/template metadata the per-class submit endpoint
 * exposes. Replaces per-class link sharing.
 */
export async function GET(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const school = await prisma.school.findUnique({
      where: { linkToken: params.token },
      include: {
        classes: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, expiresAt: true, classOptions: true },
        },
      },
    })

    if (!school) {
      return NextResponse.json({ error: "Invalid link", code: "INVALID" }, { status: 404 })
    }

    if (!school.linkActive) {
      return NextResponse.json({ error: "This link is closed", code: "CLOSED" }, { status: 410 })
    }

    if (school.linkExpiresAt && new Date() > school.linkExpiresAt) {
      return NextResponse.json({ error: "This link has expired", code: "EXPIRED" }, { status: 410 })
    }

    // One-shot legacy → pt font-size migration (idempotent — see lib/font-size-units.ts).
    let template = await getDefaultTemplate(school.id)
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
          console.error("Public school-wide: font-size migration persist failed (non-fatal):", e)
          template = data as any
        }
      }
    }
    const rawMappings = (template?.fieldMappings || []) as any[]
    const rawFieldConf = (template?.fieldConfig || []) as any[]

    // Same skip rules as the per-class endpoint — keeps behaviour consistent.
    const FORM_SKIP_KEYS = new Set(["class", "classSection", "classGrade", "division", "photoUrl", "srNo", "photoId"])
    const FORM_SKIP_LABELS = new Set([
      "class", "class-section", "photo url", "photourl",
      "no", "no.", "photo no", "photo no.", "photo id", "photo number",
    ])

    // Build the public form's field list directly from the most-frequent
    // keys in actual student data so labels match the admin table
    // verbatim ("GR NO", "MOBILE", "Address", "Name", "House", …) and
    // submissions slot into the same columns. Auto-managed keys are
    // filtered out by buildFormFields(). For brand-new schools we fall
    // back to the template's fieldConfig / fieldMappings.
    const templateFallback: FormField[] = []
    if (rawFieldConf.length > 0) {
      for (const f of rawFieldConf) {
        if (FORM_SKIP_KEYS.has(f.key)) continue
        if (FORM_SKIP_LABELS.has((f.label || "").toLowerCase().trim())) continue
        const k = (f.key || "").toLowerCase()
        const l = (f.label || "").toLowerCase()
        let formType: string = f.type || "text"
        if (k === "phone" || k.includes("mob") || l.includes("mobile") || l.includes("phone")) formType = "tel"
        templateFallback.push({ key: f.key, label: f.label, type: formType, required: true })
      }
    } else if (rawMappings.length > 0) {
      for (const m of rawMappings) {
        if (m.type === "photo") continue
        const k = (m.fieldKey || "").toLowerCase()
        let formType = "text"
        if (k.includes("phone") || k.includes("mob") || k === "mob_father" || k === "mother_phone") formType = "tel"
        templateFallback.push({ key: m.fieldKey, label: m.label, type: formType, required: true })
      }
    }

    let resolvedFieldConfig: FormField[] = []
    try {
      resolvedFieldConfig = await buildFormFields(school.id, templateFallback)
    } catch (e) {
      console.error("buildFormFields failed (non-fatal):", e)
      resolvedFieldConfig = templateFallback
    }

    // House/flag colour vocabulary (same as per-class endpoint).
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
          where: { schoolId: school.id },
          select: { formData: true },
        })
        for (const s of otherStudents) {
          const fd = (s.formData as Record<string, string> | null) || {}
          for (const k of FLAG_KEYS) {
            const v = (fd[k] || "").trim()
            if (v) flagColorSet.add(v)
          }
        }
      } catch { /* non-fatal */ }
    }
    const flagColors = Array.from(flagColorSet).sort((a, b) => a.localeCompare(b))

    return NextResponse.json({
      success: true,
      data: {
        schoolName: school.name,
        schoolLogo: school.logoUrl,
        schoolId: school.id,
        // Class dropdown — parent picks one before submitting.
        classes: school.classes.map(c => ({
          id: c.id,
          name: c.name,
          classOptions: parseClassOptions(c.classOptions),
          usesClassPicker: sectionUsesClassPicker(c.classOptions),
          // Drop classes whose individual expiry has passed even if the
          // school link itself is still active.
          expired: !!(c.expiresAt && new Date() > c.expiresAt),
        })).filter(c => !c.expired)
          .map(({ id, name, classOptions, usesClassPicker }) => ({
            id,
            name,
            classOptions,
            usesClassPicker,
          })),
        fieldConfig: resolvedFieldConfig,
        frontLayout: template?.frontLayout || [],
        backLayout: template?.backLayout || [],
        cardWidthMm: template?.cardWidthMm || 85.6,
        cardHeightMm: template?.cardHeightMm || 54.0,
        orientation: template?.orientation || "LANDSCAPE",
        templateImageUrl: template?.templateImageUrl || null,
        fieldMappings: rawMappings,
        photoBgColor: template?.photoBgColor || "#FFFFFF",
        flagColors,
      },
    })
  } catch (error) {
    console.error("GET /api/submit/school/[token] error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
