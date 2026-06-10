/**
 * Unified storage adapter.
 * 
 * When STORAGE_MODE=local  → uses local filesystem (offline mode)
 * When STORAGE_MODE=supabase (or unset) → uses Supabase cloud storage
 * 
 * All API routes should import from here instead of directly from supabase.ts
 */

import { isOfflineMode, localUpload, localDelete, localPublicUrl, localList, localDownload } from "./local-storage"

// Re-export everything from supabase for backward compatibility
export { supabase, supabaseClient, validateImageFile } from "./supabase"

/**
 * Upload a file — routes to local or Supabase storage based on STORAGE_MODE
 */
export async function storageUpload(
  bucket: string,
  filePath: string,
  file: Buffer | ArrayBuffer | Blob,
  options?: { contentType?: string; upsert?: boolean }
): Promise<{ data: { path: string } | null; error: any }> {
  if (isOfflineMode()) {
    return localUpload(bucket, filePath, file, options)
  }

  // Supabase path
  const { uploadWithRetry } = await import("./supabase")
  return uploadWithRetry(bucket, filePath, file, options)
}

/**
 * Delete file(s) — routes to local or Supabase storage
 */
export async function storageDelete(
  bucket: string,
  filePaths: string[]
): Promise<{ error: any }> {
  if (isOfflineMode()) {
    return localDelete(bucket, filePaths)
  }

  const { supabase } = await import("./supabase")
  const { error } = await supabase.storage.from(bucket).remove(filePaths)
  return { error }
}

export async function storageDownload(
  bucket: string,
  filePath: string
): Promise<{ data: Buffer | null; error: any }> {
  if (isOfflineMode()) {
    return localDownload(bucket, filePath)
  }

  const { supabase } = await import("./supabase")
  const { data, error } = await supabase.storage.from(bucket).download(filePath)
  if (error || !data) return { data: null, error }
  return { data: Buffer.from(await data.arrayBuffer()), error: null }
}

/**
 * Get a public URL for a stored file
 */
export function storagePublicUrl(bucket: string, filePath: string): string {
  if (isOfflineMode()) {
    return localPublicUrl(bucket, filePath)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`
}

export async function storageSignedUrl(
  bucket: string,
  filePath: string,
  expiresIn = 60 * 60
): Promise<string> {
  if (isOfflineMode()) {
    return localPublicUrl(bucket, filePath)
  }

  const { getSignedUrl } = await import("./supabase")
  return getSignedUrl(bucket, filePath, expiresIn)
}

/**
 * List files in a bucket directory
 */
export async function storageList(
  bucket: string,
  dirPath: string = ""
): Promise<{ data: { name: string }[] | null; error: any }> {
  if (isOfflineMode()) {
    return localList(bucket, dirPath)
  }

  const { supabase } = await import("./supabase")
  const { data, error } = await supabase.storage.from(bucket).list(dirPath, { limit: 1000 })
  if (error) return { data: null, error }
  return { data: (data || []).map(d => ({ name: d.name })), error: null }
}

/**
 * Ensure the storage bucket exists (no-op for local mode)
 */
export async function ensureBucket(bucketName: string = "student-photos"): Promise<boolean> {
  if (isOfflineMode()) {
    // Local storage creates directories on-the-fly
    return true
  }

  const { ensureStorageBucket } = await import("./supabase")
  return ensureStorageBucket(bucketName)
}
