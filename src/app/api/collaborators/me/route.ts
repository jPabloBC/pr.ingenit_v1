import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeText } from '@/lib/normalize'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as any
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authId = session.user.id
    const email = session.user.email

    // Try to find collaborator by auth_id first (more reliable), then fall back to email
    let data: any = null
    try {
      // 1) try matching by auth_id (external provider id) — column may not exist
      if (authId) {
        try {
          const byAuth = await supabaseAdmin
            .from('pr_collaborators')
            .select('*')
            .eq('auth_id', String(authId))
            .maybeSingle()
          if (byAuth.error) throw byAuth.error
          data = byAuth.data
        } catch (qErr: any) {
          if (qErr && qErr.code === '42703') {
          } else {
            throw qErr
          }
        }
      }

      // 2) if not found, try matching by user_id (internal pr_users.id)
      if (!data && session?.user?.id) {
        try {
          const byUserId = await supabaseAdmin
            .from('pr_collaborators')
            .select('*')
            .eq('user_id', String(session.user.id))
            .maybeSingle()
          if (byUserId.error) throw byUserId.error
          data = byUserId.data
        } catch (qErr: any) {
          if (qErr && qErr.code === '42703') {
          } else {
            throw qErr
          }
        }
      }

      // 3) fallback: try matching by email
      if (!data && email) {
        try {
          const byEmail = await supabaseAdmin
            .from('pr_collaborators')
            .select('*')
            .eq('email', String(email))
            .maybeSingle()
          if (byEmail.error) throw byEmail.error
          data = byEmail.data
        } catch (qErr: any) {
          if (qErr && qErr.code === '42703') {
          } else {
            throw qErr
          }
        }
      }
    } catch (dbErr) {
      console.error('DB error in /api/collaborators/me lookup:', dbErr)
      return NextResponse.json({ error: String(dbErr) }, { status: 500 })
    }
    if (!data) return NextResponse.json({})

    // normalize specialty similar to collaborators API
    const normalizeCandidateSpecialty = (val: any) => {
      if (val == null) return ''
      if (Array.isArray(val)) return normalizeText(val.join(', '))
      if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return normalizeText(parsed.join(', ')) } catch {}
        return normalizeText(val)
      }
      try { return normalizeText(String(val)) } catch { return '' }
    }

    return NextResponse.json({ collaborator: { ...data, specialty: normalizeCandidateSpecialty(data.specialty || data.specialidad) } })
  } catch (err) {
    console.error('Error GET /api/collaborators/me', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
