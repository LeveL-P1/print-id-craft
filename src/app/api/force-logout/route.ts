import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET() {
  const cookieStore = await cookies()
  
  // Clear all possible NextAuth cookies
  const cookiesToClear = [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "__Host-next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.callback-url"
  ]

  cookiesToClear.forEach((name) => {
    if (cookieStore.has(name)) {
      cookieStore.set(name, "", { maxAge: 0, path: "/" })
    }
  })

  // Redirect to login page
  return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "http://localhost:3000"))
}
