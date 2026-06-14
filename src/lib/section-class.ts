/** Section-based registration: Class (Roman) + Division dropdowns; card shows e.g. VII-A. */

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

/** Combine grade + division for the Class placeholder (e.g. VI + A → VI-A). */
export function formatClassSection(classGrade: string, division: string): string {
  const grade = String(classGrade || "").trim()
  const div = String(division || "").trim().toUpperCase()
  if (!grade) return div
  if (!div) return grade
  return `${grade}-${div}`
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
  classOptions: unknown
): ClassFormValidation {
  const options = parseClassOptions(classOptions)
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
