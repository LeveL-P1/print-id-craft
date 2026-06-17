import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    // Security headers helper
    const addSecurityHeaders = (response: NextResponse) => {
      response.headers.set("X-Frame-Options", "DENY")
      response.headers.set("X-Content-Type-Options", "nosniff")
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
      response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
      response.headers.set("X-XSS-Protection", "1; mode=block")
      return response
    }

    // Manufacturer routes
    if (path.startsWith("/dashboard") || path.startsWith("/schools")) {
      if (token?.role !== "MANUFACTURER") {
        return addSecurityHeaders(NextResponse.redirect(new URL("/login", req.url)))
      }
    }

    // Teacher routes
    if (path.startsWith("/teacher")) {
      if (token?.role !== "TEACHER") {
        return addSecurityHeaders(NextResponse.redirect(new URL("/login", req.url)))
      }
    }

    // API route protection
    if (path.startsWith("/api/schools") || path.startsWith("/api/admin")) {
      // Teachers need access to certain school API routes for their dashboard:
      // /api/schools/[id]/template (card preview)
      // /api/schools/[id]/students/[sid]/flag (flag/unflag)
      // /api/schools/[id]/students/[sid]/status (approve)
      // /api/schools/[id]/export/* (CSV/Excel download)
      // Each route handler validates schoolId from session, so data isolation is enforced there.
      const teacherAllowed =
        /\/api\/schools\/[^/]+\/template/.test(path) ||
        /\/api\/schools\/[^/]+\/students\/[^/]+$/.test(path) ||
        /\/api\/schools\/[^/]+\/students\/[^/]+\/(flag|status)/.test(path) ||
        /\/api\/schools\/[^/]+\/export\//.test(path) ||
        /\/api\/schools\/[^/]+\/classes/.test(path)
      
      if (token?.role !== "MANUFACTURER" && !(token?.role === "TEACHER" && teacherAllowed)) {
        return addSecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
      }
    }

    if (path.startsWith("/api/teacher")) {
      if (token?.role !== "TEACHER") {
        return addSecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
      }
    }

    if (path.startsWith("/api/jobs/") && !path.startsWith("/api/jobs/process")) {
      if (token?.role !== "MANUFACTURER" && token?.role !== "TEACHER") {
        return addSecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
      }
    }

    // Login redirect if already authenticated
    // if the user is visiting the correct portal for their role
    if (path === "/login" && token) {
      const mode = req.nextUrl.searchParams.get("mode")
      const isAdminPortal = mode === "admin"

      if (token.role === "MANUFACTURER" && isAdminPortal) {
        return addSecurityHeaders(NextResponse.redirect(new URL("/dashboard", req.url)))
      }
      if (token.role === "TEACHER" && !isAdminPortal) {
        return addSecurityHeaders(NextResponse.redirect(new URL("/teacher/dashboard", req.url)))
      }
      // If role doesn't match the portal (e.g., manufacturer on teacher login),
      // don't redirect — let the login page handle it
    }

    // Add security headers to all responses
    const response = NextResponse.next()
    return addSecurityHeaders(response)
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        // Allow public routes without auth
        if (
          path === "/" ||
          path.startsWith("/submit/") ||
          path.startsWith("/api/submit/") ||
          path.startsWith("/api/auth/") ||
          path.startsWith("/api/health") ||
          path.startsWith("/api/jobs/process") ||
          path.startsWith("/api/admin/backup/scheduled") ||
          path === "/login"
        ) {
          return true
        }
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/schools/:path*",
    "/teacher/:path*",
    "/login",
    "/api/schools/:path*",
    "/api/teacher/:path*",
    "/api/admin/:path*",
    "/api/jobs/:path*",
  ],
}
