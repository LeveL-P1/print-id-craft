import type { ReprocessPhotosPayload } from "../types"

type ReprocessResult = {
  processed: number
  failed: number
  skipped: number
  errors: Array<{ studentId: string; serialNumber: string; error: string }>
}

/** Server-side photo reprocess is deprecated — use the manufacturer dashboard (local AI in browser). */
export async function processReprocessPhotos(
  _jobId: string,
  _schoolId: string,
  _payload: ReprocessPhotosPayload
): Promise<ReprocessResult> {
  throw new Error(
    "Server photo reprocess is disabled. Use Process All Photos (AI Background) in the manufacturer dashboard."
  )
}
