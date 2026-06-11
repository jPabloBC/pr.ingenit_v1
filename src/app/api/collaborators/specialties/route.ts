import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { normalizeText } from '../../../../lib/normalize'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const companyId = session.user.companyId

    const { data, error } = await supabaseAdmin
      .from('pr_collaborators')
      .select('specialty')
      .eq('company_id', companyId)

    if (error) {
      console.error('Error fetching specialties:', error)
      return NextResponse.json({ error: 'Error al obtener especialidades' }, { status: 500 })
    }

    const set = new Set<string>()
    ;(data || []).forEach((row: any) => {
      const raw = row && (row.specialty || row.specialidad || '')
      if (raw == null) return
      if (Array.isArray(raw)) {
        const joined = raw.join(', ')
        const n = normalizeText(String(joined))
        if (n) set.add(n)
      } else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            const n = normalizeText(parsed.join(', '))
            if (n) set.add(n)
            return
          }
        } catch {}
        const n = normalizeText(raw)
        if (n) set.add(n)
      } else {
        const n = normalizeText(String(raw))
        if (n) set.add(n)
      }
    })

    const list = Array.from(set).sort((a, b) => a.localeCompare(b))
    return NextResponse.json(list)
  } catch (e) {
    console.error('Error in specialties API:', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
