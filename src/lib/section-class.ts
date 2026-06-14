/** Section-based registration: Class (Roman) + Division dropdowns; card shows e.g. VI - A. */

export const DIVISIONS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
] as const

export type Division = (typeof DIVISIONS)[number]

export type SectionType = "PRE_PRIMARY" | "PRIMARY" | "SECONDARY"

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  PRE_PRIMARY: "Pre Primary",
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
}

export const DEFAULT_CLASS_OPTIONS: Record<SectionType, string[]> = {
  PRE_PRIMARY: ["Nursery", "LKG", "UKG"],
  PRIMARY: ["I", "II", "III", "IV", "V"],
  SECONDARY: ["VI", "VII", "VIII", "IX", "X"],
}

/** Combine grade + division for the card placeholder (e.g. VI + B -> VI - B). */
export function formatClassSection(classGrade: string, division: string): string {
  const grade = String(classGrade || "").trim()
  const div = String(division || "").trim().toUpperCase()
  if (!grade) return div
  if (!div) return grade
  return `${grade} - ${div}`
}


export function inferSectionTypeFromName(name: string): SectionType | null {
  const n = String(name || "").toLowerCase()
  if (/pre\s*[- ]?\s*primary|preprimary/.test(n)) return "PRE_PRIMARY"
  if (/secondary/.test(n)) return "SECONDARY"
  if (/primary/.test(n)) return "PRIMARY"
  return null
}

export function resolveEffectiveClassOptions(
  classOptions: unknown,
  sectionType: SectionType | null | undefined,
  sectionName?: string
): string[] {
  const parsed = parseClassOptions(classOptions)
  if (parsed.length > 0) return parsed
  const type = sectionType || (sectionName ? inferSectionTypeFromName(sectionName) : null)
  if (type) return [...DEFAULT_CLASS_OPTIONS[type]]
  return []
}

export function resolveClassDisplayValue(fd: Record<string, string>): string {
  const grade = String(fd.classGrade || fd.CLASSGRADE || "").trim()
  const division = String(fd.division || fd.DIVISION || "").trim().toUpperCase()
  if (grade && division) return formatClassSection(grade, division)
  if (grade) return grade

  const stored = String(fd.class || fd.classSection || "").trim()
  if (stored) {
    const legacy = stored.match(/^(.+?)\s*-\s*([A-M])$/i)
    if (legacy) return formatClassSection(legacy[1].trim(), legacy[2])
    return stored
  }
  return division
}

/** True for the single combined Class - Division card placeholder. */
export function isClassDivisionFieldKey(fieldKey: string): boolean {
  const nk = String(fieldKey || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return nk === "class" || nk === "classsection" || nk === "classdivision"
}

export function resolveDivisionDisplayValue(fd: Record<string, string>): string {
  const grade = String(fd.classGrade || fd.CLASSGRADE || "").trim()
  if (grade) return ""

  const classVal = resolveClassDisplayValue(fd)
  if (classVal && /\s-\s*[A-M]$/i.test(classVal)) return ""

  return String(fd.division || fd.DIVISION || "").trim().toUpperCase()
}

export type ClassStudentCount = { label: string; count: number }
export type GradeStudentCount = { grade: string; count: number }

/** Per-section student counts grouped by full class label (e.g. VI - A) and by grade (e.g. VI). */
export function aggregateSectionStudentCounts(
  students: Array<{ classId: string; formData: unknown }>,
  classId: string
): { byClass: ClassStudentCount[]; byGrade: GradeStudentCount[] } {
  const byClass = new Map<string, number>()
  const byGrade = new Map<string, number>()

  for (const student of students) {
    if (student.classId !== classId) continue
    const fd = (student.formData || {}) as Record<string, string>
    const label = resolveClassDisplayValue(fd) || "Unassigned"
    const grade = String(fd.classGrade || fd.CLASSGRADE || "").trim()
      || label.replace(/\s*-\s*[A-M]$/i, "").trim()
      || "Unassigned"

    byClass.set(label, (byClass.get(label) || 0) + 1)
    byGrade.set(grade, (byGrade.get(grade) || 0) + 1)
  }

  const sortByLabel = <T extends { label?: string; grade?: string }>(a: T, b: T) => {
    const av = a.label || a.grade || ""
    const bv = b.label || b.grade || ""
    return av.localeCompare(bv, undefined, { numeric: true })
  }

  return {
    byClass: Array.from(byClass.entries())
      .map(([label, count]) => ({ label, count }))
      .sort(sortByLabel),
    byGrade: Array.from(byGrade.entries())
      .map(([grade, count]) => ({ grade, count }))
      .sort(sortByLabel),
  }
}

export function parseClassOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(String).map((s) => s.trim()).filter(Boolean)
}

export function sectionUsesClassPicker(classOptions: unknown): boolean {
  return parseClassOptions(classOptions).length > 0
}

export function isValidDivision(value: string): value is Division {
  return (DIVISIONS as readonly string[]).includes(value.toUpperCase())
}

export type ClassFormValidation =
  | { ok: true; class: string; classGrade: string; division: string }
  | { ok: false; error: string }

/**
 * Resolve the value stored in formData.class at submit time.
 * Legacy sections (empty classOptions) keep the fixed section name.
 */
export function validateAndBuildClassFields(
  formData: Record<string, string>,
  sectionName: string,
  classOptions: unknown,
  sectionType?: SectionType | null
): ClassFormValidation {
  const options = resolveEffectiveClassOptions(classOptions, sectionType, sectionName)
  if (options.length === 0) {
    return { ok: true, class: sectionName.trim(), classGrade: "", division: "" }
  }

  const classGrade = String(formData.classGrade || "").trim()
  const division = String(formData.division || "").trim().toUpperCase()

  if (!classGrade) {
    return { ok: false, error: "Please select a class." }
  }
  if (!division) {
    return { ok: false, error: "Please select a division." }
  }
  if (!options.includes(classGrade)) {
    return { ok: false, error: "Invalid class selection." }
  }
  if (!isValidDivision(division)) {
    return { ok: false, error: "Invalid division selection." }
  }

  return {
    ok: true,
    class: formatClassSection(classGrade, division),
    classGrade,
    division,
  }
}