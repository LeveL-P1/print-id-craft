import fs from "fs"
import { createWriteStream } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type JSZip from "jszip"
import { isOfflineMode, localUploadFromFile } from "@/lib/local-storage"
import { storageUpload } from "@/lib/storage"
import { EXPORT_ZIP_COMPRESSION_LEVEL } from "./constants"

function streamZipToFile(zip: JSZip, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destination)
    zip
      .generateNodeStream({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: EXPORT_ZIP_COMPRESSION_LEVEL },
        streamFiles: true,
      })
      .pipe(output)
      .on("finish", () => resolve())
      .on("error", reject)
  })
}

export async function uploadExportZip(
  bucket: string,
  storagePath: string,
  zip: JSZip,
  jobId: string
): Promise<{ bytes: number; error: { message?: string } | null }> {
  if (isOfflineMode()) {
    const tempPath = join(tmpdir(), `export-${jobId}.zip`)
    try {
      await streamZipToFile(zip, tempPath)
      const bytes = fs.statSync(tempPath).size
      const { error } = await localUploadFromFile(bucket, storagePath, tempPath, { upsert: true })
      fs.unlinkSync(tempPath)
      return { bytes, error }
    } catch (error) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      return {
        bytes: 0,
        error: { message: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: EXPORT_ZIP_COMPRESSION_LEVEL },
    streamFiles: true,
  })

  const { error } = await storageUpload(bucket, storagePath, buffer, {
    contentType: "application/zip",
    upsert: true,
  })

  return { bytes: buffer.length, error }
}
