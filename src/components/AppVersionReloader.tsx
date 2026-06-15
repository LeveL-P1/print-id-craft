"use client"

import { useEffect, useRef } from "react"
import { APP_BUILD_ID } from "@/lib/app-build-id"

const CHECK_INTERVAL_MS = 60_000

async function clearBrowserCaches() {
  if (typeof window === "undefined") return
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map((key) => window.caches.delete(key)))
    }
  } catch {
    // Cache clearing is best-effort; reload still fetches the new HTML shell.
  }
}

export default function AppVersionReloader() {
  const reloadingRef = useRef(false)

  useEffect(() => {
    if (!APP_BUILD_ID || APP_BUILD_ID === "dev-local") return

    const checkForUpdate = async () => {
      if (reloadingRef.current || document.visibilityState === "hidden") return
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        })
        if (!res.ok) return
        const data = await res.json()
        const latestBuildId = String(data?.buildId || "")
        if (!latestBuildId || latestBuildId === APP_BUILD_ID) return

        reloadingRef.current = true
        await clearBrowserCaches()
        window.location.reload()
      } catch {
        // Ignore transient network failures; the next poll/focus event retries.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }

    const timer = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS)
    window.addEventListener("focus", checkForUpdate)
    document.addEventListener("visibilitychange", onVisible)
    void checkForUpdate()

    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", checkForUpdate)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return null
}
