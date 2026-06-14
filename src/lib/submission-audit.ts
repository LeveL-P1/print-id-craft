import { recordEvent } from "@/lib/observability"

export type PublicSubmissionAuditStage = "ATTEMPT" | "SAVED" | "DUPLICATE"

type PublicSubmissionAuditInput = {
  stage: PublicSubmissionAuditStage
  source: "class-link" | "school-link"
  token: string
  schoolId: string
  schoolName?: string
  classId?: string | null
  sectionName?: string | null
  classValue?: string | null
  classGrade?: string | null
  division?: string | null
  studentName?: string | null
  studentId?: string | null
  serialNumber?: string | null
  photoBgStatus?: string | null
  hasPhoto?: boolean
  durationMs?: number
}

function trimText(value: string | null | undefined, max = 160) {
  const text = String(value || "").trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

export async function recordPublicSubmissionAudit(input: PublicSubmissionAuditInput) {
  const category =
    input.stage === "SAVED"
      ? "PUBLIC_SUBMISSION_RECEIVED"
      : input.stage === "DUPLICATE"
        ? "PUBLIC_SUBMISSION_DUPLICATE"
        : "PUBLIC_SUBMISSION_ATTEMPT"

  await recordEvent({
    type: "MAINTENANCE",
    severity: input.stage === "DUPLICATE" ? "WARNING" : "INFO",
    message:
      input.stage === "SAVED"
        ? "Public submission saved"
        : input.stage === "DUPLICATE"
          ? "Duplicate public submission blocked"
          : "Public submission attempt received",
    schoolId: input.schoolId,
    metadata: {
      category,
      stage: input.stage,
      source: input.source,
      token: input.token,
      schoolName: trimText(input.schoolName),
      classId: input.classId || undefined,
      sectionName: trimText(input.sectionName),
      classValue: trimText(input.classValue),
      classGrade: trimText(input.classGrade),
      division: trimText(input.division),
      studentName: trimText(input.studentName),
      studentId: input.studentId || undefined,
      serialNumber: input.serialNumber || undefined,
      photoBgStatus: input.photoBgStatus || undefined,
      hasPhoto: input.hasPhoto,
      durationMs: input.durationMs,
    },
  })
}
