import 'next-auth'
import { UserRole } from './index'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string
      role: UserRole
      companyId: string
      companyName?: string
      specialty?: string | null
      projectId?: string | null
      projectName?: string | null
      permissions?: string[]
    }
  }

  interface User {
    id: string
    email: string
    name?: string
    role: UserRole
    companyId: string
    companyName?: string
    specialty?: string | null
    projectId?: string | null
    projectName?: string | null
    permissions?: string[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    companyId: string
    companyName?: string
    specialty?: string | null
    projectId?: string | null
    projectName?: string | null
    permissions?: string[]
  }
}
