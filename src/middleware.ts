import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    if (path.startsWith("/admin") && token?.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    
    if (path.startsWith("/manufacturer") && token?.role !== "MANUFACTURER") {
      return NextResponse.redirect(new URL("/login", req.url))
    }

    if (path.startsWith("/teacher") && token?.role !== "TEACHER") {
      return NextResponse.redirect(new URL("/login", req.url))
    }

    if (path === "/" && token) {
        if (token.role === "SUPER_ADMIN") return NextResponse.redirect(new URL("/admin", req.url))
        if (token.role === "MANUFACTURER") return NextResponse.redirect(new URL("/manufacturer/schools", req.url))
        if (token.role === "TEACHER") return NextResponse.redirect(new URL("/teacher/dashboard", req.url))
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: ["/admin/:path*", "/manufacturer/:path*", "/teacher/:path*", "/"],
}
