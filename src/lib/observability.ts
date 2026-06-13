import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/prisma"
import type { EventSeverity, SystemEventType } from "@prisma/client"

type EventInput = {
  type: SystemEventType
  severity?: EventSeverity
  message: string
  schoolId?: string | null
  userId?: string | null
  metadata?: Record<string, any>
}

export function captureError(error: unknown, context?: Record<string, any>) {
  try {
    Sentry.captureException(error, { extra: context })
  } catch (captureError) {
    console.error("Failed to capture error:", captureError)
  }
}

export async function recordEvent(input: EventInput) {
  try {
    await prisma.systemEvent.create({
      data: {
        type: input.type,
        severity: input.severity || "INFO",
        message: input.message,
        schoolId: input.schoolId || null,
        userId: input.userId || null,
        metadata: input.metadata || undefined,
      },
    })
  } catch (error) {
    console.error("Failed to record system event:", error)
  }
}

export async function reportError(
  error: unknown,
  event: Omit<EventInput, "message"> & { message?: string }
) {
  const message = event.message || (error instanceof Error ? error.message : "Unknown error")
  captureError(error, event.metadata)
  await recordEvent({
    ...event,
    severity: event.severity || "ERROR",
    message,
    metadata: {
      ...event.metadata,
      error: error instanceof Error ? error.message : String(error),
    },
  })
}

export async function reportSlowOperation(input: {
  name: string
  durationMs: number
  thresholdMs: number
  schoolId?: string | null
  userId?: string | null
  metadata?: Record<string, any>
}) {
  if (input.durationMs < input.thresholdMs) return

  const metadata = {
    ...input.metadata,
    durationMs: Math.round(input.durationMs),
    thresholdMs: input.thresholdMs,
  }

  try {
    Sentry.addBreadcrumb({
      category: "performance",
      level: "warning",
      message: `${input.name} took ${Math.round(input.durationMs)}ms`,
      data: metadata,
    })
  } catch (error) {
    console.error("Failed to add performance breadcrumb:", error)
  }

  await recordEvent({
    type: "MAINTENANCE",
    severity: "WARNING",
    message: `Slow operation: ${input.name}`,
    schoolId: input.schoolId || null,
    userId: input.userId || null,
    metadata,
  })
}
