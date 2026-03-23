// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

// Lazy cleanup: remove expired entries (called during each rate limit check)
function cleanupExpired() {
  const now = Date.now()
  rateLimitMap.forEach((value, key) => {
    if (now > value.resetAt) {
      rateLimitMap.delete(key)
    }
  })
}

export function rateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000
): { success: boolean; remaining: number } {
  // Lazy cleanup on each call instead of setInterval (not supported in Edge/serverless)
  cleanupExpired()

  const now = Date.now()
  const entry = rateLimitMap.get(identifier)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: maxRequests - 1 }
  }

  if (entry.count >= maxRequests) {
    return { success: false, remaining: 0 }
  }

  entry.count++
  return { success: true, remaining: maxRequests - entry.count }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return "127.0.0.1"
}
