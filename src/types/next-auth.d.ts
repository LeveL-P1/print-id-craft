import { DefaultSession, DefaultUser } from "next-auth"
import { JWT, DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      schoolId: string | null
      classId: string | null
      isMainTeacher: boolean
      name: string
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    id: string
    role: string
    schoolId: string | null
    classId: string | null
    isMainTeacher: boolean
    name: string
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    role: string
    schoolId: string | null
    classId: string | null
    isMainTeacher: boolean
    name: string
  }
}
