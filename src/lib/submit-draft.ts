import { APP_BUILD_ID } from "@/lib/app-build-id"

export const SUBMIT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type SubmitDraftPayload = {
  buildId: string
  formRevision: string
  formData?: Record<string, string>
  photoVerified?: boolean
  step?: string
  savedAt?: number
}

type FormRevisionField = { key: string; label?: string; role?: string }

/** Fingerprint of form shape plus fixed branch; changes when the template form changes. */
export function computeSubmitFormRevision(
  fixedBranch: string | undefined,
  fieldConfig: FormRevisionField[]
): string {
  const branch = (fixedBranch || "").trim()
  const fields = fieldConfig
    .map((f) => `${f.key}:${f.label || ""}:${f.role || ""}`)
    .sort()
    .join("|")
  return `${branch}::${fields}`
}

export type SubmitDraftStaleReason =
  | "ok"
  | "missing-build"
  | "build-mismatch"
  | "form-mismatch"
  | "expired"
  | "corrupt"

export function getSubmitDraftStaleReason(
  draft: SubmitDraftPayload | null | undefined,
  currentFormRevision?: string
): SubmitDraftStaleReason {
  if (!draft) return "ok"
  if (!draft.buildId) return "missing-build"
  if (draft.buildId !== APP_BUILD_ID) return "build-mismatch"
  if (draft.savedAt && Date.now() - draft.savedAt > SUBMIT_DRAFT_TTL_MS) return "expired"
  if (
    currentFormRevision &&
    draft.formRevision &&
    draft.formRevision !== currentFormRevision
  ) {
    return "form-mismatch"
  }
  return "ok"
}

export function parseSubmitDraft(raw: string | null): SubmitDraftPayload | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as SubmitDraftPayload
  } catch {
    return null
  }
}

export function createSubmitDraftPayload(
  data: Omit<SubmitDraftPayload, "buildId" | "savedAt">
): SubmitDraftPayload {
  return {
    ...data,
    buildId: APP_BUILD_ID,
    savedAt: Date.now(),
  }
}
