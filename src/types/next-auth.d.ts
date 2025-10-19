import NextAuth from 'next-auth'
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
    }
  }

  interface User {
    id: string
    email: string
    name?: string
    role: UserRole
    companyId: string
    companyName?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: UserRole
    companyId: string
    companyName?: string
  }
}