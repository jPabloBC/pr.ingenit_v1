import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Consulta el estado de sesión del colaborador por id
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const collaboratorId = searchParams.get('id')
  if (!collaboratorId) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('pr_collaborators')
    .select('id, last_activity, is_online')
    .eq('id', collaboratorId)
    .maybeSingle()
  if (error || !data) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json({
    id: data.id,
    last_activity: data.last_activity,
    is_online: data.is_online
  })
}
