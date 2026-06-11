import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabase } from '../../../../lib/supabaseClient'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Obtener datos del usuario desde pr_users
    const { data: userData, error: userError } = await supabase
      .from('pr_users')
      .select('id, email, name, role, company_id, created_at, updated_at')
      .eq('id', session.user.id)
      .single()

    if (userError) {
      console.error('Error al obtener datos del usuario:', userError)
      return NextResponse.json({ error: 'Error al obtener datos del usuario' }, { status: 500 })
    }

    if (!userData) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    return NextResponse.json(userData)
  } catch (error) {
    console.error('Error en API de perfil:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

