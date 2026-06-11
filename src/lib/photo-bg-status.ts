export type PhotoBgStatus = "" | "PLAIN" | "PROCESSED" | "SKIPPED" | "REPROCESSED"

export const PHOTO_BG_STATUS = {
  PLAIN: "PLAIN",
  PROCESSED: "PROCESSED",
  SKIPPED: "SKIPPED",
  REPROCESSED: "REPROCESSED",
} as const satisfies Record<string, PhotoBgStatus>
