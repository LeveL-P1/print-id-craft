import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Use service role key on server-side for signed URL generation
// Falls back to anon key if service key not available
const serverKey = supabaseServiceKey || supabaseAnonKey

export const supabase = createClient(supabaseUrl, serverKey)

// Client-side supabase for uploads from the browser
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

// Retry wrapper for storage operations
export async function uploadWithRetry(
  bucket: string,
  path: string,
  file: Blob | Buffer | ArrayBuffer,
  options?: { contentType?: string; upsert?: boolean },
  maxRetries = 3
): Promise<{ data: any; error: any }> {
  let lastError: any = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { ...options, upsert: options?.upsert ?? true })
    if (!error) return { data, error: null }
    lastError = error
    // Exponential backoff
    if (attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500))
    }
  }
  return { data: null, error: lastError }
}

// Generate a signed URL (1-hour expiry) for private bucket access
// Falls back to public URL if signed URL generation fails
export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)
    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  } catch (e) {
    // Fallback to public URL
  }
  return getPublicUrl(bucket, path)
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// MIME type validation
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export function validateImageFile(file: { type: string; size: number }): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `Invalid file type. Allowed: JPEG, PNG, WebP. Got: ${file.type}` }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum: 5MB. Got: ${(file.size / 1024 / 1024).toFixed(1)}MB` }
  }
  return { valid: true }
}
