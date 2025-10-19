import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { supabase } from './supabaseClient'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Autenticar con Supabase Auth
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: credentials.email,
            password: credentials.password
          })

          if (authError) {
            return null
          }

          if (!authData.user) {
            return null
          }

          // Buscar usuario en pr_users usando el auth_id
          const { data: users, error: userError } = await supabase
            .from('pr_users')
            .select('id, email, name, role, company_id')
            .eq('auth_id', authData.user.id)
            .limit(1)

          if (userError) {
            return null
          }

          if (!users || users.length === 0) {
            return null
          }

          const user = users[0]

          // Buscar empresa del usuario
          const { data: companies, error: companyError } = await supabase
            .from('pr_companies')
            .select('id, name')
            .eq('id', user.company_id)
            .limit(1)

          if (companyError) {
            return null
          }

          if (!companies || companies.length === 0) {
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            role: user.role,
            companyId: companies[0].id,
            companyName: companies[0].name
          }
        } catch (error) {
          return null
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.companyId = user.companyId
        token.companyName = user.companyName
      }
      return token
    },
    session: async ({ session, token }) => {
      if (token) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.companyId = token.companyId
        session.user.companyName = token.companyName
      }
      return session
    }
  }
}