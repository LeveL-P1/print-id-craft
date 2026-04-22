import fs from "fs"
import path from "path"

/**
 * Local filesystem storage adapter.
 * Drop-in replacement for Supabase Storage when running offline.
 * 
 * Files are stored in: <project>/public/uploads/<bucket>/<path>
 * Served via: /api/files/<bucket>/<path>  OR  /uploads/<bucket>/<path> (static)
 */

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads")

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

// Initialize upload root on module load
ensureDir(UPLOAD_ROOT)

/**
 * Upload a file to local storage
 */
export async function localUpload(
  bucket: string,
  filePath: string,
  file: Buffer | ArrayBuffer | Blob,
  options?: { contentType?: string; upsert?: boolean }
): Promise<{ data: { path: string } | null; error: any }> {
  try {
    const fullDir = path.join(UPLOAD_ROOT, bucket, path.dirname(filePath))
    ensureDir(fullDir)

    const fullPath = path.join(UPLOAD_ROOT, bucket, filePath)

    // Check if file exists and upsert is false
    if (!options?.upsert && fs.existsSync(fullPath)) {
      return { data: null, error: { message: "File already exists" } }
    }

    let buffer: Buffer
    if (file instanceof Buffer) {
      buffer = file
    } else if (file instanceof ArrayBuffer) {
      buffer = Buffer.from(file)
    } else if (file instanceof Blob) {
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else {
      buffer = Buffer.from(file as any)
    }

    fs.writeFileSync(fullPath, buffer)
    return { data: { path: filePath }, error: null }
  } catch (e: any) {
    return { data: null, error: { message: e.message } }
  }
}

/**
 * Delete a file from local storage
 */
export async function localDelete(
  bucket: string,
  filePaths: string[]
): Promise<{ error: any }> {
  try {
    for (const filePath of filePaths) {
      const fullPath = path.join(UPLOAD_ROOT, bucket, filePath)
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
      }
    }
    return { error: null }
  } catch (e: any) {
    return { error: { message: e.message } }
  }
}

/**
 * Get the public URL for a file in local storage.
 * Returns a path relative to the app root that Next.js can serve statically.
 */
export function localPublicUrl(bucket: string, filePath: string): string {
  // Served as static files from /uploads/<bucket>/<path>
  return `/uploads/${bucket}/${filePath}`
}

/**
 * List files in a bucket directory
 */
export async function localList(
  bucket: string,
  dirPath: string = ""
): Promise<{ data: { name: string }[] | null; error: any }> {
  try {
    const fullDir = path.join(UPLOAD_ROOT, bucket, dirPath)
    if (!fs.existsSync(fullDir)) {
      return { data: [], error: null }
    }
    const entries = fs.readdirSync(fullDir)
    const files = entries
      .filter(e => fs.statSync(path.join(fullDir, e)).isFile())
      .map(name => ({ name }))
    return { data: files, error: null }
  } catch (e: any) {
    return { data: null, error: { message: e.message } }
  }
}

/**
 * Check if running in offline mode
 */
export function isOfflineMode(): boolean {
  return process.env.STORAGE_MODE === "local"
}
