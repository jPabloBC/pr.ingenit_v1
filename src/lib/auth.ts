import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { supabase } from './supabaseClient'
import { supabaseAdmin } from './supabaseAdmin'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const normalizedEmail = String(credentials.email || '').trim().toLowerCase()
          const normalizedPassword = String(credentials.password || '')

          const tryPasswordSignIn = async () =>
            supabase.auth.signInWithPassword({
              email: normalizedEmail,
              password: normalizedPassword,
            })

          let { data: authData, error: authError } = await tryPasswordSignIn()
          const isRetryableFetchError =
            !!authError &&
            ((authError as any).status === 0 ||
              String((authError as any).name || '').includes('AuthRetryableFetchError') ||
              String((authError as any).message || '').toLowerCase().includes('fetch failed'))

          if (isRetryableFetchError) {
            await new Promise((resolve) => setTimeout(resolve, 450))
            const retry = await tryPasswordSignIn()
            authData = retry.data
            authError = retry.error
          }

          let authUserId: string | undefined = authData?.user?.id

          if (authError || !authData.user) {
            const isStillRetryableFetchError =
              !!authError &&
              ((authError as any).status === 0 ||
                String((authError as any).name || '').includes('AuthRetryableFetchError') ||
                String((authError as any).message || '').toLowerCase().includes('fetch failed'))
            if (isStillRetryableFetchError) {
              throw new Error('AUTH_NETWORK_ERROR')
            }

            // Don't spam logs on normal "invalid credentials" responses (status 400)
            const isInvalidCreds = authError && (authError.status === 400 || authError.code === 'invalid_credentials')
            // If email provider disabled, throw specific error to surface to UI
            if (authError && authError.code === 'email_provider_disabled') {
              console.error('Supabase Auth error: email provider disabled')
                // allow a dev bypass when explicitly enabled
                if (process.env.DEV_AUTH_BYPASS === 'true' && process.env.DEV_BYPASS_SECRET) {
                  if (credentials.password === process.env.DEV_BYPASS_SECRET) {
                    try {
                      const { data: devUser, error: devUserErr } = await supabaseAdmin
                        .from('pr_users')
                        .select('id')
                        .eq('email', normalizedEmail)
                        .maybeSingle();
                      if (!devUserErr && devUser) {
                        authUserId = `dev-${devUser.id}`
                      } else {
                        console.error('Dev bypass: no pr_users row found for', normalizedEmail)
                        return null
                      }
                    } catch (e) {
                      console.error('Dev bypass lookup error:', e)
                      return null
                    }
                  } else {
                    return null
                  }
                } else {
                  // normal behavior: cannot proceed
                  return null
                }
            }
            // Log full error for debugging; still avoid noisy logs for invalid creds
            if (!isInvalidCreds) console.error('Supabase Auth error:', authError)
            else console.debug('Supabase auth returned invalid credentials for email:', normalizedEmail)
            return null
          }

          // Use admin client to bypass RLS during auth (user not yet authenticated)
          let { data: user, error: userError } = await supabaseAdmin
            .from('pr_users')
            .select('id, email, name, role, company_id')
            .eq('auth_id', authUserId)
            .maybeSingle();

          // If mapping by auth_id missing, attempt to find by email and link automatically
          if ((!user || userError) && normalizedEmail) {
            try {
              const { data: byEmail, error: byEmailErr } = await supabaseAdmin
                .from('pr_users')
                .select('id, email, name, role, company_id')
                .eq('email', normalizedEmail)
                .maybeSingle();

              if (!byEmailErr && byEmail) {
                // try to update pr_users.auth_id using admin client
                try {
                  const { error: updErr } = await supabaseAdmin
                    .from('pr_users')
                    .update({ auth_id: authData.user.id })
                    .eq('id', byEmail.id)
                  if (updErr) {
                    console.error('Failed to link pr_users.auth_id via admin client:', updErr.message)
                  } else {
                    // re-fetch the user row now that auth_id is set
                    const { data: refetched, error: refetchErr } = await supabaseAdmin
                      .from('pr_users')
                      .select('id, email, name, role, company_id')
                      .eq('auth_id', authData.user.id)
                      .maybeSingle();
                    if (!refetchErr && refetched) {
                      user = refetched
                    }
                  }
                } catch (e) {
                  console.error('Error updating pr_users auth_id:', e)
                }
              }
            } catch (e) {
              console.error('Error looking up pr_users by email during authorize:', e)
            }
          }

          if (!user || userError) {
            // Fallback: allow auth user to sign in with limited session when pr_users mapping missing
            // Support explicit dev-only accounts via DEV_SUPER_USERS env (comma separated emails)
            const devEmailsRaw = process.env.DEV_SUPER_USERS || ''
            const devEmails = devEmailsRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
            const isDevEmail = normalizedEmail && devEmails.includes(normalizedEmail)

            user = {
              id: authData.user.id,
              email: normalizedEmail,
              name: (authData.user.user_metadata as any)?.full_name || (authData.user.user_metadata as any)?.name || undefined,
              role: isDevEmail ? 'dev' : 'member',
              company_id: null
            } as any
          }

          let company: any = null
          try {
            if (user?.company_id) {
              const { data: companyData, error: companyError } = await supabaseAdmin
                .from('pr_companies')
                .select('id, name')
                .eq('id', user.company_id)
                .maybeSingle();

              if (companyError) {
                // ignore company fetch error in fallback
              }
              company = companyData || null
            }
          } catch (e) {
            company = null
          }

          // Obtener specialty del colaborador si existe
          let specialty: string | null = null
          try {
            if (user!.company_id) {
              const { data: collaborator } = await supabaseAdmin
                .from('pr_collaborators')
                .select('specialty')
                .eq('user_id', user!.id)
                .eq('company_id', user!.company_id)
                .maybeSingle()

              if (collaborator) {
                specialty = collaborator.specialty
              }
            }
          } catch (e) {
            // ignore specialty fetch errors
          }

          return {
            id: user!.id,
            email: user!.email,
            name: user!.name || undefined,
            role: user!.role,
            companyId: company?.id,
            companyName: company?.name,
            specialty: specialty
          };
        } catch (err) {
          console.error('NextAuth authorize unexpected error:', err);
          return null;
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
    jwt: async ({ token, user, trigger, session }: any) => {
      if (trigger === 'update' && session) {
        if ('projectId' in session) {
          token.projectId = session.projectId || null
        }
        if ('projectName' in session) {
          token.projectName = session.projectName || null
        }
        // Recompute permissions for the selected project so middleware and aside stay aligned.
        try {
          const role = String(token.role || '').trim().toLowerCase()
          if (role === 'dev') {
            token.permissions = ['*']
          } else {
            const selectedProjectId = token.projectId || null
            const selectedCompanyId = token.companyId || null
            const currentUserId = token.id

            if (selectedProjectId && currentUserId) {
              let projectPermsQuery = supabaseAdmin
                .from('pr_project_user_permissions')
                .select('resource_key')
                .eq('user_id', currentUserId)
                .eq('project_id', selectedProjectId)
                .eq('can_view', true)
              if (selectedCompanyId) {
                projectPermsQuery = projectPermsQuery.eq('company_id', selectedCompanyId)
              }

              const { data: projectPerms, error: projectPermsError } = await projectPermsQuery
              if (!projectPermsError && projectPerms && projectPerms.length > 0) {
                token.permissions = Array.from(
                  new Set(projectPerms.map((row: any) => row.resource_key).filter(Boolean)),
                )
                return token
              }
            }

            // Unified model: permissions are project-scoped only.
            // Without selected project, keep an empty set.
            token.permissions = []
          }
        } catch {
          // keep previous permissions if refresh fails
        }
      }

      if (user) {
        // Ensure we map to internal pr_users.id when possible so permission
        // lookups target the correct user identifier in project permission tables.
        let prUserId = user.id
        let prUserRole = user.role
        let prCompanyId = user.companyId
        let prCompanyName = user.companyName

        try {
          const { data: mapped, error: mapErr } = await supabaseAdmin
            .from('pr_users')
            .select('id, role, company_id')
            .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
            .maybeSingle()

          if (!mapErr && mapped) {
            prUserId = mapped.id
            prUserRole = mapped.role || prUserRole
            prCompanyId = mapped.company_id ?? prCompanyId
          }
        } catch (e) {
          // ignore mapping errors and fallback to provided user.id
        }

        const normalizedRole = String(prUserRole || '').trim().toLowerCase()
        if (prCompanyId && !prCompanyName) {
          try {
            const { data: company } = await supabaseAdmin
              .from('pr_companies')
              .select('name')
              .eq('id', prCompanyId)
              .maybeSingle()
            prCompanyName = company?.name || prCompanyName
          } catch {
            // keep session without company name; pages can still resolve it by companyId
          }
        }

        token.id = prUserId
        token.role = normalizedRole
        token.companyId = prCompanyId
        token.companyName = prCompanyName
        token.specialty = user.specialty || null
        // Always require project selection after a fresh login.
        token.projectId = null
        token.projectName = null

        try {
          // Grant full access only to dev role.
          if (normalizedRole === 'dev') {
            token.permissions = ['*']
          } else {
            // Unified model: permissions are selected per project after login.
            // We intentionally keep this empty until project selection updates the JWT.
            token.permissions = []
          }
        } catch (e) {
          token.permissions = []
        }
      }
      return token
    },
    session: async ({ session, token }) => {
      if (token) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.companyId = token.companyId
        session.user.companyName = token.companyName
        ;(session.user as any).specialty = token.specialty || null
        ;(session.user as any).permissions = (token.permissions as any) || []
        ;(session.user as any).projectId = token.projectId || null
        ;(session.user as any).projectName = token.projectName || null
      }
      return session
    },
    redirect: async ({ url, baseUrl }) => {
      // Respect explicit callback URLs. Fall back to project selector.
      if (url) return url
      return baseUrl + '/users/select-project'
    }
  },
  debug: false
}
