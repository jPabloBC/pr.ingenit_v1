import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const normalizeIdentity = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toUpperCase()

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener datos del usuario desde pr_users
    const { data: userData, error: userError } = await supabaseAdmin
      .from('pr_users')
      .select('id, email, first_name, last_name, role, company_id, created_at, updated_at')
      .eq('id', session.user.id)
      .single()

    if (userError) {
      console.error('Error al obtener datos del usuario:', userError)
      return NextResponse.json({ error: 'Error al obtener datos del usuario' }, { status: 500 })
    }

    if (!userData) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    let collaborator: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null = null

    const byUserId = await supabaseAdmin
      .from('pr_collaborators')
      .select('first_name, last_name, phone')
      .eq('user_id', userData.id)
      .eq('company_id', userData.company_id)
      .maybeSingle()

    if (!byUserId.error && byUserId.data) {
      collaborator = byUserId.data
    }

    if (!collaborator && userData.email) {
      const normalizedEmail = String(userData.email).trim()
      let byEmailQuery = supabaseAdmin
        .from('pr_collaborators')
        .select('first_name, last_name, phone')
        .ilike('email', normalizedEmail)

      if (userData.company_id) {
        byEmailQuery = byEmailQuery.eq('company_id', userData.company_id)
      }

      const byEmail = await byEmailQuery.limit(1).maybeSingle()
      if (!byEmail.error && byEmail.data) {
        collaborator = byEmail.data
      }
    }

    const userFullName = `${String(userData.first_name || '').trim()} ${String(userData.last_name || '').trim()}`.trim()

    if (!collaborator && userData.company_id && userFullName) {
      const normalizedUserName = normalizeIdentity(userFullName)
      const candidates = await supabaseAdmin
        .from('pr_collaborators')
        .select('first_name, last_name, phone')
        .eq('company_id', userData.company_id)

      if (!candidates.error && normalizedUserName) {
        const exactMatches = (candidates.data || []).filter((candidate) =>
          normalizeIdentity(`${candidate.first_name || ''} ${candidate.last_name || ''}`) === normalizedUserName,
        )

        if (exactMatches.length === 1) {
          collaborator = exactMatches[0]
        }
      }
    }

    const resolvedFirstName = String(collaborator?.first_name || userData.first_name || '').trim()
    const resolvedLastName = String(collaborator?.last_name || userData.last_name || '').trim()
    const resolvedFullName = `${resolvedFirstName} ${resolvedLastName}`.replace(/\s+/g, ' ').trim()

    return NextResponse.json({
      ...userData,
      first_name: resolvedFirstName || null,
      last_name: resolvedLastName || null,
      name: resolvedFullName || userFullName || null,
      phone: collaborator?.phone || null,
    })
  } catch (error) {
    console.error('Error en API de perfil:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
