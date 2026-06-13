import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

const AUTH_DEBUG = process.env.AUTH_DEBUG === "1"
const authDebug = (message: string) => {
  if (AUTH_DEBUG) console.log(message)
}
const authWarn = (message: string, debugMessage?: string) => {
  console.error(AUTH_DEBUG && debugMessage ? debugMessage : message)
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        expectedRole: { label: "Role", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          authWarn("[AUTH] Missing credentials")
          throw new Error("Invalid credentials")
        }

        const email = credentials.email.toLowerCase()
        authDebug(`[AUTH] Attempting login for: ${email} (Expected Role: ${credentials.expectedRole})`)

        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user) {
          authWarn("[AUTH] User not found", `[AUTH] User not found: ${email}`)
          throw new Error("User not found")
        }

        if (!user.password) {
          authWarn("[AUTH] User has no password set", `[AUTH] User has no password set: ${email}`)
          throw new Error("User not found")
        }

        const isMatch = await bcrypt.compare(credentials.password, user.password)

        if (!isMatch) {
          authWarn("[AUTH] Incorrect password", `[AUTH] Incorrect password for: ${email}`)
          throw new Error("Incorrect password")
        }

        authDebug(`[AUTH] User authenticated: ${email} (Actual Role: ${user.role})`)

        // Strict role validation — block cross-portal login
        if (credentials.expectedRole && user.role !== credentials.expectedRole) {
          authWarn("[AUTH] Role mismatch", `[AUTH] Role mismatch for ${email}. Expected: ${credentials.expectedRole}, Actual: ${user.role}`)
          if (credentials.expectedRole === "TEACHER" && user.role === "MANUFACTURER") {
            throw new Error("This is the Teacher Login portal. Manufacturer accounts cannot login here.")
          }
          if (credentials.expectedRole === "MANUFACTURER" && user.role === "TEACHER") {
            throw new Error("This is the Manufacturer portal. Teacher accounts cannot login here.")
          }
          throw new Error("Invalid login portal for this account type")
        }

        authDebug(`[AUTH] Login successful for: ${email}`)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          schoolId: user.schoolId,
          classId: user.classId,
          isMainTeacher: user.isMainTeacher,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.schoolId = user.schoolId
        token.classId = (user as any).classId
        token.isMainTeacher = (user as any).isMainTeacher
        token.name = user.name
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.schoolId = (token.schoolId as string) || null
        session.user.classId = (token.classId as string) || null
        session.user.isMainTeacher = (token.isMainTeacher as boolean) || false
        session.user.name = token.name as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
}
