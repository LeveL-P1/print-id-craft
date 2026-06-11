import { prisma } from "@/lib/prisma"

// In-memory fallback used only when the DB limiter is unavailable.
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
  const cfIp = request.headers.get("cf-connecting-ip")
  if (cfIp) return cfIp.trim()
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return "127.0.0.1"
}

export async function durableRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000
): Promise<{ success: boolean; remaining: number }> {
  const now = new Date()
  const resetAt = new Date(now.getTime() + windowMs)

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const current = await tx.rateLimit.findUnique({
        where: { key: identifier },
      })

      if (!current || current.resetAt < now) {
        return tx.rateLimit.upsert({
          where: { key: identifier },
          create: { key: identifier, count: 1, resetAt },
          update: { count: 1, resetAt },
        })
      }

      return tx.rateLimit.update({
        where: { key: identifier },
        data: { count: { increment: 1 } },
      })
    })

    const count = entry.count
    return {
      success: count <= maxRequests,
      remaining: Math.max(maxRequests - count, 0),
    }
  } catch (error: any) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Durable rate limiter unavailable; using memory fallback:", error?.message)
    }
    return rateLimit(identifier, maxRequests, windowMs)
  }
}
