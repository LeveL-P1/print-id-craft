import { buildPlatformBackupPayload } from "@/lib/backup/platform-export"
import { storageUpload } from "@/lib/storage"
import type { PlatformBackupPayload } from "../types"
import { EXPORT_BUCKET } from "../types"

const BACKUP_PREFIX = "backups/platform"

export type { PlatformBackupPayload }

export async function processExportPlatformBackup(jobId: string, payload: PlatformBackupPayload) {
  const includeStudents = payload.includeStudents !== false
  const dump = await buildPlatformBackupPayload(includeStudents)
  const json = JSON.stringify(dump)
  const buffer = Buffer.from(json, "utf-8")
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const fileName = `wisemelon-backup-${timestamp}.json`
  const storagePath = `${BACKUP_PREFIX}/${fileName}`

  const { error } = await storageUpload(EXPORT_BUCKET, storagePath, buffer, {
    contentType: "application/json",
    upsert: false,
  })

  if (error) {
    throw new Error(`Backup upload failed: ${error.message || String(error)}`)
  }

  return {
    fileName,
    storagePath,
    bytes: buffer.length,
    includeStudents,
    counts: dump.counts,
    jobId,
  }
}
