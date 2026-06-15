import { getFieldRole } from "@/lib/field-resolver"

export type FixedBranchField = {
  key: string
  label: string
  role?: string
}

/** Inject the template's fixed branch into every branch-shaped form key. */
export function applyFixedBranchToFormData(
  formData: Record<string, unknown>,
  fixedBranch: string | undefined,
  fields: FixedBranchField[]
): Record<string, string> {
  const trimmed = (fixedBranch || "").trim()
  const fd = Object.fromEntries(
    Object.entries(formData || {}).map(([key, value]) => [key, String(value ?? "").trim()])
  ) as Record<string, string>
  if (!trimmed) return fd

  const out: Record<string, string> = { ...fd, branch: trimmed }
  for (const field of fields) {
    if (getFieldRole(field.key, field.label, field.role) === "branch") {
      out[field.key] = trimmed
    }
  }
  return out
}
